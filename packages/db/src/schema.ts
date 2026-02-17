import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const repos = sqliteTable(
  'repos',
  {
    createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    githubUrl: text('github_url').notNull(),
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    owner: text('owner').notNull(),
    watchLabel: text('watch_label').notNull().default('loom'),
  },
  (table) => ({
    ownerNameIdx: index('repos_owner_name_idx').on(table.owner, table.name),
  }),
)

export const tasks = sqliteTable(
  'tasks',
  {
    createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    description: text('description'),

    githubIssueId: integer('github_issue_id'),
    id: integer('id').primaryKey({ autoIncrement: true }),
    prNumber: integer('pr_number'),
    prUrl: text('pr_url'),
    repoId: integer('repo_id').references(() => repos.id, { onDelete: 'set null' }),
    status: text('status', { enum: ['todo', 'in_progress', 'completed', 'failed'] })
      .notNull()
      .default('todo'),

    title: text('title').notNull(),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`)
      .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => ({
    createdAtIdx: index('tasks_created_at_idx').on(table.createdAt),
    githubIssueIdIdx: index('tasks_github_issue_id_idx').on(table.githubIssueId),
    repoIdIdx: index('tasks_repo_id_idx').on(table.repoId),
    statusIdx: index('tasks_status_idx').on(table.status),
  }),
)

export const taskLogs = sqliteTable(
  'task_logs',
  {
    createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    id: integer('id').primaryKey({ autoIncrement: true }),

    level: text('level', { enum: ['info', 'warn', 'error'] })
      .notNull()
      .default('info'),
    message: text('message').notNull(),
    metadata: text('metadata', { mode: 'json' }),

    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    createdAtIdx: index('task_logs_created_at_idx').on(table.createdAt),
    taskIdIdx: index('task_logs_task_id_idx').on(table.taskId),
  }),
)

export const agentRuns = sqliteTable(
  'agent_runs',
  {
    completedAt: text('completed_at'),
    error: text('error'),
    id: integer('id').primaryKey({ autoIncrement: true }),
    model: text('model'),
    output: text('output'),
    provider: text('provider').notNull(),
    startedAt: text('started_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    status: text('status', { enum: ['running', 'completed', 'failed'] })
      .notNull()
      .default('running'),
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    statusIdx: index('agent_runs_status_idx').on(table.status),
    taskIdIdx: index('agent_runs_task_id_idx').on(table.taskId),
  }),
)

export type Repo = typeof repos.$inferSelect
export type NewRepo = typeof repos.$inferInsert

export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert

export type TaskLog = typeof taskLogs.$inferSelect
export type NewTaskLog = typeof taskLogs.$inferInsert

export type AgentRun = typeof agentRuns.$inferSelect
export type NewAgentRun = typeof agentRuns.$inferInsert

export { and, asc, desc, eq, or } from 'drizzle-orm'
