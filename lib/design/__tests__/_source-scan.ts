import { existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Shared fs-walk for the DESIGN.md hard-rule drift guards.
//
// Deliberately NOT listing the importers here — that roster went stale by four
// the first time someone added a guard. `grep -l _source-scan lib/design/__tests__`
// is always current.
//
// Both guards answer the same shape of question — "does any source file under
// app/components/lib spell a banned utility?" — so they share the traversal and
// the allowlist matching. Not a `.test.ts` file, so vitest does not collect it.

/** Repo root, with a trailing slash. Paths returned by `walk` append to this. */
export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// `lib` is scanned too: it holds no Tailwind components today (the .tsx there is
// email templates, which must use inline styles), but scoping the guards to
// app+components would silently exempt any future component that lands there.
export const SCAN_ROOTS = ['app', 'components', 'lib'];

export type Violation = { file: string; line: number; rule?: string; text: string };

/** Repo-relative paths of every non-test source file under `relDir`. */
export function* walk(relDir: string, exts = SOURCE_EXTS): Generator<string> {
  for (const entry of readdirSync(`${ROOT}${relDir}`, { withFileTypes: true })) {
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      yield* walk(rel, exts);
    } else if (exts.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
      yield rel;
    }
  }
}

const SOURCE_EXTS = /\.(ts|tsx)$/;
const STYLE_EXTS = /\.css$/;

/** Every non-test source file under all `SCAN_ROOTS`. */
export function* walkAll(): Generator<string> {
  for (const root of SCAN_ROOTS) yield* walk(root);
}

/**
 * Every stylesheet a design hard rule can be violated in.
 *
 * Separate from `walkAll` because the guards match Tailwind class syntax in
 * `.tsx`, which does not appear in CSS — a stylesheet expresses the same
 * violation as a raw `color: var(--token)` declaration instead. Without this,
 * a `.tertiary-text { color: var(--md-sys-color-outline) }` utility added to
 * `app/globals.css` would reintroduce an entire class of violation with zero
 * guard coverage. `styles/` is included explicitly: it sits outside SCAN_ROOTS.
 */
export function* walkStyles(): Generator<string> {
  for (const root of [...SCAN_ROOTS, 'styles']) {
    try {
      yield* walk(root, STYLE_EXTS);
    } catch {
      // A scan root with no stylesheets (or no directory at all) is fine.
    }
  }
}

/**
 * Does `file` sit at, or under, one of the allowlisted paths/prefixes?
 *
 * The `/` in the prefix branch matters: without it `components/ui/breadcrumb`
 * would also shelter `components/ui/breadcrumb.tsx.bak`.
 */
export function isAllowlisted(file: string, allowlist: readonly string[]): boolean {
  return allowlist.some((prefix) => file === prefix || file.startsWith(`${prefix}/`));
}

/**
 * Repo-relative paths an allowlist entry expands to — the file itself, or every
 * source file under it — or `null` when the entry no longer exists on disk.
 *
 * Returning `null` rather than throwing lets a guard report "stale allowlist
 * entry" in its own words instead of dying on a raw ENOENT stack trace.
 */
export function allowlistTargets(prefix: string): string[] | null {
  if (!existsSync(`${ROOT}${prefix}`)) return null;
  return statSync(`${ROOT}${prefix}`).isDirectory() ? [...walk(prefix)] : [prefix];
}
