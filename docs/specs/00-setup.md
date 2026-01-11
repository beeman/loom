# Spec 00: Database Setup

## Purpose

Create a database abstraction layer using Effect-TS and Drizzle ORM, providing type-safe database operations with dependency injection for use across the entire application.

---

## Overview

The database package (`packages/db`) wraps `@effect/sql-drizzle` to provide:
- **Type-safe database operations** using Drizzle schema
- **Effect-based services** that can be injected using Effect's dependency system
- **Connection management** with proper resource lifecycle
- **Transaction support** for multi-operation atomicity
- **Query helpers** for common operations (CRUD, find, etc.)

This follows the Effect-TS pattern from [`@effect/sql-drizzle/examples/sqlite.ts`](https://github.com/Effect-TS/effect/blob/main/packages/sql-drizzle/examples/sqlite.ts).

---

## Context

**Position in Architecture:**
```
packages/db
├── Database Abstraction (Effect + Drizzle)
├── Schema Definitions (Drizzle with indexes)
├── Service Tags (TasksService, LogsService)
├── Service Layers (TasksServiceLive, LogsServiceLive)
└── Migrations (optional for MVP)
```

**Dependencies:**
- `@effect/sql` - Effect SQL library
- `@effect/sql-drizzle/Sqlite` - Drizzle integration
- `@effect/sql-sqlite-bun` - SQLite client for Bun runtime
- `drizzle-orm` - Drizzle ORM

**Used By:**
- All specs that need database access (Ingestion, Dispatch, Implementation, etc.)
- API endpoints (apps/api)
- Worker (apps/worker)
- Dashboard (apps/web)

---

## Database Schema

### Tasks Table

```typescript
interface Task {
  id: string                    // Primary key (task_xxx)
  githubIssueId: number         // GitHub issue ID
  githubIssueNumber: number      // GitHub issue number (for display)
  githubIssueTitle: string       // Issue title (for display)
  githubRepoId: number         // GitHub repository ID
  githubRepoName: string        // Repository name
  githubRepoOwner: string       // Repository owner
  status: TaskStatus            // Task status
  agentType: string            // Agent type (MVP: "default")
  attempts: number              // Retry count
  prNumber: number | null      // Associated PR number
  prUrl: string | null         // PR URL
  createdAt: Date              // Task creation timestamp
  startedAt: Date | null       // Task start timestamp
  completedAt: Date | null     // Task completion timestamp
  updatedAt: Date              // Last update timestamp
}

enum TaskStatus {
  PENDING = 'pending'
  RUNNING = 'running'
  COMPLETED = 'completed'
  FAILED = 'failed'
  CANCELLED = 'cancelled'
}
```

### Task Logs Table

```typescript
interface TaskLog {
  id: number                    // Primary key (auto-increment)
  taskId: string                // Foreign key to tasks.id
  level: LogLevel               // Log level
  message: string               // Log message
  metadata: any | null         // Additional structured data (JSON)
  createdAt: Date              // Log timestamp
}

enum LogLevel {
  DEBUG = 'debug'
  INFO = 'info'
  WARN = 'warn'
  ERROR = 'error'
}
```

---

## Drizzle Schema Definition

```typescript
// packages/db/src/schema.ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { eq, desc } from 'drizzle-orm'

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  githubIssueId: integer('github_issue_id').notNull(),
  githubIssueNumber: integer('github_issue_number').notNull(),
  githubIssueTitle: text('github_issue_title').notNull(),
  githubRepoId: integer('github_repo_id').notNull(),
  githubRepoName: text('github_repo_name').notNull(),
  githubRepoOwner: text('github_repo_owner').notNull(),
  status: text('status').notNull(), // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  agentType: text('agent_type').notNull().default('default'),
  attempts: integer('attempts').notNull().default(0),
  prNumber: integer('pr_number'),
  prUrl: text('pr_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  statusIdx: index('tasks_status_idx').on(table.status),
  githubIssueIdIdx: index('tasks_github_issue_id_idx').on(table.githubIssueId),
  createdAtIdx: index('tasks_created_at_idx').on(table.createdAt),
}))

export const taskLogs = sqliteTable('task_logs', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  level: text('level').notNull(), // 'debug' | 'info' | 'warn' | 'error'
  message: text('message').notNull(),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  taskIdIdx: index('task_logs_task_id_idx').on(table.taskId),
  createdAtIdx: index('task_logs_created_at_idx').on(table.createdAt),
}))

// Types
export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
export type TaskUpdate = typeof tasks.$inferUpdate
export type TaskLog = typeof taskLogs.$inferSelect
export type NewTaskLog = typeof taskLogs.$inferInsert

// Re-export query builders
export { eq, desc }
```

---

## Effect Services

### Database Layer

```typescript
// packages/db/src/database.ts
import { SqlClient } from '@effect/sql'
import * as SqliteDrizzle from '@effect/sql-drizzle/Sqlite'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { Effect, Layer, Context } from 'effect'
import * as schema from './schema'

// Tags
export class Database extends Context.Tag('Database')<
  Database,
  {
    readonly sql: SqlClient.SqlClient
    readonly drizzle: SqliteDrizzle.SqliteDrizzle
  }
>() {}

// Layers
export const SqlLive = SqliteClient.layer({
  filename: process.env.DATABASE_URL || ':memory:',
})

export const DrizzleLive = SqliteDrizzle.layer.pipe(
  Layer.provide(SqlLive)
)

export const DatabaseLive = Layer.mergeAll(SqlLive, DrizzleLive)
```

### Task Service

```typescript
// packages/db/src/tasks.ts
import { Effect, pipe, Context, Layer } from 'effect'
import { Database } from './database'
import * as schema from './schema'
import { eq, desc } from './schema'

export interface TaskCreateInput {
  githubIssueId: number
  githubIssueNumber: number
  githubIssueTitle: string
  githubRepoId: number
  githubRepoName: string
  githubRepoOwner: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  agentType: string
}

export interface TaskUpdateInput {
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  attempts?: number
  prNumber?: number
  prUrl?: string
  startedAt?: Date
  completedAt?: Date
}

export class TasksService extends Context.Tag('TasksService')<
  TasksService,
  {
    readonly create: (input: TaskCreateInput) => Effect.Effect<schema.Task, Error>
    readonly findById: (taskId: string) => Effect.Effect<schema.Task | null, Error>
    readonly findByGithubIssueId: (issueId: number) => Effect.Effect<schema.Task | null, Error>
    readonly findMany: (filters?: {
      status?: string
      limit?: number
      offset?: number
    }) => Effect.Effect<schema.Task[], Error>
    readonly update: (taskId: string, input: TaskUpdateInput) => Effect.Effect<schema.Task | null, Error>
    readonly delete: (taskId: string) => Effect.Effect<void, Error>
  }
>() {}

export const TasksServiceLive = Layer.effect(
  TasksService,
  Effect.gen(function* () {
    const { drizzle } = yield* Database

    return {
      // Create a new task
      create: (input: TaskCreateInput) =>
        Effect.gen(function* () {
          const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`

          const task = yield* drizzle.insert(schema.tasks).values({
            ...input,
            id: taskId,
          }).returning()

          return task[0]
        }),

      // Find task by ID
      findById: (taskId: string) =>
        Effect.gen(function* () {
          const result = yield* drizzle
            .select()
            .from(schema.tasks)
            .where(eq(schema.tasks.id, taskId))
            .limit(1)

          return result[0] || null
        }),

      // Find task by GitHub issue ID
      findByGithubIssueId: (issueId: number) =>
        Effect.gen(function* () {
          const result = yield* drizzle
            .select()
            .from(schema.tasks)
            .where(eq(schema.tasks.githubIssueId, issueId))
            .limit(1)

          return result[0] || null
        }),

      // List tasks with optional filters
      findMany: (filters?: {
        status?: string
        limit?: number
        offset?: number
      }) =>
        Effect.gen(function* () {
          let query = drizzle.select().from(schema.tasks)

          if (filters?.status) {
            query = query.where(eq(schema.tasks.status, filters.status))
          }

          query = query.orderBy(desc(schema.tasks.createdAt))

          if (filters?.limit) {
            query = query.limit(filters.limit)
          }

          if (filters?.offset) {
            query = query.offset(filters.offset)
          }

          return yield* query
        }),

      // Update task
      update: (taskId: string, input: TaskUpdateInput) =>
        Effect.gen(function* () {
          const result = yield* drizzle
            .update(schema.tasks)
            .set({
              ...input,
              updatedAt: new Date(),
            })
            .where(eq(schema.tasks.id, taskId))
            .returning()

          return result[0] || null
        }),

      // Delete task
      delete: (taskId: string) =>
        Effect.gen(function* () {
          yield* drizzle.delete(schema.tasks).where(eq(schema.tasks.id, taskId))
        }),
    }
  })
)
```

### Task Log Service

```typescript
// packages/db/src/logs.ts
import { Effect, Context, Layer } from 'effect'
import { Database } from './database'
import * as schema from './schema'
import { eq, desc } from './schema'

