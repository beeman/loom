import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const tasks = sqliteTable(
  'tasks',
  {
    createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    description: text('description'),

    githubIssueId: integer('github_issue_id'),
    id: integer('id').primaryKey({ autoIncrement: true }),
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

export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert

export type TaskLog = typeof taskLogs.$inferSelect
export type NewTaskLog = typeof taskLogs.$inferInsert

export { and, asc, desc, eq, or } from 'drizzle-orm'
