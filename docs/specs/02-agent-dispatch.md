# Spec 02: Agent Dispatch

## Purpose

Coordinate task distribution, manage worker lifecycle, and ensure reliable task execution using Cloudflare Durable Objects.

---

## Overview

The dispatch layer acts as the central coordination point for Loom's agent system. It manages a task queue, assigns tasks to workers, tracks task state, and handles retries and failures.

---

## Context

**Position in Pipeline:**
```
01: Ingestion → [02: Dispatch] → 03: Implementation → 04: Verification → 05: PR Creation
```

**Dependencies:**
- GitHub Ingestion (enqueues tasks)
- Database Service (updates task status)
- Agent Implementation (consumes tasks)

---

## Data Structures

### Task State Machine

```typescript
enum TaskStatus {
  PENDING = 'pending',       // Created, waiting for worker
  RUNNING = 'running',       // Worker actively processing
  COMPLETED = 'completed',   // Successfully finished
  FAILED = 'failed',         // Failed (retries exhausted)
  CANCELLED = 'cancelled'    // Manually cancelled
}

type TaskState = {
  id: string
  status: TaskStatus
  issue: GitHubIssue
  attempts: number
  lastAttemptAt: Date | null
  completedAt: Date | null
  error: string | null
  metadata: Record<string, any>
}
```

### GitHub Issue (from Ingestion)

```typescript
type GitHubIssue = {
  id: number
  number: number
  title: string
  body: string | null
  labels: Array<{ name: string }>
  repository: {
    id: number
    name: string
    full_name: string
    owner: { login: string }
    clone_url: string
    default_branch: string
  }
  installation?: {
    id: number
  }
}
```

---

## Cloudflare Durable Objects

### AgentCoordinator

**Location:** `apps/api/src/durable-objects/agent-coordinator.ts`

```typescript
export class AgentCoordinator implements DurableObject {
  private ctx: DurableObjectState
  private env: Env
  private tasks: Map<string, TaskState>
  private workerQueue: string[]

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx
    this.env = env
    this.tasks = new Map()
    this.workerQueue = []

    // Restore state from storage
    this.ctx.blockConcurrencyWhile(async () => {
      const storedTasks = await this.ctx.storage.get<TaskState[]>('tasks')
      if (storedTasks) {
        for (const task of storedTasks) {
          this.tasks.set(task.id, task)
        }
      }
      this.workerQueue = await this.ctx.storage.get<string[]>('workerQueue') || []
    })
  }

  // Enqueue a new task
  async enqueue(issue: GitHubIssue): Promise<string> {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const task: TaskState = {
      id: taskId,
      status: TaskStatus.PENDING,
      issue,
      attempts: 0,
      lastAttemptAt: null,
      completedAt: null,
      error: null,
      metadata: {}
    }

    this.tasks.set(taskId, task)
    this.workerQueue.push(taskId)

    // Persist to database
    await this.ctx.storage.put(`task:${taskId}`, task)
    await this.ctx.storage.put('tasks', Array.from(this.tasks.values()))
    await this.ctx.storage.put('workerQueue', this.workerQueue)

    return taskId
  }

  // Dequeue next task for worker
  async dequeue(workerId: string): Promise<TaskState | null> {
    if (this.workerQueue.length === 0) {
      return null
    }

    const taskId = this.workerQueue.shift()
    const task = this.tasks.get(taskId)

    if (!task || task.status !== TaskStatus.PENDING) {
      return null
    }

    // Update status to RUNNING
    task.status = TaskStatus.RUNNING
    task.lastAttemptAt = new Date()
    task.metadata.workerId = workerId

    // Persist
    await this.ctx.storage.put(`task:${taskId}`, task)
    await this.ctx.storage.put('tasks', Array.from(this.tasks.values()))
    await this.ctx.storage.put('workerQueue', this.workerQueue)

    return task
  }

  // Update task status (success/failure)
  async updateStatus(
    taskId: string,
    status: TaskStatus,
    error?: string
  ): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    task.status = status
    if (status === TaskStatus.COMPLETED || status === TaskStatus.FAILED) {
      task.completedAt = new Date()
    }
    if (error) {
      task.error = error
    }

    // Persist
    await this.ctx.storage.put(`task:${taskId}`, task)
    await this.ctx.storage.put('tasks', Array.from(this.tasks.values()))
  }

  // Get task by ID
  async getTask(taskId: string): Promise<TaskState | null> {
    return this.tasks.get(taskId) || null
  }

  // Get all tasks
  async getAllTasks(): Promise<TaskState[]> {
    return Array.from(this.tasks.values())
  }

  // Retry failed task
  async retry(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    if (task.attempts >= 3) {
      throw new Error(`Task ${taskId} exceeded max retries`)
    }

    task.status = TaskStatus.PENDING
    task.attempts += 1
    task.error = null
    this.workerQueue.push(taskId)

    // Persist
    await this.ctx.storage.put(`task:${taskId}`, task)
    await this.ctx.storage.put('tasks', Array.from(this.tasks.values()))
    await this.ctx.storage.put('workerQueue', this.workerQueue)
  }
}
```