export interface LogCreateInput {
  taskId: string
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  metadata?: unknown
}

export class LogsService extends Context.Tag('LogsService')<
  LogsService,
  {
    readonly create: (input: LogCreateInput) => Effect.Effect<schema.TaskLog, Error>
    readonly findByTaskId: (taskId: string, limit?: number) => Effect.Effect<schema.TaskLog[], Error>
    readonly deleteByTaskId: (taskId: string) => Effect.Effect<void, Error>
  }
>() {}

export const LogsServiceLive = Layer.effect(
  LogsService,
  Effect.gen(function* () {
    const { drizzle } = yield* Database

    return {
      // Create a log entry
      create: (input: LogCreateInput) =>
        Effect.gen(function* () {
          const result = yield* drizzle.insert(schema.taskLogs).values({
            ...input,
            createdAt: new Date(),
          }).returning()

          return result[0]
        }),

      // Find logs for a task
      findByTaskId: (taskId: string, limit = 100) =>
        Effect.gen(function* () {
          const result = yield* drizzle
            .select()
            .from(schema.taskLogs)
            .where(eq(schema.taskLogs.taskId, taskId))
            .orderBy(desc(schema.taskLogs.createdAt))
            .limit(limit)

          return result
        }),

      // Delete logs for a task (cascade on task delete)
      deleteByTaskId: (taskId: string) =>
        Effect.gen(function* () {
          yield* drizzle
            .delete(schema.taskLogs)
            .where(eq(schema.taskLogs.taskId, taskId))
        }),
    }
  })
)
```

---

## API Exposure

To enable easy interaction and testing, the database services will be exposed via HTTP endpoints in the `apps/api` application.

### Routes Definition

```typescript
// apps/api/src/routes/tasks/api.ts
import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"
import { Task } from "@workspace/db/schema"

