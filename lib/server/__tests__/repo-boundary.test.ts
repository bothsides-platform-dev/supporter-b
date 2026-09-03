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
// Invariants (outside lib/server/repositories/** — the repo layer — and test files):
//  1. only the allowlisted files may statically VALUE-import @/lib/db/{schema,client}
//     (`import type { DB }` is allowed everywhere);
//  2. nobody dynamically `import('@/lib/db/…')` either — services take their tx
//     handle from repositories/factory `getDb()` (same injection point as the
//     repos), and the ESLint rule cannot see dynamic imports at all;
//  3. `getDb()` is consumed only by lib/server/services/** — it hands out the raw
//     drizzle handle, so an action/loader calling it would re-open the boundary
//     the ESLint rule exists for, invisibly (it is not an `@/lib/db/*` import).

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

/** Drops `/* … *\/` blocks and `// …` line comments so prose that merely *mentions*
 *  `getDb()` or `import('@/lib/db/client')` (headers explaining the boundary) is
 *  not mistaken for a use. Naive on purpose — a `//` inside a string literal only
 *  risks a false negative on that one line. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** True iff `src` dynamically imports @/lib/db/{schema,client} — `import('…')`. */
function dynamicImportsDb(src: string): boolean {
  return /\bimport\(\s*['"]@\/lib\/db\/(?:schema|client)['"]\s*\)/.test(stripComments(src));
}

/** True iff `src` uses `getDb` (import or call) — the raw-handle accessor. */
function usesGetDb(src: string): boolean {
  return /\bgetDb\b/.test(stripComments(src));
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

  it('no non-allowlisted file dynamically imports the DB modules (services use getDb())', () => {
    const offenders: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of walk(root)) {
        if (ALLOW.has(file)) continue;
        if (dynamicImportsDb(readFileSync(`${ROOT}${file}`, 'utf8'))) offenders.push(file);
      }
    }
    expect(
      offenders,
      `These files dynamically import('@/lib/db/*') outside lib/server/repositories/**. ` +
        `A service takes its tx handle from repositories/factory getDb(); anything else ` +
        `goes through a repo:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('getDb() is consumed only by lib/server/services/**', () => {
    const offenders: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of walk(root)) {
        if (file.startsWith('lib/server/services/')) continue;
        if (usesGetDb(readFileSync(`${ROOT}${file}`, 'utf8'))) offenders.push(file);
      }
    }
    expect(
      offenders,
      `getDb() hands out the raw drizzle handle and is for service transaction bodies ` +
        `only. These files use it outside lib/server/services/** — route the work ` +
        `through a service or a repo:\n  ${offenders.join('\n  ')}`,
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
