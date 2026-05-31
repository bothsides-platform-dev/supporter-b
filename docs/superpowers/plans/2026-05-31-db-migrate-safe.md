# db-migrate-safe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pnpm db:migrate`가 스키마는 있지만 `__drizzle_migrations`가 비어 있는 DB에서도 실패 없이 동작하도록 baseline 자동 등록 래퍼를 추가한다.

**Architecture:** `scripts/db-migrate-safe.ts`가 `registerBaselineIfNeeded(db, opts)` 함수를 내보낸다. 함수는 (1) `__drizzle_migrations` 존재+비어 있고 (2) `public` 테이블이 있을 때만 journal 기반으로 baseline 레코드를 삽입하고, 이후 `drizzle-kit migrate`를 실행한다. `package.json`의 `db:migrate`가 이 스크립트를 호출하므로 deploy.sh는 수정 불필요.

**Tech Stack:** TypeScript (tsx), postgres-js (기존 의존성), @electric-sql/pglite (테스트), Node.js crypto/fs/child_process

---

### Task 1: 실패하는 테스트 작성

**Files:**
- Create: `__tests__/db-migrate-safe.test.ts`

- [ ] **Step 1: 테스트 파일 작성**

```typescript
// __tests__/db-migrate-safe.test.ts
import { describe, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { registerBaselineIfNeeded } from '../scripts/db-migrate-safe'

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
    const sqlContent = fs.readFileSync(
      path.join(MIGRATIONS_DIR, '0000_certain_sister_grimm.sql'),
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
```

- [ ] **Step 2: 테스트 실행 — RED 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test __tests__/db-migrate-safe.test.ts
```

Expected: `Cannot find module '../scripts/db-migrate-safe'` 또는 `registerBaselineIfNeeded is not a function` 로 **FAIL**

---

### Task 2: `registerBaselineIfNeeded` 구현

**Files:**
- Create: `scripts/db-migrate-safe.ts`

- [ ] **Step 3: 스크립트 파일 작성**

```typescript
// scripts/db-migrate-safe.ts
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
  // 1. __drizzle_migrations 테이블 존재 여부 확인
  const [tableRow] = await db.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
    ) AS "exists"
  `)
  if (!tableRow?.exists) return { registered: false, rowsInserted: 0 }

  // 2. __drizzle_migrations가 비어 있는지 확인
  const [countRow] = await db.query(
    `SELECT COUNT(*) AS count FROM drizzle.__drizzle_migrations`,
  )
  if (Number(countRow?.count) > 0) return { registered: false, rowsInserted: 0 }

  // 3. public 테이블 존재 여부 확인 (새 DB면 migrate가 처음 실행)
  const [publicRow] = await db.query(`
    SELECT COUNT(*) AS count FROM information_schema.tables
    WHERE table_schema = 'public'
  `)
  if (Number(publicRow?.count) === 0) return { registered: false, rowsInserted: 0 }

  // 4. journal 기반으로 baseline 레코드 삽입
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
```

- [ ] **Step 4: 테스트 실행 — GREEN 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test __tests__/db-migrate-safe.test.ts
```

Expected: `3 tests passed`

- [ ] **Step 5: 커밋**

```bash
git add scripts/db-migrate-safe.ts __tests__/db-migrate-safe.test.ts
git commit -m "feat(db): db-migrate-safe baseline 자동 등록 래퍼 추가"
```

---

### Task 3: `package.json` `db:migrate` 스크립트 수정

**Files:**
- Modify: `package.json`

- [ ] **Step 6: `db:migrate` 스크립트 변경**

`package.json`의 `scripts` 블록에서:

```json
"db:migrate": "drizzle-kit migrate",
```

→

```json
"db:migrate": "tsx scripts/db-migrate-safe.ts",
```

- [ ] **Step 7: 전체 테스트 GREEN 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test
```

Expected: 기존 테스트 전부 통과 (새 3개 포함)

- [ ] **Step 8: `pnpm db:migrate` 엔드투엔드 확인**

```bash
pnpm db:migrate
```

Expected: `[✓] migrations applied successfully!`

- [ ] **Step 9: 커밋**

```bash
git add package.json
git commit -m "chore(db): db:migrate → db-migrate-safe 래퍼로 교체"
```
