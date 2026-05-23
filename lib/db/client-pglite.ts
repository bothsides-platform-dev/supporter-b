// In-process pglite for tests. createPgliteDb() returns a singleton DB handle
// (one PGlite WASM instance per module — i.e. per test file under vitest's
// default isolate:true fork pool). On first call: init + migrate. On every
// subsequent call: TRUNCATE all public user tables (RESTART IDENTITY CASCADE)
// so each test starts with an empty schema without paying WASM re-init cost.
//
// Safety: vitest uses forks + isolate:true → module state resets per file, so
// the singleton never leaks across test files. No .concurrent tests exist in
// this project, so intra-file data races are also impossible.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from './schema';

// Resolve drizzle/ migrations relative to this file so tests work from any cwd.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_FOLDER = path.resolve(__dirname, '../../drizzle');

// Module-level singleton — reset to null by vitest's module isolation per file.
let cached: { pg: PGlite; db: ReturnType<typeof drizzle<typeof schema>> } | null = null;
// Cached table name list — discovered once after first migration, reused on
// every subsequent TRUNCATE so pg_tables is only queried once per module life.
let publicTables: string[] | null = null;

export async function createPgliteDb() {
  if (!cached) {
    // First call: cold start — init WASM, wrap with drizzle, run migrations.
    const pg = new PGlite();
    const db = drizzle(pg, { schema, casing: 'snake_case' });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    cached = { pg, db };
    // Discover all user tables in the public schema. __drizzle_migrations lives
    // in the 'drizzle' schema so the schemaname='public' filter excludes it
    // automatically — no name exclusion needed.
    const result = await pg.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    );
    publicTables = result.rows.map((r) => r.tablename);
    return cached.db;
  }

  // Subsequent calls: truncate all user tables to give each test a clean slate.
  const tableList = publicTables!
    .map((t) => `"${t}"`)
    .join(', ');
  await cached.pg.query(
    `TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`,
  );
  return cached.db;
}

// PgliteDB type — extracted from the synchronous drizzle factory call so the
// type stays usable in interfaces without dragging Promise around.
export type PgliteDB = ReturnType<typeof drizzle<typeof schema>>;