// Define Schemas for Requests
const CreateTaskSchema = Schema.Struct({
  githubIssueId: Schema.Number,
  githubIssueNumber: Schema.Number,
  githubIssueTitle: Schema.String,
  githubRepoId: Schema.Number,
  githubRepoName: Schema.String,
  githubRepoOwner: Schema.String,
  agentType: Schema.String,
  status: Schema.Literal('pending', 'running', 'completed', 'failed', 'cancelled')
})

export class TasksApi extends HttpApiGroup.make("Tasks")
  .add(
    HttpApiEndpoint.get("list", "/api/tasks")
      .addSuccess(Schema.Array(Schema.Any)) // TODO: Refine Task Schema
  )
  .add(
    HttpApiEndpoint.post("create", "/api/tasks")
      .setBody(CreateTaskSchema)
      .addSuccess(Schema.Any)
  )
  .add(
    HttpApiEndpoint.get("findById", "/api/tasks/:id")
      .setPath(Schema.Struct({ id: Schema.String }))
      .addSuccess(Schema.Any)
  )
{}
```

### Route Implementation

```typescript
// apps/api/src/routes/tasks/http.ts
import { HttpApiBuilder } from "@effect/platform"
import { TasksService } from "@workspace/db"
import { Effect } from "effect"
import { TasksApi } from "./api"

export const TasksHttpLive = HttpApiBuilder.group(TasksApi, "Tasks", (handlers) =>
  Effect.gen(function* () {
    const { create, findById, findMany } = yield* TasksService

    return handlers
      .handle("list", () => findMany({ limit: 50 }))
      .handle("create", (req) => create(req.body))
      .handle("findById", (req) => findById(req.path.id))
  })
)
```

### Curl Verification

```bash
# Health check
curl http://localhost:8787/api/health

