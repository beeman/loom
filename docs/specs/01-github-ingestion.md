# Spec 01: GitHub Ingestion

## Purpose

Receive and validate GitHub webhook events, and provide a sync mechanism to pull issues from GitHub repositories when the API has been offline or for local development without webhooks.

---

## Overview

The ingestion layer is entry point for Loom. It supports two modes:

1. **Webhook Mode:** Real-time processing of GitHub webhook events
2. **Sync Mode:** Manual or scheduled syncing to pull issues from GitHub repositories (useful for local development or catching up after downtime)

Both modes validate requests, filter eligible issues, and forward them to the dispatch system.

---

## Context

**Position in Pipeline:**
```
GitHub Webhook → [01: Ingestion] → 02: Dispatch → 03: Implementation → ...
GitHub API (Sync) → [01: Ingestion] → 02: Dispatch → 03: Implementation → ...
```

**Dependencies:**
- GitHub webhook endpoint (already exists in `apps/api`)
- GitHub API client (Octokit)
- Validation service (to be created)
- Database service (to be created)

---

## Inputs

### 1. GitHub Webhook Payload (Webhook Mode)

**Source:** GitHub API (issue created/updated events)

**Structure:**
```typescript
interface GitHubWebhookPayload {
  action: 'opened' | 'edited' | 'labeled' | 'unlabeled'
  issue: {
    id: number
    number: number
    title: string
    body: string | null
    state: 'open' | 'closed'
    labels: Array<{ name: string }>
    user: {
      login: string
      id: number
    }
    repository: {
      id: number
      name: string
      full_name: string
      owner: { login: string }
      private: boolean
      default_branch: string
    }
  }
  repository: {
    id: number
    name: string
    full_name: string
    owner: { login: string }
    private: boolean
    default_branch: string
    clone_url: string
    ssh_url: string
  }
  installation?: {
    id: number
  }
  sender: {
    login: string
    id: number
  }
}
```

### 2. HTTP Headers (Webhook Mode)

**Required:**
```
X-Hub-Signature-256: <HMAC-SHA256 signature>
X-GitHub-Event: issues
X-GitHub-Delivery: <unique delivery ID>
```

### 3. Sync Request (Sync Mode)

**Endpoint:** `POST /api/sync`

**Request Body:**
```typescript
interface SyncRequest {
  repository: {
    owner: string
    name: string
  }
  since?: string // ISO 8601 timestamp - only sync issues updated since this time
  dryRun?: boolean // If true, only report what would be synced without creating tasks
}
```

---

## Outputs

### Success Response (Webhook Mode)

```typescript
interface IngestionSuccessResponse {
  taskId: string
  status: 'enqueued'
  message: string
}

// HTTP 202 Accepted
{
  "taskId": "task_abc123def456",
  "status": "enqueued",
  "message": "Issue #42 queued for processing"
}
```

### Success Response (Sync Mode)

```typescript
interface SyncSuccessResponse {
  synced: number
  skipped: number
  alreadyExists: number
  issues: Array<{
    issueNumber: number
    taskId?: string
    status: 'synced' | 'skipped' | 'already-exists'
    reason?: string
  }>
}

// HTTP 200 OK
{
  "synced": 3,
  "skipped": 2,
  "alreadyExists": 1,
  "issues": [
    {
      "issueNumber": 42,
      "taskId": "task_abc123",
      "status": "synced"
    },
    {
      "issueNumber": 43,
      "status": "skipped",
      "reason": "Missing required label"
    },
    {
      "issueNumber": 44,
      "status": "already-exists",
      "taskId": "task_def456"
    }
  ]
}
```

### Error Response

```typescript
interface IngestionErrorResponse {
  error: string
  code: string
  details?: any
}

// HTTP 400 Bad Request
{
  "error": "Missing required label",
  "code": "MISSING_LABEL",
  "details": { required: "loom:ready" }
}

// HTTP 401 Unauthorized
{
  "error": "Invalid webhook signature",
  "code": "INVALID_SIGNATURE"
}

// HTTP 403 Forbidden
{
  "error": "Repository not authorized",
  "code": "UNAUTHORIZED_REPO"
}

// HTTP 404 Not Found (Sync Mode)
{
  "error": "Repository not found",
  "code": "REPOSITORY_NOT_FOUND"
}
```

