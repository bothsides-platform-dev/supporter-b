import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { OUTLINE_TEXT_ALLOWLIST } from '../design-hardrule-allowlist.mjs';
import { ROOT, type Violation, allowlistTargets, isAllowlisted, walkAll } from './_source-scan';

// Drift guard for the DESIGN.md §2 token contract:
//
//   `--md-sys-color-outline`            → 강한 보더 (인풋 포커스 전)
//   `--md-sys-color-on-surface-variant` → 보조/메타 텍스트, 아이콘
//
// `outline` is a BORDER token. Used as a text/glyph color it measures 1.41:1
// (light) and 1.45:1 (dark) against `surface` — under the WCAG AA body floor
// (4.5:1) and under the non-text floor (3:1) that interactive glyphs owe.
// DESIGN.md §2's low-contrast carve-out covers `outline-variant` as a BORDER
// only; it has never extended to text.
//
// KNOWN LIMITS (deliberate — this is a lint-style guardrail, not a proof):
//   * Line-scoped, like the sibling `mono-label-drift` guard. A className split
//     across source lines, built by concatenation, or held in a shared constant
//     can slip past. It stops copy-paste propagation, which is how the 82-site
//     spread actually happened.
//   * Source files only (`.ts`/`.tsx`). A CSS utility class declared in
//     `app/globals.css` that paints `color: var(--md-sys-color-outline)` is NOT
//     seen. See TODOS.md "디자인 하드룰 가드 커버리지 확장".
//   * `--color-*` theme aliases are enumerated by hand below; a NEW alias
//     pointing at `outline` would need adding here.

// Every spelling that resolves to "paint text with the outline token".
// `--color-input` is a `@theme inline` alias declared in app/globals.css, so
// `text-input` is byte-for-byte the banned declaration under a different name.
// Anchored on a class boundary so `text-inputs` / `text-input-foo` don't match.
const TEXT_COLOR_SPELLINGS = [
  /text-\[var\(--md-sys-color-outline\)\]/,
  /text-\(--md-sys-color-outline\)/,
  /\[color:var\(--md-sys-color-outline\)\]/,
  /text-\[var\(--color-input\)\]/,
  /(?<![\w-])text-input(?![\w-])/,
];

