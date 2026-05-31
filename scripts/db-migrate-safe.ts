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
  // __drizzle_migrations 테이블 존재 여부 확인
  const [tableRow] = await db.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
    ) AS "exists"
  `)
  if (!tableRow?.exists) return { registered: false, rowsInserted: 0 }

  // 이미 레코드 있으면 skip
  const [countRow] = await db.query(
    `SELECT COUNT(*) AS count FROM drizzle.__drizzle_migrations`,
  )
  if (Number(countRow?.count) > 0) return { registered: false, rowsInserted: 0 }

  // public 테이블 없으면 (새 DB) skip
  const [publicRow] = await db.query(`
    SELECT COUNT(*) AS count FROM information_schema.tables
    WHERE table_schema = 'public'
  `)
  if (Number(publicRow?.count) === 0) return { registered: false, rowsInserted: 0 }

  // journal 기반 baseline 레코드 삽입
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

async function main() {
  const sql = postgres(process.env.DATABASE_URL!)
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