---

## Worker Implementation

### Worker Loop

**Location:** `apps/worker/src/index.ts`

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Worker entry point - runs continuously
    return runWorkerLoop(env)
  }
}

async function runWorkerLoop(env: Env): Promise<never> {
  while (true) {
    try {
      // Get coordinator DO
      const coordinatorId = env.AGENT_COORDINATOR.idFromName('global')
      const coordinator = env.AGENT_COORDINATOR.get(coordinatorId)

      // Poll for task
      const task = await coordinator.dequeue('worker-1')
      if (!task) {
        // No tasks, wait 5 seconds
        await new Promise(resolve => setTimeout(resolve, 5000))
        continue
      }

      // Update database status
      await updateTaskStatus(env.DB, task.id, 'running')

      // Execute agent workflow
      const result = await executeAgentWorkflow(task, env)

      if (result.success) {
        await coordinator.updateStatus(task.id, TaskStatus.COMPLETED)
        await updateTaskStatus(env.DB, task.id, 'completed')
        await logTaskEvent(env.DB, task.id, 'info', 'Task completed successfully')
      } else {
        await coordinator.updateStatus(task.id, TaskStatus.FAILED, result.error)
        await updateTaskStatus(env.DB, task.id, 'failed')
        await logTaskEvent(env.DB, task.id, 'error', result.error)

        // Retry if under max attempts
        if (task.attempts < 3) {
          await coordinator.retry(task.id)
        }
      }
    } catch (error) {
      console.error('Worker loop error:', error)
      await new Promise(resolve => setTimeout(resolve, 10000))
    }
  }
}
```

---

## Success Criteria

**Dispatch is successful when:**

1. **Task Enqueued**
   - Task created in Durable Object
   - Status set to `pending`
   - Task persisted to database
   - Task ID returned

2. **Task Dequeued**
   - Worker receives task from queue
   - Status updated to `running`
   - Worker ID assigned to task
   - Status persisted

3. **Task Completed**
   - Worker reports completion
   - Status updated to `completed` or `failed`
   - Completion timestamp recorded
   - Error (if any) stored

4. **Retry Logic**
   - Failed tasks retried up to 3 times
   - After 3 failures, status stays `failed`
   - Retry increments attempt counter

5. **Persistence**
   - All task state persisted to Durable Object storage
   - State survives worker restarts
   - No data loss on failures

6. **Concurrency**
   - Multiple workers can dequeue tasks
   - No duplicate task assignment
   - Worker queue is thread-safe

---

## Error Handling

### Error Types

| Error | HTTP Status | Code | Action |
|-------|-------------|------|--------|
| Task not found | 404 | `TASK_NOT_FOUND` | Return error |
| Max retries exceeded | 400 | `MAX_RETRIES_EXCEEDED` | Keep status `failed` |
| Worker unavailable | 503 | `WORKER_UNAVAILABLE` | Retry dequeue |
| Database error | 500 | `STORAGE_ERROR` | Retry operation |

### Retry Strategy

**Dequeue Failures:**
- Retry immediately (worker polling)
- No backoff (continuous polling)

**Task Execution Failures:**
- Max 3 retries per task
- Exponential backoff: 1s, 2s, 4s
- After 3 failures: task stays in `failed` state

**Database Failures:**
- Retry up to 3 times
- Exponential backoff: 1s, 2s, 4s
- After 3 retries: log and continue (best-effort)

---

## Configuration

```typescript
interface DispatchConfig {
  maxRetries: number          // default: 3
  pollInterval: number        // default: 5000ms
  taskTimeout: number         // default: 3600000ms (1 hour)
  maxConcurrentTasks: number  // default: 10
}
```

---

## Testing Requirements

### Unit Tests

**Test Suite: `agent-dispatch.spec.ts`**

1. **Task Enqueue**
   - ✅ Task enqueued successfully
   - ✅ Task ID generated
   - ✅ Status set to `pending`
   - ✅ Task persisted to storage

2. **Task Dequeue**
   - ✅ Task dequeued by worker
   - ✅ Status updated to `running`
   - ✅ Worker ID assigned
   - ✅ Empty queue returns null

3. **Task Status Update**
   - ✅ Status updated to `completed`
   - ✅ Status updated to `failed` with error
   - ✅ Completion timestamp set
   - ✅ Error message stored

4. **Retry Logic**
   - ✅ Failed task retried
   - ✅ Attempt counter incremented
   - ✅ Status reset to `pending`
   - ✅ Max retries exceeded throws error

5. **Persistence**
   - ✅ State restored after restart
   - ✅ All tasks loaded from storage
   - ✅ Worker queue restored

6. **Concurrency**
   - ✅ Multiple workers dequeue different tasks
   - ✅ No duplicate task assignment
   - ✅ Queue remains consistent

### Integration Tests

**Test Suite: `agent-dispatch.integration.spec.ts`**

1. **Full Workflow**
   - Enqueue task → Dequeue → Complete
   - Verify all status transitions
   - Verify database updates

2. **Worker Failure**
   - Worker crashes during execution
   - Task stays in `running` state
   - Timeout mechanism reclaims task

3. **Database Failure**
   - Database unavailable
   - Retry logic activated
   - Error handling graceful degradation

---

## Implementation Notes

### Durable Object Configuration

**wrangler.toml:**
```toml
[[durable_objects.bindings]]
name = "AGENT_COORDINATOR"
class_name = "AgentCoordinator"
```

### Database Updates

**Database Service:**
```typescript
export const updateTaskStatus = Effect.gen(function* () {
  const db = yield* Database

  yield* db.query(
    `UPDATE tasks SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [status, taskId]
  )
})
```

**Log Event:**
```typescript
export const logTaskEvent = Effect.gen(function* () {
  const db = yield* Database

  yield* db.query(
    `INSERT INTO task_logs (task_id, level, message, metadata) VALUES ($1, $2, $3, $4)`,
    [taskId, level, message, JSON.stringify(metadata)]
  )
})
```

---

## Performance Considerations

1. **Polling Interval:** 5 seconds balances responsiveness and cost
2. **Batch Size:** One task per worker to prevent long-running tasks blocking queue
3. **Timeout:** 1 hour max per task prevents indefinite hangs
4. **Concurrency:** Limit to 10 concurrent tasks to control costs

---

## Success Metrics

- **Task Latency:** < 30 seconds from enqueue to dequeue
- **Completion Rate:** > 80% of tasks complete successfully
- **Retry Rate:** < 20% of tasks require retry
- **Worker Uptime:** > 99% availability

---

## Open Questions

1. **Worker Scaling:** Should we implement auto-scaling based on queue depth?
2. **Priority Queue:** Should we implement priority levels for tasks?
3. **Task Cancellation:** How to handle manual task cancellation requests?
4. **Dead Letter Queue:** Should failed tasks be moved to separate queue?

---

## Next Steps

After implementing this spec, proceed to:
- **Spec 03: Code Implementation** - Agent code generation
- **Spec 04: Test Verification** - Test execution
- **Spec 05: PR Creation** - Pull request creation