---

## Success Criteria

**The ingestion is successful when:**

### Webhook Mode

1. **Webhook Signature Verified**
   - Request originates from GitHub (verified via HMAC-SHA256)
   - Signature matches using shared secret

2. **Event Type Valid**
   - Event is `issues` (not pull_request, push, etc.)
   - Action is one of: `opened`, `edited`, `labeled`

3. **Issue is Open**
   - Issue state is `open` (not closed)

4. **Required Label Present**
   - Issue has `loom:ready` label
   - OR issue has `loom:auto` label (auto-process without review)

5. **Repository Authorized**
   - Repository is in allowed list (from config)
   - OR GitHub App installation exists

6. **Task Created**
   - Task record created in SQLite with status `pending`
   - Task enqueued to Durable Object
   - Task ID returned to caller

7. **Response Format**
   - HTTP status code 202 (Accepted)
   - JSON response with taskId
   - Correlation ID logged

### Sync Mode

1. **GitHub API Access**
   - Successfully fetch issues from GitHub API
   - Handle pagination for large issue lists

2. **Issue Filtering**
   - Filter to open issues only
   - Filter to issues with required labels (`loom:ready` or `loom:auto`)

3. **Duplicate Prevention**
   - Check database for existing tasks with same issue
   - Skip issues that already have tasks (unless failed and can be retried)

4. **Task Creation**
   - Create task records for eligible issues
   - Enqueue tasks to Durable Object
   - Track which issues were synced vs skipped

5. **Dry Run Mode**
   - If `dryRun: true`, only report what would happen
   - Do not create any tasks or enqueue

6. **Response Format**
   - HTTP status code 200 (OK)
   - JSON response with sync statistics
   - Detailed list of issues and their status

---

## Workflow

### Webhook Mode Workflow

#### Step 1: Receive Webhook
- POST to `/webhooks/github`
- Parse raw body as text (for signature verification)

#### Step 2: Verify Signature
- Extract `X-Hub-Signature-256` header
- Compute HMAC-SHA256 of raw body using webhook secret
- Compare signatures with constant-time comparison
- Fail with 401 if mismatch

#### Step 3: Parse Payload
- Parse JSON payload
- Validate against GitHub webhook schema
- Extract issue and repository data

#### Step 4: Validate Event
- Check `X-GitHub-Event` header equals `issues`
- Check action is `opened`, `edited`, or `labeled`
- Fail with 400 if invalid event type

#### Step 5: Check Issue State
- Verify issue is open
- Fail silently (no task created) if closed

#### Step 6: Validate Labels
- Check issue labels array
- Require `loom:ready` label
- Fail with 400 if missing label

#### Step 7: Authorize Repository
- Check repository against allowed list (config)
- OR check for GitHub App installation
- Fail with 403 if unauthorized

#### Step 8: Check for Existing Task
- Query database for existing task with same `github_issue_id`
- If task exists and is `running` or `pending`, skip (duplicate)
- If task exists and is `failed`, allow retry (create new task)

#### Step 9: Create Task Record
```sql
INSERT INTO tasks (
  id,
  github_issue_id,
  github_repo_id,
  status,
  agent_type,
  created_at,
  updated_at
) VALUES (
  $taskId,
  $issueId,
  $repoId,
  'pending',
  'default',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
```

#### Step 10: Enqueue Task
- Call Durable Object `AgentCoordinator.enqueue(issue)`
- Receive taskId from coordinator

#### Step 11: Log Event
- Log with task ID, issue number, repository
- Log level: info

#### Step 12: Return Response
- HTTP 202 Accepted
- JSON with taskId

---

### Sync Mode Workflow

#### Step 1: Receive Sync Request
- POST to `/api/sync`
- Validate request body (owner, repo)
- Extract optional parameters (since, dryRun)

