import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DB_BOUNDARY_ALLOWLIST } from '../db-boundary-allowlist.mjs';

// Independent drift guard for the repository boundary. The ESLint rule
// (`repo-boundary/db-access`) is the primary enforcement; this test is a second,
// implementation-independent check (an fs-walk vs ESLint's AST matcher) reading
// the SAME allowlist (lib/server/db-boundary-allowlist.mjs) so the two cannot
// silently diverge. Mirrors the lib/auth/__tests__/proxy-matcher.test.ts pattern.
//
// Invariant: outside lib/server/repositories/** (the repo layer) and test files,
// only the allowlisted files may statically VALUE-import @/lib/db/{schema,client}.
// `import type { DB }` is allowed everywhere. Services take their tx handle from
// repositories/factory `getDb()` (same injection point as the repos).

const ROOT = fileURLToPath(new URL('../../../', import.meta.url)); // repo root
const SCAN_ROOTS = ['lib', 'app'];
const ALLOW = new Set<string>(DB_BOUNDARY_ALLOWLIST);

/**
 * True iff `src` contains a STATIC, VALUE import of @/lib/db/{schema,client}.
 * - Anchors each candidate to an `import` at a line start, and forbids the
 *   clause between `import` and `from` from crossing a quote/semicolon, so a
 *   preceding `import … from 'other'` can't bleed into the classification
 *   (which would mislabel a later `import type { DB }` as a value import).
 * - `import type { … }` (whole-clause type import) → not a value import.
 * - Dynamic `import('@/lib/db/client')` has no `from` → never matched.
 */
function valueImportsDb(src: string): boolean {
  const re =
    /(?:^|\n)\s*import\s+(type\s+)?(?:[^'";]|\n)*?from\s*['"]@\/lib\/db\/(?:schema|client)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (!m[1]) return true; // a non-`type` import of the DB modules
  }
  return false;
}

function* walk(relDir: string): Generator<string> {
  for (const entry of readdirSync(`${ROOT}${relDir}`, { withFileTypes: true })) {
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      if (rel === 'lib/server/repositories') continue; // the repo layer owns DB access
      yield* walk(rel);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      yield rel;
    }
  }
}

describe('repository boundary: @/lib/db/{schema,client} is repo-layer-only', () => {
  it('no non-allowlisted file statically value-imports the DB modules', () => {
    const offenders: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of walk(root)) {
        if (ALLOW.has(file)) continue;
        if (valueImportsDb(readFileSync(`${ROOT}${file}`, 'utf8'))) offenders.push(file);
      }
    }
    expect(
      offenders,
      `These files value-import @/lib/db/* outside lib/server/repositories/** and are not ` +
        `allowlisted. Route DB access through a repo, or (with review) add the file to ` +
        `lib/server/db-boundary-allowlist.mjs:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('every allowlist entry still needs the exemption (no stale entries)', () => {
    for (const file of DB_BOUNDARY_ALLOWLIST) {
      const src = readFileSync(`${ROOT}${file}`, 'utf8');
      expect(
        valueImportsDb(src),
        `${file} is allowlisted but no longer value-imports @/lib/db/* — remove it from ` +
          `lib/server/db-boundary-allowlist.mjs.`,
      ).toBe(true);
    }
  });
});
