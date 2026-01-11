# Spec 07: Web Dashboard

## Purpose

Provide real-time monitoring and management interface for Loom's agent system, enabling users to track tasks, view logs, and trigger manual actions.

---

## Overview

The web dashboard is the human-facing interface for Loom. It displays task status, provides visibility into agent operations, and allows manual intervention when needed. Built on top of the existing React + Vite stack.

---

## Context

**Position in System:**
```
User → [Web Dashboard] → API → Database / Durable Objects
         ↓
    Real-time updates (polling or WebSockets)
```

**Dependencies:**
- Existing `apps/web` (React + Vite)
- API endpoints (to be created)
- Shared packages (ui, shell, env)

---

## Pages

### 1. Dashboard Home

**Path:** `/`

**Purpose:** Overview of all recent activity and system health.

**Components:**
- **Summary Cards**
  - Total tasks (last 24 hours)
  - Tasks completed
  - Tasks failed
  - Success rate percentage
  - Average duration

- **Recent Tasks Table**
  - Task ID (clickable to view details)
  - Issue number & title
  - Status (badge: pending/running/completed/failed)
  - Duration
  - Created at
  - Actions (view, cancel, retry)

- **System Status**
  - Worker status (online/offline)
  - Queue depth (pending tasks)
  - Last sync timestamp

---

### 2. Task List

**Path:** `/tasks`

**Purpose:** Browse and filter all tasks.

**Components:**
- **Filters**
  - Status (dropdown: all/pending/running/completed/failed)
  - Date range (date picker)
  - Repository (if multi-repo support)
  - Search (by issue number or title)

- **Sort Options**
  - Created at (newest/oldest)
  - Duration (longest/shortest)
  - Status

- **Pagination**
  - 25 tasks per page
  - Load more button
  - Jump to page

- **Task List**
  - Same structure as dashboard but with pagination

---

### 3. Task Detail

**Path:** `/tasks/:taskId`

**Purpose:** View detailed information about a specific task.

**Components:**
- **Task Header**
  - Task ID
  - Issue number (link to GitHub)
  - Status (large badge)
  - Duration
  - Created/Completed timestamps

- **Issue Context**
  - Issue title
  - Issue body (rendered markdown)
  - Labels
  - Repository

- **Progress Timeline**
  - Vertical timeline showing stage progress:
    - ⏳ Pending
    - 🔄 Running (Implementation)
    - ✅ Implementation completed
    - 🔄 Running (Verification)
    - ✅ Verification completed
    - 🔄 Running (PR Creation)
    - ✅ PR Created
  - Each stage shows start/end time and duration

- **Sync Status** (new)
  - Last sync timestamp
  - Sync status indicator (syncing/idle/error)
  - Button to trigger manual sync
  - Sync results summary (last sync only)

- **PR Information** (if completed)
  - PR number (link to GitHub)
  - PR title
  - Draft status
  - Reviewers
  - Labels

- **Logs**
  - Scrollable log viewer
  - Filter by log level (info/warn/error)
  - Timestamp, level, message
  - Expandable for metadata

- **Actions**
  - Cancel (if running)
  - Retry (if failed)
  - View in GitHub (link to issue/PR)
  - Download logs (as JSON)

- **Sync Button**
  - "Sync Repository" button (triggers manual sync)
  - Shows sync status (syncing/idle/last sync time)
  - Displays sync results summary (synced/skipped/already-exists)

---

### 4. Manual Trigger

**Path:** `/trigger`

**Purpose:** Manually trigger agent for a specific issue.

**Components:**
- **Issue Input**
  - Repository owner/name
  - Issue number
  - Fetch issue button (validates issue exists)

- **Issue Preview**
  - Issue title
  - Issue body (preview)
  - Labels
  - Check if has `loom:ready` label

- **Agent Type Selection**
  - Dropdown: Default agent (MVP: only one option)

- **Submit Button**
  - "Trigger Agent" button
  - Shows loading state during submission
  - Redirects to task detail on success

---

### 5. Settings

**Path:** `/settings`

