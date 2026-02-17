import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as schema from '@workspace/db/schema'
import { loadConfig } from '@workspace/engine/config'
import { Orchestrator } from '@workspace/engine/orchestrator'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

async function main() {
  console.log('🔧 Loom Engine starting...')

  const config = loadConfig()
  console.log(`📡 Watching ${config.repos.length} repo(s)`)
  console.log(`🤖 Agent: ${config.agent.provider} (${config.agent.binary ?? config.agent.provider})`)

  const dbPath = process.env['DATABASE_URL'] ?? ':memory:'
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true })
  }

  const sqlite = new Database(dbPath)
  sqlite.exec('PRAGMA journal_mode = WAL;')
  sqlite.exec('PRAGMA foreign_keys = ON;')

  const db = drizzle(sqlite, { schema })

  // Apply migrations from packages/db/drizzle
  const migrationsFolder = resolve(import.meta.dirname, '../../../packages/db/drizzle')
  migrate(db, { migrationsFolder })
  console.log('✅ Database migrations applied')

  const orchestrator = new Orchestrator(db, config)

  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...')
    orchestrator.stop()
    sqlite.close()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    orchestrator.stop()
    sqlite.close()
    process.exit(0)
  })

  orchestrator.start()
}

await main()
