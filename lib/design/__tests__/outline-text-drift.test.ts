import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { OUTLINE_TEXT_ALLOWLIST } from '../design-hardrule-allowlist.mjs';
import { classSites } from './_class-alternatives';
import {
  ROOT,
  type Violation,
  allowlistTargets,
  isAllowlisted,
  walkAll,
  walkStyles,
} from './_source-scan';

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
//   * A className built by string concatenation or held in a shared constant
//     that another file composes can slip past. Multi-line `cn()` calls do NOT
//     slip past: the dead-variant scan joins each composition before matching.
//   * `--color-*` theme aliases are enumerated by hand below; a NEW alias
//     pointing at `outline` would need adding here.
//   * The stylesheet pass matches `color: var(--outline)` declarations. A CSS
//     rule that reaches the same colour through a chain of intermediate custom
//     properties is not resolved.

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
 * A stylesheet rule painting text with the border-only token.
 *
 * `border-color`/`outline-color`/`--color-border` style declarations are the
 * token's legitimate job, so only `color:` (and its shorthand-free longhand
 * cousins) count. The `@theme` alias block that declares `--color-input:
 * var(--md-sys-color-outline)` is itself fine — it is the `text-input` USE of
 * that alias, caught by TEXT_COLOR_SPELLINGS above, that is not.
 */
const CSS_TEXT_COLOR = /(?<!-)\bcolor:\s*var\(\s*--md-sys-color-outline\s*\)/;

function scanStyles(): Violation[] {
  const found: Violation[] = [];
  for (const file of walkStyles()) {
    readFileSync(`${ROOT}${file}`, 'utf8')
      .split('\n')
      .forEach((text, i) => {
        if (CSS_TEXT_COLOR.test(text)) found.push({ file, line: i + 1, text: text.trim() });
      });
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
// All three spellings the sibling rule enumerates, so a codemod that rewrites
// `text-[var(--x)]` into the v4 shorthand cannot launder a dead variant past
// this scan while the outline rule still catches the token itself.
const TEXT_TOKEN_BODY = String.raw`(?:text-\[var\((--md-sys-color-[\w-]+)\)\]|text-\((--md-sys-color-[\w-]+)\)|\[color:var\((--md-sys-color-[\w-]+)\)\])`;
const TEXT_TOKEN_UTILITY = new RegExp(
  String.raw`((?:${VARIANT_SEGMENT})*)${TEXT_TOKEN_BODY}`,
  'g',
);

/** The captured token name, whichever of the three spellings matched. */
function matchedToken(m: RegExpMatchArray): string {
  return m[2] ?? m[3] ?? m[4];
}

/**
 * Variants that legitimately repeat the resting tone.
 *
 * `disabled:` (and its peer/group forms) exist precisely to CANCEL a hover back
 * to the resting colour, so equality is the point.
 *
 * `placeholder:` is not a state of this element's text at all — it paints a
 * different pseudo-element. "Same value as the resting text" is a category
 * error there, not a dead transition. (Whether a placeholder should be
 * distinguishable from a typed value is a real question, but a separate rule.)
 */
const EXEMPT_VARIANT = /(?:^|:)(?:(?:peer-|group-)?disabled|placeholder):/;

/**
 * Lines where an element paints its resting text color and a state variant of
 * the SAME property with the SAME value — a transition that can never be seen.
 *
 * This is the specific way a color promotion goes wrong: a control written as
 * `text-<muted> hover:text-<less-muted>` loses its entire hover affordance the
 * moment <muted> is promoted to <less-muted>. Three controls broke exactly that
 * way when `outline` was retired as a text color, and nothing failed.
 *
 * Resolved per className expression via the TypeScript AST, so a multi-line
 * `cn()` is analysed as one unit while a ternary's two arms stay separate.
 * KNOWN LIMIT: a class string held in an identifier declared in ANOTHER module
 * resolves to empty — cross-module constant folding is out of scope.
 */
function findDeadStateVariants(file: string): Violation[] {
  const found: Violation[] = [];
  for (const site of classSites(file)) {
    // Each alternative is one class list the element can actually render. A
    // ternary's two arms never appear in the same alternative, so mutually
    // exclusive states are never compared against each other.
    for (const classes of site.alternatives) {
      const declarations = [...classes.matchAll(new RegExp(TEXT_TOKEN_UTILITY.source, 'g'))].map(
        (m) => ({ variant: m[1] ?? '', token: matchedToken(m) }),
      );
      const dead = declarations.find(
        (d) =>
          d.variant &&
          !EXEMPT_VARIANT.test(d.variant) &&
          // Same token painted with no variant → the state never changes anything.
          declarations.some((o) => !o.variant && o.token === d.token) &&
          // …unless a later clause in this same alternative re-points that
          // variant at a different token, in which case the pair is a
          // deliberate override, not dead weight.
          !declarations.some((o) => o.variant === d.variant && o.token !== d.token),
      );
      if (dead) {
        found.push({ file, line: site.line, text: classes.trim() });
        break;
      }
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

  it('no stylesheet paints text with --md-sys-color-outline', () => {
    // The Tailwind scan above cannot see CSS. A hand-written utility in
    // app/globals.css — where `.md-label-*` and `.md-numeric` already live — is
    // the obvious way to reintroduce the whole problem without touching a
    // single `.tsx` file.
    const offenders = scanStyles();
    expect(
      offenders.map((v) => `${v.file}:${v.line}`),
      'These CSS rules paint text with the border-only --md-sys-color-outline ' +
        'token (~1.4:1 against the surface). Use --md-sys-color-on-surface-variant. ' +
        'Declaring the token for border-color/outline-color is fine — only `color:` ' +
        'is flagged.',
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