#### Step 2: Fetch Issues from GitHub
- Use GitHub API (Octokit) to list issues
- Query parameters:
  - `state: open`
  - `labels: loom:ready,loom:auto`
  - `sort: updated`
  - `direction: desc`
  - `since: <timestamp>` (if provided)
- Handle pagination (GitHub returns max 100 per page)

#### Step 3: Authorize Repository
- Check repository against allowed list
- Fail with 403 if unauthorized

#### Step 4: Filter and Process Each Issue
For each fetched issue:
- **Check if Open:** Skip if not `open`
- **Check Labels:** Skip if missing required labels
- **Check for Existing Task:** Query database for `github_issue_id`
  - If task exists and is `running` or `pending`: Mark as `already-exists`
  - If task exists and is `failed`: Allow retry (create new task)
  - If no task exists: Proceed to create task

#### Step 5: Create Tasks (if not dryRun)
- Only create tasks if `dryRun: false`
- For each eligible issue:
  - Create task record in database
  - Enqueue to Durable Object
  - Track taskId in response

#### Step 6: Build Sync Report
```typescript
{
  synced: count of newly created tasks,
  skipped: count of ineligible issues,
  alreadyExists: count of issues with existing tasks,
  issues: [
    { issueNumber, taskId?, status, reason? }
  ]
}
```

#### Step 7: Return Response
- HTTP 200 OK
- JSON with sync statistics

---

## Error Handling

### Error Matrix (Webhook Mode)

