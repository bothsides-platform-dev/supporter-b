import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

import * as schema from '../schema';

const root = path.resolve(__dirname, '../../..');

// generateSchemaDDL() imports the schema directly, so only the CLI exercises
// drizzle.config.ts. `export` shares push's loader and needs no database.
it('drizzle-kit CLI가 drizzle.config.ts로 스키마 전체를 읽는다', () => {
  const result = spawnSync(path.join(root, 'node_modules/.bin/drizzle-kit'), ['export'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 25_000,
  });

  expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
  expect(result.stdout).toContain('CREATE VIEW "public"."pg_consultation_progress"');
});

// drizzle-kit sees only what index.ts exports; anything else becomes a DROP in push.
const modules = readdirSync(path.join(root, 'lib/db/schema'))
  .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
  .map((file) => file.slice(0, -'.ts'.length));

it.each(modules)('schema/index.ts가 %s의 export를 모두 내보낸다', async (name) => {
  const exported: Record<string, unknown> = await import(`../schema/${name}.ts`);
  const missing = Object.keys(exported).filter(
    (key) => (schema as Record<string, unknown>)[key] !== exported[key],
  );

  expect(missing).toEqual([]);
});
