import { describe, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { registerBaselineIfNeeded } from '../db-migrate-safe'

const JOURNAL_PATH = path.resolve('drizzle/meta/_journal.json')
const MIGRATIONS_DIR = path.resolve('drizzle')

function makeClient(pg: PGlite) {
  return {
    query: async (sql: string) => {
      const result = await pg.query(sql)
      return result.rows as Array<Record<string, unknown>>
    },
  }
}

async function setupMigrationsTable(pg: PGlite) {
  await pg.exec('CREATE SCHEMA IF NOT EXISTS drizzle')
  await pg.exec(
    'CREATE TABLE drizzle.__drizzle_migrations (hash TEXT NOT NULL, created_at BIGINT NOT NULL)',
  )
}

describe('registerBaselineIfNeeded', () => {
  it('스키마 있고 __drizzle_migrations 비어있으면 journal 항목 삽입', async () => {
    const pg = new PGlite()
    await setupMigrationsTable(pg)
    await pg.exec('CREATE TABLE users (id TEXT)')

    const result = await registerBaselineIfNeeded(makeClient(pg), {
      journalPath: JOURNAL_PATH,
      migrationsDir: MIGRATIONS_DIR,
    })

    expect(result.registered).toBe(true)
    expect(result.rowsInserted).toBe(1)

    const { rows } = await pg.query<{ hash: string }>(
      'SELECT hash FROM drizzle.__drizzle_migrations',
    )
    const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, 'utf8'))
    const sqlContent = fs.readFileSync(
      path.join(MIGRATIONS_DIR, `${journal.entries[0].tag}.sql`),
      'utf8',
    )
    const expectedHash = crypto.createHash('sha256').update(sqlContent).digest('hex')
    expect(rows).toHaveLength(1)
    expect(rows[0].hash).toBe(expectedHash)
  })

  it('__drizzle_migrations에 이미 레코드 있으면 skip', async () => {
    const pg = new PGlite()
    await setupMigrationsTable(pg)
    await pg.exec("INSERT INTO drizzle.__drizzle_migrations VALUES ('existing-hash', 1234567890)")
    await pg.exec('CREATE TABLE users (id TEXT)')

    const result = await registerBaselineIfNeeded(makeClient(pg), {
      journalPath: JOURNAL_PATH,
      migrationsDir: MIGRATIONS_DIR,
    })

    expect(result.registered).toBe(false)
    expect(result.rowsInserted).toBe(0)

    const { rows } = await pg.query('SELECT * FROM drizzle.__drizzle_migrations')
    expect(rows).toHaveLength(1)
  })

  it('public 테이블 없으면 (새 DB) skip', async () => {
    const pg = new PGlite()
    await setupMigrationsTable(pg)

    const result = await registerBaselineIfNeeded(makeClient(pg), {
      journalPath: JOURNAL_PATH,
      migrationsDir: MIGRATIONS_DIR,
    })

    expect(result.registered).toBe(false)
    expect(result.rowsInserted).toBe(0)

    const { rows } = await pg.query('SELECT * FROM drizzle.__drizzle_migrations')
    expect(rows).toHaveLength(0)
  })
})
