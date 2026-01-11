import * as SqliteDrizzle from '@effect/sql-drizzle/Sqlite'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import { Context, Effect, Layer } from 'effect'
import * as schema from './schema.ts'

export class DrizzleClient extends Context.Tag('DrizzleClient')<DrizzleClient, SqliteRemoteDatabase<typeof schema>>() {}

export class Database extends Context.Tag('Database')<
  Database,
  {
    readonly sql: SqliteClient.SqliteClient
    readonly drizzle: SqliteRemoteDatabase<typeof schema>
  }
>() {}

export const SqlLive = SqliteClient.layer({
  filename: process.env['DATABASE_URL'] ?? ':memory:',
})

export const DrizzleLive = Layer.effect(DrizzleClient, SqliteDrizzle.make<typeof schema>({ schema }))

export const DatabaseLive = Layer.effect(
  Database,
  Effect.gen(function* () {
    const sql = yield* SqliteClient.SqliteClient
    const drizzle = yield* DrizzleClient
    return { drizzle, sql }
  }),
).pipe(Layer.provide(DrizzleLive), Layer.provide(SqlLive))
