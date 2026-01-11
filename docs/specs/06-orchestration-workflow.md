# Spec 06: Orchestration Workflow

## Purpose

Coordinate all pipeline stages, manage error handling, and ensure reliable end-to-end execution from GitHub issue to PR.

---

## Overview

The orchestration workflow is the "brain" of Loom. It chains together all stages (ingestion → dispatch → implementation → verification → PR creation), handles failures, manages retries, and provides visibility into the entire process.

---

## Context

**Position in Pipeline:**
```
[01: Ingestion] → [02: Dispatch] → [03: Implementation] → [04: Verification] → [05: PR Creation] → [06: Orchestration]
```

**Dependencies:**
- All stage workflows (ingestion, dispatch, implementation, verification, PR creation)
- Database Service (for task updates)
- Logging Service (for monitoring)

---

## End-to-End Workflow

### Stage 0: Receive Webhook

```
GitHub Webhook
    ↓
[01: Ingestion]
    ↓ (valid webhook + valid label)
Task Created (status: pending)
    ↓
Task Enqueued
```

---

### Stage 1: Dispatch

```
AgentCoordinator Durable Object
    ↓
Worker Polls Queue
    ↓
Task Dequeued (status: running)
    ↓
Worker Starts Processing
```

---

### Stage 2: Implementation

```
Worker Calls Implementation Workflow
    ↓
Analyze Issue
    ↓
Explore Codebase
    ↓
Generate Plan
    ↓
Generate Code
    ↓
Self-Review
    ↓
Commit Changes
```

---

### Stage 3: Verification

```
Detect Test Framework
    ↓
Execute Tests
    ↓
Analyze Results
    ↓
Gate Decision (PROCEED/REJECT)
```

---

### Stage 4: PR Creation

```
IF Gate = PROCEED:
    ↓
Generate PR Title/Description
    ↓
Create PR in GitHub
    ↓
Add Labels & Reviewers
    ↓
Link to Issue
    ↓
Update Task (status: completed)

IF Gate = REJECT:
    ↓
Log Failure Reason
    ↓
Update Task (status: failed)
```

---

## State Management

### Task Lifecycle

```typescript
interface TaskLifecycle {
  // Initial state
  pending: {
    createdAt: Date
    githubIssue: GitHubIssue
    agentType: 'default'
  }

  // Processing started
  running: {
    startedAt: Date
    workerId: string
    attempts: number
    stage: 'implementation' | 'verification' | 'pr-creation'
  }

  // Successful completion
  completed: {
    completedAt: Date
    prNumber: number
    prUrl: string
    duration: number
  }

  // Failed
  failed: {
    failedAt: Date
    stage: string
    error: string
    retryable: boolean
    attempts: number
  }
}
```

### Stage Tracking

```typescript
interface StageProgress {
  currentStage: string
  startedAt: Date
  completedAt?: Date
  metadata: Record<string, any>
}
```

---

## Error Handling Strategy

### Error Classification

| Error Type | Stage | Retryable | Action |
|------------|--------|------------|--------|
| Webhook signature invalid | Ingestion | No | Reject with 401 |
| Missing label | Ingestion | No | Reject with 400 |
| LLM API failure | Implementation | Yes | Retry (max 3) |
| Code generation timeout | Implementation | No | Fail task |
| Self-review failed | Implementation | Yes | Regenerate (max 2) |
| Test execution failure | Verification | Yes | Retry (max 2) |
| Tests failed | Verification | No | Reject changes |
| GitHub API rate limit | PR Creation | Yes | Wait for reset |
| GitHub API error | PR Creation | Yes | Retry (max 3) |
| Merge conflict | PR Creation | No | Fail task |

### Retry Logic

**Implementation Stage:**
```typescript
const ImplementationWithRetry = Effect.retry(
  Effect.gen(function* () {
    const result = yield* ImplementationWorkflow.implement(issue)

    // Self-review check
    if (result.review.score < 80) {
      return yield* Effect.fail(new LowQualityScoreError())
    }

    return result
  }),
  { while: error => error instanceof LLMError || error instanceof LowQualityScoreError, times: 3 }
)
```