# Create a task
curl -X POST http://localhost:8787/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "githubIssueId": 123,
    "githubIssueNumber": 42,
    "githubIssueTitle": "Test Issue",
    "githubRepoId": 456,
    "githubRepoName": "loom",
    "githubRepoOwner": "beeman",
    "agentType": "default",
    "status": "pending"
  }'

# List tasks
curl http://localhost:8787/api/tasks

# Get specific task
curl http://localhost:8787/api/tasks/<task_id_from_previous_response>
```

---

## Package Structure

```
packages/db/
├── src/
│   ├── schema.ts           # Drizzle schema definitions (includes indexes)
│   ├── database.ts         # Database layer (Database Tag, SqlLive, DrizzleLive, DatabaseLive)
│   ├── tasks.ts            # TasksService Tag and TasksServiceLive layer
│   ├── logs.ts             # LogsService Tag and LogsServiceLive layer
│   └── index.ts            # Public API exports
├── drizzle.config.ts       # Drizzle configuration
├── package.json
└── tsconfig.json
```

---

## Success Criteria

**Database setup is successful when:**

1. **Package Created**
   - `packages/db` package exists
   - Dependencies installed (`@effect/sql`, `@effect/sql-drizzle/Sqlite`, `drizzle-orm`, `@effect/sql-sqlite-bun`)

2. **Schema Defined**
   - Drizzle schema exported with indexes
   - TypeScript types inferred correctly
   - Foreign key constraints defined
   - Query helpers (`eq`, `desc`) exported

3. **Database Layer Exports**
   - `Database` tag for dependency injection
   - `DatabaseLive` layer available
   - Can be provided to Effect workflows

4. **Service Tags Defined**
   - `TasksService` tag with all CRUD operations
   - `LogsService` tag with all CRUD operations
   - `TasksServiceLive` layer implemented
   - `LogsServiceLive` layer implemented

5. **Type Safety**
   - All database operations use inferred types
   - No `any` types in schema (use `unknown` or explicit types for metadata)
   - Proper error types (Effect error channels)

6. **Integration Ready**
   - Other packages can import Tags and Layers
   - Services can be provided via layer composition in tests
   - Works with in-memory SQLite for tests

---

## Configuration

```typescript
interface DatabaseConfig {
  databaseUrl: string           // default: ':memory:' for tests, process.env.DATABASE_URL for prod
  migrationsDir?: string        // Optional: path to migrations (MVP: not needed)
  readonly: boolean             // default: false
}
```

---

## Testing Requirements

### Unit Tests

**Test Suite: `database.spec.ts`**

1. **Schema Types**
   - ✅ Task type inferred correctly
   - ✅ TaskLog type inferred correctly
   - ✅ Enums match expected values

2. **Task Service**
   - ✅ create inserts task with generated ID
   - ✅ findById returns task or null
   - ✅ findByGithubIssueId returns task or null
   - ✅ findMany respects filters (status, limit, offset)
   - ✅ update modifies task fields
   - ✅ delete removes task

3. **Log Service**
   - ✅ create inserts log with timestamp
   - ✅ findByTaskId returns logs sorted by createdAt
   - ✅ deleteByTaskId removes all logs for task

4. **Database Layer**
   - ✅ DatabaseLive layer provides sql and drizzle
   - ✅ SqlLive layer configures SQLite client
   - ✅ Dependency injection works with Effect.provide

5. **Error Handling**
   - ✅ Database errors are caught in Effect
   - ✅ Constraint violations are handled
   - ✅ Transaction rollback on failure

### Integration Tests

**Test Suite: `database.integration.spec.ts`**

1. **End-to-End Workflow**
   - Create task → find task → update task → delete task
   - Verify all operations succeed

2. **Transaction Support** (if implemented)
   - Multiple operations in transaction
   - Rollback on failure

3. **Database Initialization**
   - Database created from schema
   - Tables created correctly
   - Foreign key constraints enforced

---

## Implementation Notes

### Main Export

```typescript
// packages/db/src/index.ts
import { Layer } from 'effect'

