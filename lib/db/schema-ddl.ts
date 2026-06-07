// TEST/SCRIPT ONLY — DO NOT import from app runtime.
//
// Generates the full greenfield DDL for the current `lib/db/schema` straight
// from the schema definitions, with no migrations folder. This replaces the
// old `drizzle/0000_*.sql` file that the unit (PGlite) and e2e bootstraps used
// to read: the project moved off `drizzle-kit migrate` to push-only, so the
// `drizzle/` folder no longer exists.
//
// `drizzle-kit/api` is a devDependency. Importing it here is fine because this
// module is only pulled in by test infra (`lib/db/client-pglite.ts`) and
// scripts (`scripts/test-db-reset.ts`) — never by the Next.js app bundle.
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import * as schema from './schema';

// Empty snapshot → current schema diff = every CREATE statement, emitted in
// dependency order (enums → tables → FKs → indexes). Verified to reproduce the
// former 0000 oracle exactly (25 tables / 19 enums / 40 FKs) and to apply to a
// fresh Postgres with zero errors. The `public` preamble is prepended because
// generateMigration omits it; e2e drops `public` and needs it recreated first,
// and it is a harmless no-op for PGlite where `public` already exists.
export async function generateSchemaDDL(): Promise<string[]> {
  const current = generateDrizzleJson({ ...schema }, undefined, ['public'], 'snake_case');
  const statements = await generateMigration(generateDrizzleJson({}), current);
  return ['CREATE SCHEMA IF NOT EXISTS public;', ...statements];
}