**Verification Stage:**
```typescript
const VerificationWithRetry = Effect.retry(
  Effect.gen(function* () {
    const result = yield* VerificationWorkflow.verify(workspace, baseBranch)

    if (!result.decision.allowed) {
      return yield* Effect.fail(new TestGateError(result.decision.reason))
    }

    return result
  }),
  { while: error => error instanceof TestExecutionError, times: 2 }
)
```

---

## Workflow Implementation

### Main Orchestrator

```typescript
// packages/core/src/orchestration/main-orchestrator.ts
export const MainOrchestrator = Effect.gen(function* () {
  const database = yield* DatabaseService
  const logger = yield* LoggerService

  return {
    processTask: (taskId: string) =>
      Effect.gen(function* () {
        // Log start
        yield* logger.info('Task started', { taskId })

        try {
          // Stage 1: Implementation
          const implResult = yield* ImplementationWithRetry.pipe(
            Effect.tap(() => logger.info('Implementation stage completed', { taskId })),
            Effect.catchAll((error) => {
              yield* database.updateTaskStatus(taskId, 'failed')
              yield* logger.error('Implementation failed', { taskId, error })
              return Effect.fail(error)
            })
          )

          // Stage 2: Verification
          const verifyResult = yield* VerificationWithRetry.pipe(
            Effect.tap(() => logger.info('Verification stage completed', { taskId })),
            Effect.catchAll((error) => {
              yield* database.updateTaskStatus(taskId, 'failed')
              yield* logger.error('Verification failed', { taskId, error })
              return Effect.fail(error)
            })
          )

          // Stage 3: PR Creation (if allowed)
          if (verifyResult.decision.allowed) {
            const prResult = yield* PRCreationWorkflow.create(
              issue,
              implResult.changes,
              verifyResult.testReport,
              implResult.branchName
            ).pipe(
              Effect.tap(() => logger.info('PR creation stage completed', { taskId })),
              Effect.catchAll((error) => {
                yield* database.updateTaskStatus(taskId, 'failed')
                yield* logger.error('PR creation failed', { taskId, error })
                return Effect.fail(error)
              })
            )

            // Mark task as completed
            yield* database.updateTask(taskId, {
              status: 'completed',
              prNumber: prResult.number,
              completedAt: new Date()
            })

            yield* logger.info('Task completed successfully', {
              taskId,
              prUrl: prResult.url
            })
          } else {
            // Verification rejected
            yield* database.updateTaskStatus(taskId, 'failed')
            yield* logger.warn('Task failed verification', {
              taskId,
              reason: verifyResult.decision.reason
            })

            // Add comment to issue
            yield* GitHubService.addCommentToIssue(issue,
              `❌ Verification failed: ${verifyResult.decision.reason}\n\n` +
              `Please review the test failures and update the issue.`
            )

            return yield* Effect.fail(new VerificationGateError())
          }

        } catch (error) {
          // Unhandled error
          yield* database.updateTaskStatus(taskId, 'failed')
          yield* logger.error('Task failed with unhandled error', { taskId, error })
          throw error
        }
      })
  }
})
```

---

## Success Criteria

**Orchestration is successful when:**

1. **Workflow Completes**
   - All stages execute in order
   - No stages skipped (unless error)
   - Task reaches terminal state (completed/failed)

2. **Error Handling**
   - Retry logic activated for retryable errors
   - Max retry limits respected
   - Non-retryable errors fail immediately

3. **State Management**
   - Task status updated at each stage
   - All events logged
   - Progress visible in dashboard

4. **Cleanup**
   - Temporary workspaces deleted
   - Resources released
   - No memory leaks

5. **Monitoring**
   - Metrics collected (duration, success rate, errors)
   - Alerts triggered on failures
   - Health checks passing

---

## Configuration

```typescript
interface OrchestrationConfig {
  stageTimeouts: {
    implementation: number   // default: 300000ms (5 min)
    verification: number     // default: 300000ms (5 min)
    prCreation: number       // default: 30000ms (30 sec)
  }
  retryPolicy: {
    maxRetries: number       // default: 3
    backoff: 'exponential' | 'linear'
    baseDelay: number       // default: 1000ms
  }
  monitoring: {
    logLevel: 'debug' | 'info' | 'warn' | 'error'
    metricsEnabled: boolean
    alertingEnabled: boolean
  }
}
```