// `aria-hidden` only earns the WCAG 1.4.3 decorative exemption when it is
// actually ON. A bare substring match would accept `aria-hidden="false"` — which
// does the exact opposite — so require a truthy spelling: the boolean shorthand
// (`aria-hidden` followed by `>`, whitespace, or `/`), `="true"`, or `={true}`.
const ARIA_HIDDEN_TRUTHY = /aria-hidden(?:\s*=\s*(?:["']true["']|\{\s*true\s*\})|(?=[\s/>]))/;

/** Lines that paint text or a glyph with the border-only `outline` token. */
function findViolations(file: string): Violation[] {
  const found: Violation[] = [];
  const lines = readFileSync(`${ROOT}${file}`, 'utf8').split('\n');
  lines.forEach((text, i) => {
    if (TEXT_COLOR_SPELLINGS.some((spelling) => spelling.test(text))) {
      found.push({ file, line: i + 1, text: text.trim() });
    }
  });
  return found;
}

function scanAll(): Violation[] {
  const found: Violation[] = [];
  for (const file of walkAll()) {
    if (isAllowlisted(file, OUTLINE_TEXT_ALLOWLIST)) continue;
    found.push(...findViolations(file));
  }
  return found;
}

/**
 * The JSX opening tag that encloses `line` (1-based), as one string.
 *
 * Scoped to the ELEMENT, not a fixed line window. A ±N-line window is worse
 * than useless on an allowlisted file: it lets a decorative sibling's
 * `aria-hidden` vouch for a completely different element a few lines away, so
 * a real violation on the same file ships green. Walking back to the nearest
 * `<Tag` and forward to that tag's `>` keeps the attribute and the className
 * on the same element.
 *
 * Returns the hit line alone when no enclosing tag is found (a bare class
 * string in a constants file) — which fails the aria-hidden check, correctly.
 */
function enclosingOpeningTag(lines: string[], line: number): string {
  const hit = line - 1;
  let start = hit;
  while (start >= 0 && !/<[A-Za-z][\w.]*/.test(lines[start])) start--;
  if (start < 0) return lines[hit];
  let end = start;
  while (end < lines.length && !/\/?>\s*$/.test(lines[end])) end++;
  if (end < hit) return lines[hit];
  return lines.slice(start, Math.min(end + 1, lines.length)).join('\n');
}

// One Tailwind variant segment: `hover`, `focus-visible`, `max-lg`,
// `group-hover/name`, `data-[state=open]`, `group-data-[over-dark]/lheader`,
// or a fully arbitrary `[&:hover]`.
const VARIANT_SEGMENT = String.raw`(?:\[[^\]]*\]|[\w-]+(?:-\[[^\]]*\])?(?:\/[\w-]+)?):`;
const TEXT_TOKEN_UTILITY = new RegExp(
  String.raw`((?:${VARIANT_SEGMENT})*)text-\[var\((--md-sys-color-[\w-]+)\)\]`,
  'g',
);

/** A `disabled:`-family variant restoring the resting tone is intentional. */
const DISABLED_VARIANT = /(?:^|:)(?:peer-|group-)?disabled:/;

/** Is `text-[var(<token>)]` present on this line WITHOUT a variant prefix? */
function hasRestingDeclaration(text: string, token: string): boolean {
  const idx = text.indexOf(`text-[var(${token})]`);
  if (idx < 0) return false;
  // Start-of-line is a word boundary too — a class string continued onto its
  // own source line is still a resting declaration.
  return idx === 0 || /[\s"'`]/.test(text[idx - 1]);
}

/**
 * The lines of the `cn(...)`/className composition containing `line` (1-based).
 *
 * Approximated by walking out to the nearest boundaries rather than parsing
 * JSX. Used ONLY to suppress findings (the intentional-override escape below),
 * never to add them, so an over-wide block costs recall, not precision.
 */
function compositionLines(lines: string[], line: number): string[] {
  let start = line - 1;
  let end = line - 1;
  while (start > 0 && lines[start - 1].trim() !== '' && !lines[start - 1].includes('className'))
    start--;
  // Advance BEFORE testing the terminator, so a `)}` produced by a template
  // interpolation on the hit line itself (`${size(x)}`) cannot collapse the
  // block to one line and hide the very sibling we are looking for.
  do {
    end++;
  } while (end < lines.length && lines[end - 1].trim() !== '' && !lines[end - 1].includes(')}'));
  return lines.slice(start, Math.min(end, lines.length));
}

/**
 * Lines where an element paints its resting text color and a state variant of
 * the SAME property with the SAME value — a transition that can never be seen.
 *
 * This is the specific way a color promotion goes wrong: a control written as
 * `text-<muted> hover:text-<less-muted>` loses its entire hover affordance the
 * moment <muted> is promoted to <less-muted>. Three controls broke exactly that
 * way when `outline` was retired as a text color, and nothing failed.
 *
 * KNOWN LIMIT: resting and variant must sit on the SAME source line, and only
 * the `text-[var(--md-sys-color-*)]` spelling is understood. Multi-line `cn()`,
 * `cva()` variant maps, `clsx` object syntax, shared class constants, and
 * non-token colors (`text-muted-foreground`) are all invisible to it. See
 * TODOS.md "디자인 하드룰 가드 커버리지 확장".
 */
function findDeadStateVariants(file: string): Violation[] {
  const found: Violation[] = [];
  const lines = readFileSync(`${ROOT}${file}`, 'utf8').split('\n');
  lines.forEach((text, i) => {
    for (const match of text.matchAll(TEXT_TOKEN_UTILITY)) {
      const [, variant, token] = match;
      if (!variant) continue; // this IS the resting declaration
      if (DISABLED_VARIANT.test(variant)) continue;
      if (!hasRestingDeclaration(text, token)) continue;

      // Intentional-override escape: inside a multi-clause `cn()`, a later
      // conditional clause may re-assert BOTH the resting and the variant tone
      // purely to beat an earlier clause's different variant value. That pair is
      // load-bearing, not dead. Detect it by looking for another clause in the
      // same composition declaring the same variant with a DIFFERENT token.
      const overridden = compositionLines(lines, i + 1).some((sibling, k) =>
        [...sibling.matchAll(TEXT_TOKEN_UTILITY)].some(
          ([, sVariant, sToken]) =>
            sVariant === variant && sToken !== token && !(sibling === text && k === 0),
        ),
      );
      if (overridden) continue;

      found.push({ file, line: i + 1, text: text.trim() });
      return;
    }
  });
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
    // while the glyph is actually unreachable by AT. Scoped to the enclosing JSX
    // element so an allowlisted FILE cannot shelter a second, AT-visible use of
    // the token elsewhere in the same file.
    for (const prefix of OUTLINE_TEXT_ALLOWLIST) {
      // A missing path is the stale-entry case; the last test reports it with a
      // useful message rather than a raw ENOENT stack out of this one.
      const targets = allowlistTargets(prefix);
      if (targets === null) continue;
      for (const file of targets) {
        const source = readFileSync(`${ROOT}${file}`, 'utf8').split('\n');
        for (const hit of findViolations(file)) {
          expect(
            ARIA_HIDDEN_TRUTHY.test(enclosingOpeningTag(source, hit.line)),
            `${file}:${hit.line} uses --md-sys-color-outline as a text color but the ` +
              'enclosing element is not aria-hidden (or is aria-hidden="false", which ' +
              'hides nothing). Either mark the decorative glyph aria-hidden or move it ' +
              'to --md-sys-color-on-surface-variant.',
          ).toBe(true);
        }
      }
    }
  });

  // Sibling invariant, same walk. Not about `outline` specifically — it catches
  // the collateral damage ANY text-color promotion causes, which is how the
  // outline retirement silently killed three hover affordances.
  it('no element declares a state variant with the same text color as its resting state', () => {
    const offenders: Violation[] = [];
    for (const file of walkAll()) offenders.push(...findDeadStateVariants(file));
    expect(
      offenders.map((v) => `${v.file}:${v.line}`),
      'These lines paint a hover/focus/active text color identical to the resting ' +
        'text color, so the transition is invisible and the control loses its ' +
        'affordance. Either give the state variant a distinct tone (muted resting ' +
        '→ --md-sys-color-on-surface on hover is the house pattern, see ' +
        'components/pending-approval/EmailVerifySection.tsx) or drop the dead variant.',
    ).toEqual([]);
  });

  it('every allowlist entry still shelters a real exemption (no stale entries)', () => {
    for (const prefix of OUTLINE_TEXT_ALLOWLIST) {
      const targets = allowlistTargets(prefix);
      expect(
        targets,
        `"${prefix}" is allowlisted but no longer exists — remove it from ` +
          'lib/design/design-hardrule-allowlist.mjs.',
      ).not.toBeNull();
      // Per-file, not per-prefix: a directory entry whose subtree still has ONE
      // violator would otherwise keep every other file in it exempt forever.
      for (const file of targets!) {
        expect(
          findViolations(file).length,
          `"${file}" is allowlisted but no longer uses --md-sys-color-outline as a ` +
            'text color — remove it from lib/design/design-hardrule-allowlist.mjs.',
        ).toBeGreaterThan(0);
      }
    }
  });
});