| Error Type | HTTP Status | Code | Retry | Action |
|------------|-------------|------|-------|--------|
| Invalid signature | 401 | `INVALID_SIGNATURE` | No | Return error immediately |
| Invalid event type | 400 | `INVALID_EVENT` | No | Return error immediately |
| Missing label | 400 | `MISSING_LABEL` | No | Return error with hint |
| Issue closed | 202 | `ISSUE_CLOSED` | No | Silently ignore (don't create task) |
| Unauthorized repo | 403 | `UNAUTHORIZED_REPO` | No | Return error immediately |
| Database failure | 500 | `DB_ERROR` | Yes (exponential backoff) | Retry up to 3 times |
| Durable Object failure | 500 | `QUEUE_ERROR` | Yes (exponential backoff) | Retry up to 3 times |
| Malformed payload | 400 | `MALFORMED_PAYLOAD` | No | Return error with details |

### Error Matrix (Sync Mode)

| Error Type | HTTP Status | Code | Retry | Action |
|------------|-------------|------|-------|--------|
| Invalid request | 400 | `INVALID_REQUEST` | No | Return error immediately |
| Repository not found | 404 | `REPOSITORY_NOT_FOUND` | No | Return error immediately |
| Unauthorized repo | 403 | `UNAUTHORIZED_REPO` | No | Return error immediately |
| GitHub API rate limit | 429 | `RATE_LIMITED` | Yes (wait for reset) | Retry after reset time |
| GitHub API error | 500 | `GITHUB_API_ERROR` | Yes (exponential backoff) | Retry up to 3 times |
| Database failure | 500 | `DB_ERROR` | Yes (exponential backoff) | Retry up to 3 times |
| Durable Object failure | 500 | `QUEUE_ERROR` | Yes (exponential backoff) | Retry up to 3 times |

### Retry Strategy

**Webhook Mode - Transient Errors (DB, Queue):**
- Max retries: 3
- Backoff: exponential (1s, 2s, 4s)
- Log each retry attempt

**Webhook Mode - Permanent Errors (validation, auth):**
- No retries
- Log with warning level
- Return error to client

**Sync Mode - GitHub API Errors:**
- Rate limit: Wait for `X-RateLimit-Reset` timestamp
- 5xx errors: Retry up to 3 times with exponential backoff
- 4xx errors: No retries (except rate limit)

---

## Dependencies

### Internal Services

**SignatureVerifierService** (to be created)
```typescript
interface SignatureVerifierService {
  verify(rawBody: string, signature: string): Effect.Effect<boolean, Error>
}
```

**TasksService** (from `@workspace/db`)
```typescript
import { TasksService } from '@workspace/db'

// Create a new task
createTask(input: TaskCreateInput): Effect.Effect<Task, DatabaseError>

// Find task by GitHub issue ID (for duplicate prevention)
findByGithubIssueId(issueId: number): Effect.Effect<Task | null, DatabaseError>

// Update task status
updateStatus(taskId: string, input: TaskUpdateInput): Effect.Effect<Task | null, DatabaseError>
```

**LogsService** (from `@workspace/db`)
```typescript
import { LogsService } from '@workspace/db'

// Create a log entry
create(input: LogCreateInput): Effect.Effect<TaskLog, DatabaseError>

// Find logs for a task
findByTaskId(taskId: string, limit?: number): Effect.Effect<TaskLog[], DatabaseError>
```

**CoordinatorService** (to be created in Spec 02)
```typescript
interface CoordinatorService {
  enqueue(issue: GitHubIssue): Effect.Effect<string, QueueError>
  dequeue(workerId: string): Effect.Effect<Task | null, QueueError>
}
```

**Database Layer** (from `@workspace/db`)
```typescript
import { Database, DatabaseLive } from '@workspace/db'

// Provide database layer to Effect workflows
Effect.provide(DatabaseLive)
```

See **Spec 00: Database Setup** for complete database layer definition with Drizzle schema, TaskService, and LogsService implementations.

### External Dependencies

- **GitHub API**: For webhook payload structure and issue fetching (Octokit)
- **GitHub Secret**: Stored in Cloudflare env `GITHUB_WEBHOOK_SECRET`
- **GitHub Token**: For sync mode (PAT or GitHub App token)
- **Config**: Allowed repositories list (config file or database)

---

## Configuration

```typescript
interface IngestionConfig {
  webhookSecret: string
  allowedRepos?: Array<{ owner: string, repo: string }>
  requiredLabel?: string // default: 'loom:ready'
  autoProcessLabel?: string // default: 'loom:auto'
  logLevel: 'debug' | 'info' | 'warn' | 'error'

  // Sync mode configuration
  syncEnabled: boolean // default: true
  syncInterval?: number // seconds - for automatic syncing (optional)
  maxIssuesPerSync?: number // default: 100 - prevent excessive API calls
}
```

---

## Testing Requirements

### Unit Tests

**Test Suite: `github-ingestion.spec.ts`**

#### Webhook Mode Tests

1. **Webhook Signature Verification**
   - ✅ Valid signature passes
   - ✅ Invalid signature fails with 401
   - ✅ Missing signature fails with 401
   - ✅ Tampered body fails verification

2. **Event Validation**
   - ✅ `issues` event with `opened` action accepted
   - ✅ `issues` event with `edited` action accepted
   - ✅ `issues` event with `labeled` action accepted
   - ✅ `pull_request` event rejected with 400
   - ✅ `push` event rejected with 400

3. **Label Validation**
   - ✅ Issue with `loom:ready` label accepted
   - ✅ Issue with `loom:auto` label accepted
   - ✅ Issue without label rejected with 400
   - ✅ Issue with other labels (not loom:ready) rejected

4. **Repository Authorization**
   - ✅ Repository in allowed list accepted
   - ✅ Repository not in allowed list rejected with 403
   - ✅ Repository with GitHub App installation accepted

5. **Issue State**
   - ✅ Open issue creates task
   - ✅ Closed issue ignored (no task created)

6. **Duplicate Prevention**
   - ✅ Duplicate running/pending task skipped
   - ✅ Failed task allowed to retry

7. **Task Creation**
   - ✅ Task record created with correct fields
   - ✅ Task enqueued to coordinator
   - ✅ Task ID returned in response

8. **Error Handling**
   - ✅ Database error triggers retry
   - ✅ Queue error triggers retry
   - ✅ Max retries exceeded returns 500

#### Sync Mode Tests

9. **GitHub API Integration**
   - ✅ Successfully fetch issues from GitHub
   - ✅ Handle pagination for large issue lists
   - ✅ Filter by `since` timestamp
   - ✅ Handle GitHub API errors

10. **Issue Filtering**
    - ✅ Only open issues are processed
    - ✅ Only issues with required labels are processed
    - ✅ Issues without labels are skipped

11. **Duplicate Detection**
    - ✅ Existing tasks detected and skipped
    - ✅ Failed tasks allowed to retry
    - ✅ New issues create tasks

12. **Dry Run Mode**
    - ✅ Dry run reports what would happen
    - ✅ No tasks created in dry run
    - ✅ No tasks enqueued in dry run

13. **Sync Report Generation**
    - ✅ Correct sync statistics generated
    - ✅ All issues tracked with status
    - ✅ Response format matches spec

14. **Error Handling (Sync)**
    - ✅ GitHub API rate limit handled
    - ✅ GitHub API errors trigger retry
    - ✅ Unauthorized repository rejected

### Integration Tests

**Test Suite: `github-ingestion.integration.spec.ts`**

#### Webhook Mode Integration

1. **End-to-End Happy Path**
   - Send real webhook payload
   - Verify response 202
   - Verify task created in database
   - Verify task enqueued

2. **Webhook Security**
   - Send webhook without signature → 401
   - Send webhook with wrong signature → 401
   - Send webhook with correct signature → 202

3. **GitHub API Integration** (mocked)
   - Verify webhook structure matches GitHub format
   - Verify all required fields present

#### Sync Mode Integration

4. **Full Sync Workflow**
   - Trigger sync for repository
   - Verify issues fetched from GitHub
   - Verify eligible tasks created
   - Verify sync report returned

5. **Sync After Downtime**
   - Create tasks for old issues
   - Set `since` parameter to recent timestamp
   - Verify only new issues synced

6. **Dry Run Sync**
   - Trigger dry run sync
   - Verify no tasks created
   - Verify sync report accurate

---

## Implementation Notes

### Effect Workflow Structure (Webhook Mode)

```typescript
// packages/core/src/ingestion/github-ingestion.ts
export const GitHubIngestionWorkflow = Effect.gen(function* () {
  const config = yield* IngestionConfig
  const database = yield* DatabaseService
  const coordinator = yield* CoordinatorService
  const verifier = yield* SignatureVerifierService

  return HttpApiBuilder.group(Api, 'GitHubIngestion', (handlers) =>
    handlers.handle('webhook', (request) =>
      Effect.gen(function* () {
        // 1. Verify signature
        const isValid = yield* verifier.verify(request.body, request.signature)
        if (!isValid) {
          return yield* Effect.fail(new InvalidSignatureError())
        }

        // 2. Parse and validate payload
        const payload = yield* parseWebhookPayload(request.body)
        yield* validateEvent(payload)

        // 3. Validate issue and labels
        yield* validateIssueEligibility(payload)

        // 4. Check for existing task
        const existingTask = yield* database.findTaskByIssueId(payload.issue.id)
        if (existingTask && (existingTask.status === 'pending' || existingTask.status === 'running')) {
          return {
            taskId: existingTask.id,
            status: 'already-exists',
            message: `Task already exists for issue #${payload.issue.number}`
          }
        }

        // 5. Create task
        const task = yield* database.createTask({
          githubIssueId: payload.issue.id,
          githubRepoId: payload.repository.id,
          status: 'pending',
          agentType: 'default'
        })

        // 6. Enqueue
        yield* coordinator.enqueue(payload)

        // 7. Return success
        return {
          taskId: task.id,
          status: 'enqueued',
          message: `Issue #${payload.issue.number} queued for processing`
        }
      })
    )
  )
})
```

### Effect Workflow Structure (Sync Mode)

```typescript
// packages/core/src/ingestion/github-sync.ts
export const GitHubSyncWorkflow = Effect.gen(function* () {
  const config = yield* IngestionConfig
  const database = yield* DatabaseService
  const coordinator = yield* CoordinatorService
  const github = yield* GitHubSyncService

  return HttpApiBuilder.group(Api, 'GitHubSync', (handlers) =>
    handlers.handle('sync', (request) =>
      Effect.gen(function* () {
        const { repository, since, dryRun } = request.body

        // 1. Authorize repository
        yield* authorizeRepository(repository)

        // 2. Fetch issues from GitHub
        const issues = yield* github.fetchIssues(repository, since)

        // 3. Process each issue
        const results = yield* Effect.forEach(issues, (issue) =>
          Effect.gen(function* () {
            // Check eligibility
            if (!isEligible(issue)) {
              return {
                issueNumber: issue.number,
                status: 'skipped' as const,
                reason: 'Missing required label or closed'
              }
            }

            // Check for existing task
            const existingTask = yield* database.findTaskByIssueId(issue.id)
            if (existingTask) {
              if (existingTask.status === 'failed') {
                // Allow retry for failed tasks
                if (dryRun) {
                  return {
                    issueNumber: issue.number,
                    status: 'would-retry' as const,
                    reason: 'Task failed, would retry'
                  }
                }
                const task = yield* database.createTask({
                  githubIssueId: issue.id,
                  githubRepoId: issue.repository.id,
                  status: 'pending',
                  agentType: 'default'
                })
                yield* coordinator.enqueue(issue)
                return {
                  issueNumber: issue.number,
                  taskId: task.id,
                  status: 'synced' as const
                }
              } else {
                return {
                  issueNumber: issue.number,
                  status: 'already-exists' as const,
                  taskId: existingTask.id
                }
              }
            }

            // Create new task
            if (dryRun) {
              return {
                issueNumber: issue.number,
                status: 'would-create' as const
              }
            }

            const task = yield* database.createTask({
              githubIssueId: issue.id,
              githubRepoId: issue.repository.id,
              status: 'pending',
              agentType: 'default'
            })
            yield* coordinator.enqueue(issue)

            return {
              issueNumber: issue.number,
              taskId: task.id,
              status: 'synced' as const
            }
          })
        )

        // 4. Build sync report
        const synced = results.filter(r => r.status === 'synced').length
        const skipped = results.filter(r => r.status === 'skipped').length
        const alreadyExists = results.filter(r => r.status === 'already-exists').length

        return {
          synced,
          skipped,
          alreadyExists,
          issues: results
        }
      })
    )
  )
})
```

### Security Considerations

1. **Webhook Secret**: Must be stored securely in Cloudflare env
2. **Constant-Time Comparison**: Use timing-safe compare for signatures
3. **Input Validation**: Validate all fields from GitHub payload
4. **Rate Limiting**: Add rate limiting to prevent abuse (configurable)
5. **Authorization**: Always check repository authorization
6. **GitHub Token**: Store sync token securely, use least-privilege PAT

### Performance Considerations

1. **Async Processing**: Return 202 immediately, process asynchronously
2. **Connection Pooling**: Reuse database connections
3. **Caching**: Cache repository authorization status (with TTL)
4. **Timeouts**: Set reasonable timeouts for all external calls
5. **Pagination**: Handle large issue lists with GitHub API pagination
6. **Sync Batch Size**: Limit issues per sync to prevent API rate limits

---

## Success Metrics

- **Ingestion Latency:** < 500ms from webhook receipt to response
- **Sync Latency:** < 10 seconds for 100 issues (excluding GitHub API time)
- **Success Rate:** > 99% (excluding validation failures)
- **Security Incidents:** 0 (all invalid signatures rejected)
- **Duplicate Prevention:** 100% of duplicate webhook events prevented
- **Sync Accuracy:** 100% of eligible issues synced, 0% of ineligible issues synced

---

## Open Questions

1. **Repository Authorization Model**: Config file vs database vs GitHub App installations?
2. **Rate Limiting**: Should we implement rate limiting per repository?
3. **Auto-Sync**: Should we implement scheduled automatic syncing (e.g., every 5 minutes)?
4. **Sync Strategy**: Should sync prefer `since` timestamp or fetch all and filter locally?

---

## Next Steps

After implementing this spec, proceed to:
- **Spec 02: Agent Dispatch** - Task dispatching logic
- **Spec 03: Code Implementation** - Agent code generation
- **Spec 04: Test Verification** - Test execution
- **Spec 05: PR Creation** - Pull request creation
- **Spec 06: Orchestration Workflow** - Full pipeline
- **Spec 07: Web Dashboard** - Monitoring UI (add sync trigger button)
