import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import postgres from 'postgres'

export interface DbClient {
  query(sql: string): Promise<Array<Record<string, unknown>>>
}

export interface RegisterResult {
  registered: boolean
  rowsInserted: number
}

export async function registerBaselineIfNeeded(
  db: DbClient,
  opts: { journalPath: string; migrationsDir: string },
): Promise<RegisterResult> {
  // 1. drizzle 스키마 + __drizzle_migrations 테이블 보장 (IF NOT EXISTS — 안전)
  await db.query(`CREATE SCHEMA IF NOT EXISTS drizzle`)
  await db.query(
    `CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (hash TEXT NOT NULL, created_at BIGINT NOT NULL)`,
  )

  // 2. 이미 레코드 있으면 skip
  const [countRow] = await db.query(
    `SELECT COUNT(*) AS count FROM drizzle.__drizzle_migrations`,
  )
  if (Number(countRow?.count) > 0) return { registered: false, rowsInserted: 0 }

  // 3. public 테이블 없으면 (새 DB) skip — drizzle-kit migrate가 처음 실행
  const [publicRow] = await db.query(`
    SELECT COUNT(*) AS count FROM information_schema.tables
    WHERE table_schema = 'public'
  `)
  if (Number(publicRow?.count) === 0) return { registered: false, rowsInserted: 0 }

  // 4. journal 기반 baseline 레코드 삽입
  const journal = JSON.parse(fs.readFileSync(opts.journalPath, 'utf8'))
  let rowsInserted = 0
  for (const entry of journal.entries) {
    const sqlContent = fs.readFileSync(`${opts.migrationsDir}/${entry.tag}.sql`, 'utf8')
    const hash = crypto.createHash('sha256').update(sqlContent).digest('hex')
    await db.query(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${hash}', ${entry.when})`,
    )
    rowsInserted++
  }
  return { registered: true, rowsInserted }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set')
  }
  const sql = postgres(process.env.DATABASE_URL)
  const db: DbClient = {
    query: async (q) => {
      const rows = await sql.unsafe(q)
      return rows as unknown as Array<Record<string, unknown>>
    },
  }
  try {
    const result = await registerBaselineIfNeeded(db, {
      journalPath: path.resolve('drizzle/meta/_journal.json'),
      migrationsDir: path.resolve('drizzle'),
    })
    if (result.registered) {
      console.log(`[db-migrate-safe] Registered ${result.rowsInserted} baseline migration(s)`)
    }
  } finally {
    await sql.end()
  }
  execSync('./node_modules/.bin/drizzle-kit migrate', { stdio: 'inherit' })
}

const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