**Purpose:** Configure Loom behavior.

**Components:**
- **GitHub Configuration**
  - Webhook secret (masked input)
  - Allowed repositories (list with add/remove)

- **Agent Configuration**
  - LLM provider (dropdown: OpenAI/Anthropic/Local)
  - API key (masked input)
  - Model name
  - Max tokens
  - Temperature (slider)

- **Worker Configuration**
  - Max concurrent tasks
  - Polling interval

- **Notification Preferences**
  - Email on task completion (checkbox)
  - Email on task failure (checkbox)
  - Email threshold (only if > N failures in hour)

- **Save Button**
  - Saves configuration
  - Shows success/error message

---

## API Endpoints

### Get Tasks

**GET** `/api/tasks`

**Query Params:**
- `status`: `pending` | `running` | `completed` | `failed` (optional)
- `limit`: number (default: 25)
- `offset`: number (default: 0)
- `search`: string (optional)

**Response:**
```typescript
{
  tasks: Array<{
    id: string
    githubIssueId: number
    githubIssueNumber: number
    githubIssueTitle: string
    githubRepoName: string
    githubRepoOwner: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    prNumber: number | null
    createdAt: string
    completedAt: string | null
    duration: number | null
  }>
  total: number
  limit: number
  offset: number
}
```

---

### Get Task Detail

**GET** `/api/tasks/:taskId`

**Response:**
```typescript
{
  task: {
    id: string
    status: string
    githubIssue: {
      id: number
      number: number
      title: string
      body: string
      labels: string[]
      repository: {
        name: string
        owner: string
        url: string
      }
    }
    agentType: string
    attempts: number
    prNumber: number | null
    prUrl: string | null
    createdAt: string
    startedAt: string | null
    completedAt: string | null
    duration: number | null
  }
  logs: Array<{
    id: number
    taskId: string
    level: 'info' | 'warn' | 'error'
    message: string
    metadata: any
    createdAt: string
  }>
}
```

---

### Cancel Task

**POST** `/api/tasks/:taskId/cancel`

**Response:**
```typescript
{
  success: boolean
  message: string
}
```

---

### Retry Task

**POST** `/api/tasks/:taskId/retry`

**Response:**
```typescript
{
  success: boolean
  message: string
  taskId: string
}
```

---

### Trigger Agent

**POST** `/api/trigger`

**Request Body:**
```typescript
{
  repository: {
    owner: string
    name: string
  }
  issueNumber: number
  agentType: string
}
```

**Response:**
```typescript
{
  success: boolean
  taskId: string
  message: string
}
```

---

### Sync Repository

**POST** `/api/sync`

**Request Body:**
```typescript
{
  repository: {
    owner: string
    name: string
  }
  since?: string  // ISO 8601 timestamp
  dryRun?: boolean // If true, only report without creating tasks
}
```

**Response:**
```typescript
{
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
```

### System Status

**GET** `/api/status`

**Response:**
```typescript
{
  worker: {
    status: 'online' | 'offline'
    lastSeen: string
  }
  queue: {
    depth: number
    oldestTaskAge: number | null
  }
  stats: {
    totalTasks: number
    completedTasks: number
    failedTasks: number
    successRate: number
    avgDuration: number
  }
}
```

---

## Success Criteria

**Dashboard is successful when:**

1. **Real-Time Updates**
   - Task status updates reflect in UI within 5 seconds
   - New tasks appear automatically
   - Progress indicators update smoothly

2. **Navigation**
   - All pages accessible
   - Back/forward navigation works
   - URL parameters persist correctly

3. **Data Display**
   - All task information displayed correctly
   - Logs are readable and searchable
   - PR information linked to GitHub

4. **Actions**
   - Cancel works for running tasks
   - Retry works for failed tasks
   - Manual trigger creates tasks successfully

5. **Responsiveness**
   - Works on desktop, tablet, mobile
   - No horizontal scroll
   - Touch targets ≥ 44px

6. **Error Handling**
   - API errors show user-friendly messages
   - Network errors handled gracefully
   - Loading states shown for async operations

