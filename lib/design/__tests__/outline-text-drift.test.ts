import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { OUTLINE_TEXT_ALLOWLIST } from '../design-hardrule-allowlist.mjs';

// Drift guard for the DESIGN.md §2 token contract:
//
//   `--md-sys-color-outline`            → 강한 보더 (인풋 포커스 전)
//   `--md-sys-color-on-surface-variant` → 보조/메타 텍스트, 아이콘
//
// `outline` is a BORDER token. Used as a text/glyph color it measures 1.41:1
// (light) and 1.45:1 (dark) against the surface it sits on — under the WCAG AA
// body floor (4.5:1) and under the non-text floor (3:1) that interactive
// glyphs owe. DESIGN.md §2's low-contrast carve-out covers `outline-variant`
// as a BORDER only; it has never extended to text.
//
// Line-scoped, matching the sibling `mono-label-drift` guard: every className
// in this codebase keeps its utility tokens on one line, and a line scan avoids
// the quote-pairing failures that Korean prose apostrophes cause.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url)); // repo root
const SCAN_ROOTS = ['app', 'components', 'lib'];

// Every spelling Tailwind accepts for "paint text with this custom property".
// The v3-style arbitrary value is the only one in the tree today; the other two
// are listed so a future codemod or a Tailwind v4 shorthand rewrite cannot
// launder the same violation past this guard.
const TEXT_COLOR_SPELLINGS = [
  'text-[var(--md-sys-color-outline)]',
  'text-(--md-sys-color-outline)',
  '[color:var(--md-sys-color-outline)]',
];

type Violation = { file: string; line: number; text: string };

function* walk(relDir: string): Generator<string> {
  for (const entry of readdirSync(`${ROOT}${relDir}`, { withFileTypes: true })) {
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      yield* walk(rel);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
      yield rel;
    }
  }
}

function isAllowlisted(file: string): boolean {
  return OUTLINE_TEXT_ALLOWLIST.some((prefix) => file === prefix || file.startsWith(`${prefix}/`));
}

/** Lines that paint text or a glyph with the border-only `outline` token. */
function findViolations(file: string): Violation[] {
  const found: Violation[] = [];
  const lines = readFileSync(`${ROOT}${file}`, 'utf8').split('\n');
  lines.forEach((text, i) => {
    if (TEXT_COLOR_SPELLINGS.some((spelling) => text.includes(spelling))) {
      found.push({ file, line: i + 1, text: text.trim() });
    }
  });
  return found;
}

function scanAll(): Violation[] {
  const found: Violation[] = [];
  for (const root of SCAN_ROOTS) {
    for (const file of walk(root)) {
      if (isAllowlisted(file)) continue;
      found.push(...findViolations(file));
    }
  }
  return found;
}

describe('DESIGN.md §2 — outline is a border token, never a text color', () => {
  it('no non-allowlisted file paints text or glyphs with --md-sys-color-outline', () => {
    const offenders = scanAll();
    expect(
      offenders.map((v) => `${v.file}:${v.line}`),
      'These lines use the border token --md-sys-color-outline as a text/glyph ' +
        'color, which measures ~1.4:1 against the surface (WCAG AA needs 4.5:1 for ' +
        'text, 3:1 for interactive glyphs). Use --md-sys-color-on-surface-variant, ' +
        'the token DESIGN.md §2 designates for 보조/메타 텍스트·아이콘. Text hierarchy ' +
        'below that tier is carried by typescale, not by a lighter color — there is ' +
        'no AA-passing shade left between on-surface-variant and the surface. A ' +
        'purely decorative aria-hidden separator glyph may be added to ' +
        'lib/design/design-hardrule-allowlist.mjs (OUTLINE_TEXT_ALLOWLIST).',
    ).toEqual([]);
  });

  it('every allowlisted separator is genuinely hidden from assistive tech', () => {
    // The exemption rests on WCAG 1.4.3's decorative carve-out, which only holds
    // while the glyph is actually unreachable by AT. If someone drops the
    // aria-hidden, the contrast debt becomes real again — so the allowlist entry
    // must expire with it rather than shelter the file forever.
    for (const prefix of OUTLINE_TEXT_ALLOWLIST) {
      const targets = statSync(`${ROOT}${prefix}`).isDirectory() ? [...walk(prefix)] : [prefix];
      for (const file of targets) {
        for (const hit of findViolations(file)) {
          const source = readFileSync(`${ROOT}${file}`, 'utf8').split('\n');
          // The attribute sits on the same JSX element but usually a few lines
          // above the className, so scan the element's opening tag rather than
          // the single className line.
          const openingTag = source.slice(Math.max(0, hit.line - 8), hit.line + 2).join('\n');
          expect(
            openingTag,
            `${file}:${hit.line} uses --md-sys-color-outline as a text color but the ` +
              'element is not aria-hidden. Either mark the decorative glyph ' +
              'aria-hidden or move it to --md-sys-color-on-surface-variant.',
          ).toContain('aria-hidden');
        }
      }
    }
  });

  it('every allowlist prefix still shelters a real exemption (no stale entries)', () => {
    for (const prefix of OUTLINE_TEXT_ALLOWLIST) {
      const targets = statSync(`${ROOT}${prefix}`).isDirectory() ? [...walk(prefix)] : [prefix];
      const hits = targets.flatMap(findViolations);
      expect(
        hits.length,
        `"${prefix}" is allowlisted but no longer uses --md-sys-color-outline as a ` +
          'text color — remove it from lib/design/design-hardrule-allowlist.mjs.',
      ).toBeGreaterThan(0);
    }
  });
});
