# Loom Architecture Overview

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Webhooks │  │   Issues │  │   PRs    │  │  Commits │  │
│  └─────┬────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│        │              │               │               │          │
└────────┼──────────────┼───────────────┼───────────────┼─────────┘
         │              │               │               │
         │ Webhook      │ Read/Write    │ Read/Write
         ▼              ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     apps/api (Cloudflare Workers)            │
│                                                              │
│  ┌──────────────┐    ┌──────────────────────────────────┐   │
│  │ HTTP Server  │    │  Durable Objects               │   │
│  │ (Webhooks)   │◄───┤  AgentCoordinator              │   │
│  └──────┬───────┘    │  - Task Queue                 │   │
│         │            │  - State Management            │   │
│         │            │  - Task Orchestration          │   │
│         │            └──────────────────────────────────┘   │
│         │                                                │
│         ▼                                                │
│  ┌──────────────┐    ┌──────────────────────────────────┐   │
│  │ Database API  │────►│  SQLite Database                │   │
│  └──────────────┘    │  - tasks                        │   │
│                      │  - task_logs                    │   │
│                      └──────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
         │
         │ Task Data
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                 apps/worker (Cloudflare Workers)             │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Worker Loop                                       │    │
│  │  1. Poll Queue                                    │    │
│  │  2. Dequeue Task                                   │    │
│  │  3. Execute Orchestration Workflow                   │    │
│  │  4. Update Status                                  │    │
│  └──────────────────┬───────────────────────────────┘    │
│                     │                                    │
│                     ▼                                    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Orchestration Workflow                              │    │
│  │  1. Implementation (LLM + Code Generation)        │    │
│  │  2. Verification (Test Execution)                   │    │
│  │  3. PR Creation (GitHub API)                      │    │
│  └──────────────────┬───────────────────────────────┘    │
│                     │                                    │
│                     ▼                                    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Integrations                                     │    │
│  │  - GitHub Service (Octokit)                       │    │
│  │  - Git Service (Simple Git)                       │    │
│  │  - AI Service (OpenAI/Anthropic)                 │    │
│  │  - Test Runner (Vitest/Jest/etc)                  │    │
│  └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
         │
         │ API Calls
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  apps/web (React + Vite)                    │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐│
│  │Dashboard │  │Task List │  │Task Dtl  │  │Trigger   ││
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘│
│       │               │               │               │          │
└───────┼───────────────┼───────────────┼──────────────┼──────────┘
        │               │               │               │
        ▼               ▼               ▼               ▼
   HTTP API Calls (GET/POST /api/*)
```

---

## Package Structure

```
loom/
├── apps/
│   ├── api/                    # Cloudflare Workers (HTTP + Webhooks)
│   │   └── src/
│   │       ├── durable-objects/  # Durable Object implementations
│   │       │   └── agent-coordinator.ts
│   │       ├── routes/          # HTTP route handlers
│   │       │   └── root/
│   │       │       ├── api.ts
│   │       │       └── http.ts
│   │       ├── api.ts          # Main API definition
│   │       ├── http.ts         # HTTP server setup
│   │       └── index.ts        # Entry point
│   │
│   ├── worker/                 # Background worker (Task processing)
│   │   └── src/
│   │       ├── worker-loop.ts   # Main polling loop
│   │       └── index.ts        # Entry point
│   │
│   └── web/                   # React dashboard (Monitoring UI)
│       └── src/
│           ├── pages/          # Page components
│           ├── components/     # Reusable components
│           ├── hooks/          # Custom React hooks
│           ├── api/           # API client functions
│           └── types/         # TypeScript types
│
└── packages/
    ├── core/                   # Core orchestration workflows
    │   └── src/
    │       ├── ingestion/       # Webhook handling
    │       ├── dispatch/        # Task dispatching
    │       ├── implementation/  # AI code generation
    │       ├── verification/    # Test execution
    │       ├── pr-creation/    # Pull request creation
    │       └── orchestration/  # Full pipeline
    │
    ├── agents/                 # Agent implementations
    │   └── src/
    │       ├── analyzer/        # Issue analysis
    │       ├── explorer/        # Codebase exploration
    │       ├── planner/        # Implementation planning
    │       ├── generator/       # Code generation (LLM)
    │       └── reviewer/        # Code self-review
    │
    ├── integrations/           # External service integrations
    │   └── src/
    │       ├── github/          # GitHub API (Octokit)
    │       ├── git/            # Git operations
    │       ├── ai/             # LLM providers
    │       └── test-runner/     # Test execution
    │
    ├── database/               # Database abstractions
    │   └── src/
    │       ├── schema.ts        # SQL schema
    │       ├── tasks.ts        # Task CRUD
    │       └── logs.ts         # Log operations
    │
    └── [existing packages]
        ├── ui/                # UI components (already exists)
        ├── shell/             # Shell components (already exists)
        ├── env/               # Environment variables (already exists)
        ├── config-typescript/  # TypeScript config (already exists)
        ├── config-vite/       # Vite config (already exists)
        ├── config-vitest/     # Vitest config (already exists)
        ├── flags/             # Feature flags (already exists)
        └── i18n/             # Internationalization (already exists)
```

---

## Data Flow

### 1. Webhook Flow

```
GitHub Issue (labeled with loom:ready)
    ↓
[OPTIONAL 1: Webhook] POST /webhooks/github
[OPTIONAL 2: Sync] POST /api/sync (manual trigger)
    ↓
Verify Signature (webhook only)
    ↓
Validate Event + Labels
    ↓
Check for Existing Task (duplicate prevention)
    ↓
Create Task in Database (status: pending)
    ↓
Enqueue to AgentCoordinator Durable Object
    ↓
Return Response (202 webhook, 200 sync)
```

---

### 2. Worker Flow

```
Worker Polls AgentCoordinator
    ↓
Dequeue Task (status: running)
    ↓
Update Database
    ↓
Execute Orchestration Workflow:
    ├─ Implementation
    │   ├─ Analyze Issue (LLM)
    │   ├─ Explore Codebase
    │   ├─ Generate Plan (LLM)
    │   ├─ Generate Code (LLM)
    │   ├─ Self-Review (LLM)
    │   └─ Commit Changes (Git)
    ├─ Verification
    │   ├─ Detect Test Framework
    │   ├─ Execute Tests
    │   └─ Gate Decision
    └─ PR Creation
        ├─ Generate PR Title/Description
        ├─ Create PR (GitHub API)
        ├─ Add Labels & Reviewers
        └─ Link to Issue
    ↓
Update Database (status: completed/failed)
    ↓
Log Events
```

---

### 3. Dashboard Flow

```
User Opens Dashboard
    ↓
GET /api/status (System Status)
    ↓
GET /api/tasks (Task List)
    ↓
Display Summary Cards
    ↓
User Clicks Task
    ↓
GET /api/tasks/:taskId (Task Detail)
    ↓
Display Task Information
    ↓
GET /api/tasks/:taskId/logs (Logs)
    ↓
Display Logs
    ↓
Poll Every 5 Seconds (Real-Time Updates)
```

---

## Technology Stack

### Core Runtime
- **Bun** - JavaScript runtime
- **TypeScript** - Type-safe development
- **Turbo** - Monorepo management

### Backend
- **Cloudflare Workers** - Serverless compute platform
- **Effect-ts** - Functional effects for orchestration
- **Durable Objects** - Stateful coordination
- **SQLite** - Database (better-sqlite3)
- **Octokit** - GitHub API client

### AI/ML
- **OpenAI GPT-4** - Primary LLM
- **Anthropic Claude 3.5** - Backup LLM
- **Custom Prompts** - Code generation and review

### Frontend
- **React 19** - UI framework
- **Vite** - Build tool
- **TanStack Query** - Data fetching
- **Tailwind CSS 4** - Styling
- **Lucide React** - Icons

### Testing
- **Vitest** - Unit testing
- **Playwright** - E2E testing
- **Effect-ts Testing** - Workflow testing

---

## Database Schema

### Tasks Table

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  github_issue_id INTEGER NOT NULL,
  github_issue_number INTEGER NOT NULL,
  github_issue_title TEXT NOT NULL,
  github_repo_id INTEGER NOT NULL,
  github_repo_name TEXT NOT NULL,
  github_repo_owner TEXT NOT NULL,
  status TEXT NOT NULL, -- 'pending' | 'running' | 'completed' | 'failed'
  agent_type TEXT NOT NULL,
  pr_number INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (github_issue_id) REFERENCES issues(id)
);
```

### Task Logs Table

```sql
CREATE TABLE task_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  level TEXT NOT NULL, -- 'info' | 'warn' | 'error' | 'debug'
  message TEXT NOT NULL,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
```

### Indexes

```sql
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX idx_task_logs_task_id ON task_logs(task_id);
CREATE INDEX idx_task_logs_created_at ON task_logs(created_at DESC);
```

---

## API Endpoints

### GitHub Webhooks
- `POST /webhooks/github` - Receive GitHub webhook events

### Sync API
- `POST /api/sync` - Sync issues from GitHub (manual trigger or scheduled)

### Tasks API
- `GET /api/tasks` - List tasks (with filters, pagination)
- `GET /api/tasks/:taskId` - Get task detail
- `POST /api/tasks/:taskId/cancel` - Cancel running task
- `POST /api/tasks/:taskId/retry` - Retry failed task

### Trigger API
- `POST /api/trigger` - Manually trigger agent for issue

### Status API
- `GET /api/status` - System status (worker, queue, stats)

### Health
- `GET /` - Health check

---

## Configuration

### Environment Variables

```bash
# GitHub
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_APP_ID=your-github-app-id
GITHUB_APP_PRIVATE_KEY=your-private-key

# AI
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key

# Database
DATABASE_URL=/tmp/loom.db

# Workers
WORKER_POLL_INTERVAL=5000
MAX_CONCURRENT_TASKS=10
```

---

## Security Considerations

### Webhook Security
- ✅ Signature verification for all webhooks
- ✅ HTTPS only
- ✅ Rate limiting per IP

### AI Security
- ✅ API keys stored in environment variables
- ✅ No prompt injection from issue titles
- ✅ Code execution in sandboxed environment

### Database Security
- ✅ SQL parameterization (prepared statements)
- ✅ No direct user input in SQL queries
- ✅ Regular backups

### Worker Security
- ✅ Resource limits (CPU, memory)
- ✅ Timeout enforcement
- ✅ Network isolation

---

## Scalability Considerations

### Current MVP Limits
- Single worker instance
- 10 concurrent tasks
- 5-second polling interval
- SQLite (single-file database)

### Scaling Paths

1. **Worker Scaling**
   - Add multiple worker instances
   - Use Cloudflare Workers Auto-Scaling
   - Distribute load across workers

2. **Database Scaling**
   - Migrate to PostgreSQL
   - Add connection pooling
   - Implement read replicas

3. **Queue Scaling**
   - External queue (BullMQ, Redis)
   - Priority queues
   - Dead letter queue

4. **AI Scaling**
   - Multiple LLM providers
   - Model tiering (GPT-4 for complex, GPT-3.5 for simple)
   - Caching of responses

---

## Monitoring & Observability

### Metrics to Track
- Task throughput (tasks/hour)
- Success rate (completed / total)
- Average duration per stage
- Queue depth
- Worker uptime
- API error rates
- LLM token usage

### Logging Strategy
- Structured JSON logs
- Log levels: debug, info, warn, error
- Correlation IDs for task tracing
- Log retention: 30 days

### Alerting
- Worker offline > 5 minutes
- Queue depth > 50 tasks
- Success rate < 60%
- API error rate > 5%

---

## Next Steps

1. **Implement Specs** - Follow spec-driven development
2. **Add Tests** - Unit and integration tests for all components
3. **Documentation** - Complete setup and user guides
4. **Beta Testing** - Test with real repositories
5. **Iterate** - Gather feedback and improve

---

## References

- **Specs:** `docs/specs/` - Detailed implementation specs
- **Roadmap:** `docs/specs/README.md` - MVP roadmap
- **AGENTS.md:** `/AGENTS.md` - Development guidelines