export * from './schema'

export { Database, DatabaseLive } from './database'

export { TasksService, TasksServiceLive } from './tasks'
export { LogsService, LogsServiceLive } from './logs'

// Convenience layer that provides all services
export const DbLive = Layer.mergeAll(
  DatabaseLive,
  TasksServiceLive,
  LogsServiceLive
)
```

### Drizzle Configuration

```typescript
// packages/db/drizzle.config.ts
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'bun',
} satisfies Config
```

### Package.json

```json
{
  "name": "@workspace/db",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    "./*": "./src/*.ts"
  },
  "dependencies": {
    "@effect/sql": "catalog:",
    "@effect/sql-drizzle/Sqlite": "catalog:",
    "@effect/sql-sqlite-bun": "catalog:",
    "drizzle-orm": "catalog:",
    "effect": "catalog:"
  },
  "devDependencies": {
    "@workspace/config-typescript": "workspace:*",
    "drizzle-kit": "catalog:",
    "typescript": "catalog:"
  },
  "scripts": {
    "check-types": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "db:push": "drizzle-kit push"
  }
}
```

### Usage Example

```typescript
// In any other package
import { Effect } from 'effect'
import { DbLive, TasksService } from '@workspace/db'

const workflow = Effect.gen(function* () {
  const { create, findById } = yield* TasksService

  const task = yield* create({
    githubIssueId: 42,
    githubIssueNumber: 42,
    githubIssueTitle: 'Fix bug',
    githubRepoId: 123,
    githubRepoName: 'loom',
    githubRepoOwner: 'beeman',
    status: 'pending',
    agentType: 'default'
  })

  const foundTask = yield* findById(task.id)
  console.log(foundTask)
}).pipe(
  Effect.provide(DbLive),
  Effect.runPromise
)
```

### Database Migration (MVP - Optional)

For MVP, we can use schema auto-creation with Drizzle:

```typescript
// On startup, create tables if they don't exist
const setupDatabase = Effect.gen(function* () {
  const { sql } = yield* Database

  yield* sql`CREATE TABLE IF NOT EXISTS tasks (...)`
  yield* sql`CREATE TABLE IF NOT EXISTS task_logs (...)`
})
```

For v1, add Drizzle migrations with `drizzle-kit`.

---

## Performance Considerations

1. **Connection Pooling**: SQLite single-file, but can configure for production
2. **Indexes**: Schema includes indexes on frequently queried fields:
   - `tasks_status_idx` on tasks.status
   - `tasks_github_issue_id_idx` on tasks.githubIssueId
   - `tasks_created_at_idx` on tasks.createdAt
   - `task_logs_task_id_idx` on task_logs.taskId
   - `task_logs_created_at_idx` on task_logs.createdAt
3. **Batch Operations**: Use `insertMany` for bulk inserts
4. **Query Optimization**: Use `select()` with `limit` and `offset` for pagination

---

## Success Metrics

- **Query Latency**: < 50ms for single-row queries
- **Insert Latency**: < 100ms for single insert
- **Type Coverage**: 100% of database operations use inferred types
- **Test Coverage**: > 90% for all database operations

---

## Open Questions

1. **Migrations Strategy**: Should we use Drizzle migrations or schema auto-creation for MVP?
2. **Database Location**: Where to store database file in production?
3. **Backup Strategy**: How to backup database for recovery?

---

## Next Steps

After implementing this spec, proceed to:
- **Spec 01: GitHub Ingestion** - Use TaskService for task creation
- **Spec 02: Agent Dispatch** - Use TaskService for task updates
- **Spec 03-07**: Update all specs to use Database services

---

## Dependencies to Update

These specs need to be updated to use the new database package:

- [ ] **Spec 01**: Update to use `TasksService` tag and `create`/`findByGithubIssueId` methods from `@workspace/db`
- [ ] **Spec 02**: Update to use `TasksService.update` for status changes from `@workspace/db`
- [ ] **Spec 06**: Update to use `LogsService` tag and `create` method for logging from `@workspace/db`
- [ ] **Spec 07**: Update API endpoints to use database service Tags from `@workspace/db`

Note: When using these services, provide the `DbLive` layer which includes all database services.

