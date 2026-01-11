import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { Database, DatabaseLive } from './database.ts'
import { tasks } from './schema.ts'

describe('packages/db/database', () => {
  describe('expected behavior', () => {
    it('should provide the database service', async () => {
      // ARRANGE
      expect.assertions(1)

      const program = Effect.gen(function* () {
        const db = yield* Database

        return db
      })

      // ACT
      const result = await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)))

      // ASSERT
      expect(result).toBeDefined()
    })

    it('should have correct enum values', () => {
      // ARRANGE
      expect.assertions(1)
      const expectedEnums = ['todo', 'in_progress', 'completed', 'failed']

      // ACT
      const statusColumn = tasks.status

      // ASSERT
      expect(statusColumn.enumValues).toEqual(expectedEnums)
    })
  })
})