---

## Testing Requirements

### Unit Tests

**Test Suite: `orchestration.spec.ts`**

1. **Workflow Execution**
   - ✅ All stages execute in order
   - ✅ Task status updated at each stage
   - ✅ Final status is completed

2. **Error Handling**
   - ✅ Retryable errors trigger retries
   - ✅ Non-retryable errors fail immediately
   - ✅ Max retry limits respected

3. **State Management**
   - ✅ Task status transitions correctly
   - ✅ Events logged for all actions
   - ✅ Progress updated in real-time

4. **Verification Gate**
   - ✅ PR created when tests pass
   - ✅ PR not created when tests fail
   - ✅ Comment added to issue on failure

5. **Cleanup**
   - ✅ Workspaces deleted after completion
   - ✅ Resources released
   - ✅ No memory leaks

### Integration Tests

**Test Suite: `orchestration.integration.spec.ts`**

1. **End-to-End Success**
   - Complete workflow from webhook to PR
   - Verify all stages executed
   - Verify task completed

2. **End-to-End Failure**
   - Trigger failure at different stages
   - Verify error handling
   - Verify task marked as failed

3. **Retry Scenarios**
   - Trigger retryable error
   - Verify retry logic
   - Verify max retry limit

4. **Verification Rejection**
   - Generate failing tests
   - Verify PR not created
   - Verify comment added to issue

---

## Implementation Notes

### Effect Workflow Composition

```typescript
// packages/core/src/orchestration/workflow-composition.ts
export const FullWorkflow = Effect.gen(function* () {
  const config = yield* OrchestrationConfig

  return Effect.gen(function* () {
    // Stage 1: Implementation
    const implResult = yield* Effect.timeout(
      ImplementationWorkflow.implement(issue),
      config.stageTimeouts.implementation
    ).pipe(
      Effect.withTimeoutError(() => new ImplementationTimeoutError())
    )

    // Stage 2: Verification
    const verifyResult = yield* Effect.timeout(
      VerificationWorkflow.verify(workspace, baseBranch),
      config.stageTimeouts.verification
    ).pipe(
      Effect.withTimeoutError(() => new VerificationTimeoutError())
    )

    // Stage 3: PR Creation (conditional)
    if (verifyResult.decision.allowed) {
      const prResult = yield* Effect.timeout(
        PRCreationWorkflow.create(issue, implResult.changes, verifyResult.testReport),
        config.stageTimeouts.prCreation
      ).pipe(
        Effect.withTimeoutError(() => new PRCreationTimeoutError())
      )

      return { implResult, verifyResult, prResult }
    }

    return { implResult, verifyResult, prResult: null }
  }).pipe(
    Effect.catchAll((error) => {
      // Handle all errors consistently
      return handleWorkflowError(error, taskId)
    })
  )
})
```

---

## Performance Considerations

1. **Parallelization:** Independent operations within stages can be parallelized
2. **Caching:** Cache repository metadata to avoid repeated GitHub API calls
3. **Resource Cleanup:** Delete workspaces immediately after use
4. **Timeout Enforcement:** Prevent indefinite hangs

---

## Success Metrics

- **End-to-End Success Rate:** > 70% of tasks complete successfully
- **Average Duration:** < 15 minutes from webhook to PR
- **Retry Rate:** < 30% of tasks require retries
- **Error Rate:** < 10% of tasks fail with unhandled errors

---

## Open Questions

1. **Stage Parallelization:** Can we run verification in parallel with PR preparation?
2. **Checkpointing:** Should we save intermediate state for resumption after crashes?
3. **Rollback:** Should we automatically rollback if tests fail after PR submission?
4. **Multi-Agent Coordination:** How to extend workflow for multi-agent scenarios?

---

## Next Steps

After implementing this spec, proceed to:
- **Spec 07: Web Dashboard** - Monitoring and management UI
- **Architecture Overview** - System design documentation
