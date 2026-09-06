// In-process pglite for tests. createPgliteDb() returns a singleton DB handle
// (one PGlite WASM instance per module — i.e. per test file under vitest's
// default isolate:true fork pool). On first call: init + create schema. On
// every subsequent call: TRUNCATE all public user tables (RESTART IDENTITY
// CASCADE) so each test starts with an empty schema without paying WASM
// re-init cost.
//
// Safety: vitest uses forks + isolate:true → module state resets per file, so
// the singleton never leaks across test files. No .concurrent tests exist in
// this project, so intra-file data races are also impossible.
//
// Load-bearing for service caches: services build themselves lazily from the
// repo bundle (`getDb()` + `get*Repo()`) and are cached on globalThis. A
// service a harness forgot to reset keeps repos from an EARLIER
// `__useDrizzleWithDbForTest(db)` call — harmless only because this function
// hands back the SAME handle per file and just truncates. Returning a fresh
// PGlite per call would silently point those cached services at a dead db.
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from './schema';
import { generateSchemaDDL } from './schema-ddl';

// Module-level singleton — reset to null by vitest's module isolation per file.
let cached: { pg: PGlite; db: ReturnType<typeof drizzle<typeof schema>> } | null = null;
// Cached table name list — discovered once after first migration, reused on
// every subsequent TRUNCATE so pg_tables is only queried once per module life.
let publicTables: string[] | null = null;

export async function createPgliteDb() {
  if (!cached) {
    // First call: cold start — init WASM, wrap with drizzle, then create the
    // schema from the live schema definitions (push-style, no migrations
    // folder). Statements come back in dependency order (enums → tables → FKs).
    const pg = new PGlite();
    const db = drizzle(pg, { schema, casing: 'snake_case' });
    for (const statement of await generateSchemaDDL()) {
      await pg.exec(statement);
    }
    cached = { pg, db };
    // Discover all user tables in the public schema.
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