---

## Configuration

```typescript
interface DashboardConfig {
  refreshInterval: number      // default: 5000ms (polling)
  logLimit: number           // default: 100 (logs per task)
  paginationLimit: number    // default: 25 (tasks per page)
  maxRetries: number        // default: 3 (API retries)
  timeout: number           // default: 30000ms (API timeout)
}
```

---

## Testing Requirements

### Unit Tests

**Test Suite: `web-dashboard.spec.ts`**

1. **Dashboard Home**
   - ✅ Summary cards display correct data
   - ✅ Recent tasks list loads correctly
   - ✅ System status displays correctly

2. **Task List**
   - ✅ Tasks load with default filters
   - ✅ Filters apply correctly
   - ✅ Sort options work
   - ✅ Pagination works

3. **Task Detail**
   - ✅ Task information displays correctly
   - ✅ Progress timeline shows stages
   - ✅ Logs load and display
   - ✅ PR information displays if available

4. **Manual Trigger**
   - ✅ Issue fetch works
   - ✅ Issue preview displays
   - ✅ Submit creates task
   - ✅ Validation errors display

5. **Settings**
   - ✅ Configuration saves
   - ✅ Validation errors display
   - ✅ Success message shows

### Integration Tests

**Test Suite: `web-dashboard.integration.spec.ts`**

1. **End-to-End Workflows**
   - Navigate home → view task → cancel task
   - Navigate task list → filter → view task
   - Manual trigger → create task → view task detail

2. **Real-Time Updates**
   - Task status changes reflect in UI
   - New tasks appear in list
   - Logs update automatically

3. **Error Handling**
   - API errors show user-friendly messages
   - Network errors handled gracefully
   - Loading states display correctly

---

## Implementation Notes

### Component Structure

```
apps/web/src/
├── pages/
│   ├── dashboard.tsx
│   ├── tasks.tsx
│   ├── task-detail.tsx
│   ├── trigger.tsx
│   └── settings.tsx
├── components/
│   ├── task-summary-cards.tsx
│   ├── task-table.tsx
│   ├── task-status-badge.tsx
│   ├── progress-timeline.tsx
│   ├── log-viewer.tsx
│   └── system-status.tsx
├── hooks/
│   ├── use-tasks.ts
│   ├── use-task-detail.ts
│   ├── use-system-status.ts
│   └── use-interval.ts
├── api/
│   ├── tasks.ts
│   ├── trigger.ts
│   └── status.ts
└── types/
    ├── task.ts
    └── api.ts
```

### Example: Use Tasks Hook

```typescript
// apps/web/src/hooks/use-tasks.ts
export function useTasks(
  filters?: { status?: string; limit?: number; offset?: number }
) {
  const [data, setData] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/tasks?${new URLSearchParams(filters)}`)
        const json = await response.json()
        setData(json.tasks)
      } catch (err) {
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }

    fetchTasks()
  }, [JSON.stringify(filters)])

  return { data, loading, error }
}
```

---

## Performance Considerations

1. **Polling:** 5-second refresh interval balances real-time updates with API load
2. **Virtual Scrolling:** Use virtual scrolling for large log lists
3. **Caching:** Cache task data to reduce API calls
4. **Debouncing:** Debounce search inputs to avoid unnecessary requests

---

## Success Metrics

- **Page Load Time:** < 2 seconds
- **API Response Time:** < 500ms (95th percentile)
- **User Satisfaction:** > 80% of users find interface intuitive (survey)
- **Error Rate:** < 1% of API calls fail

---

## Open Questions

1. **Real-Time Updates:** Polling vs WebSockets vs Server-Sent Events?
2. **Authentication:** Do we need user authentication for dashboard?
3. **Permissions:** Should different users have different access levels?
4. **Dark Mode:** Should we support dark mode?

---

## Next Steps

After implementing this spec:
- **Complete MVP** - All core functionality implemented
- **User Testing** - Gather feedback and iterate
- **Documentation** - Complete setup and usage guides
