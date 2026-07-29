import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ROOT, type Violation, walkAll } from './_source-scan';

// Drift guard: `text-[var(--x)]` is a COLOR utility, never a font-size one.
//
// Tailwind v4 cannot infer the type of a bare `var()` in an arbitrary value, so
// it compiles `text-[var(--anything)]` to `color: var(--anything)` — always.
// Two ways that goes wrong, and the landing page hit both at once (36 sites):
//
//   1. The intended font-size is never applied. The element silently inherits
//      its ancestor's size, so a "10px caption" renders at body 14px and the
//      design reads flat with no visible error anywhere.
//   2. Worse, the generated `.text-\[var\(--text-2xs\)\]` rule lands LATER in
//      the same layer than `.text-\[var\(--md-sys-color-*\)\]`, so it overrides
//      the colour the element actually asked for. The declaration is invalid at
//      computed-value time (`color: 0.625rem`, or an undefined var), which makes
//      `color` fall back to INHERIT rather than to the intended token. That is
//      how three real contrast defects shipped — including white-on-blue CTA
//      text turning dark on the primary button.
//
// The canonical spelling for a typescale size is `text-[length:var(--x)]`: the
// explicit `length:` hint is exactly what tells v4 it is a font-size. This guard
// therefore only flags the hint-less form, and only when the referenced token is
// not a colour token.
//
// NOTE ON THIS FILE'S OWN CLASS LITERALS: they must stay inside `__tests__/`.
// `app/globals.css` carries `@source not "../**/__tests__/**"` precisely so the
// Tailwind scanner does not read a documentation placeholder as a real utility
// candidate — a placeholder outside this directory takes `next dev` down with a
// 500 while `next build` still exits 0, so CI would not catch it.

/**
 * Every hint-less spelling that compiles to `color: var(--token)`.
 *
 * Three channels, because Tailwind v4 accepts three ways to write the same
 * declaration and a codemod can rewrite one into another:
 *   `text-[var(--x)]`          — the bracketed arbitrary value
 *   `text-[var(--x,fallback)]` — same, with a fallback (still `color:`)
 *   `text-(--x)`               — v4 CSS-variable shorthand, identical output
 *
 * `text-[length:var(--x)]` does NOT match (the `[` is followed by `length:`),
 * which is the point: that spelling is the correct one and appears 40+ times.
 * The fallback is matched but not captured — only the token name is compared
 * against COLOR_TOKEN, so `var(--x, 0.625rem)` is judged on `--x` alone.
 */
const TEXT_ARBITRARY_VAR = /text-(?:\[var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)\]|\(\s*(--[\w-]+)\s*\))/g;

/** The token name, whichever of the two capture slots matched. */
function tokenOf(m: RegExpMatchArray): string {
  return m[1] ?? m[2];
}

/**
 * The only token family for which the hint-less form is correct.
 *
 * `text-[var(--md-sys-color-*)]` compiles to `color:` — which is what the author
 * meant — so it is the house spelling for a token colour and stays legal.
 */
const COLOR_TOKEN = /^--md-sys-color-[\w-]+$/;

function findViolations(file: string): Violation[] {
  const found: Violation[] = [];
  readFileSync(`${ROOT}${file}`, 'utf8')
    .split('\n')
    .forEach((text, i) => {
      for (const m of text.matchAll(TEXT_ARBITRARY_VAR)) {
        const token = tokenOf(m);
        if (COLOR_TOKEN.test(token)) continue;
        found.push({ file, line: i + 1, rule: token, text: text.trim() });
      }
    });
  return found;
}

describe('Tailwind v4 — text-[var(--x)] is a color utility, not a font size', () => {
  it('no source file uses the hint-less arbitrary form with a non-color token', () => {
    const offenders: Violation[] = [];
    for (const file of walkAll()) offenders.push(...findViolations(file));
    expect(
      offenders.map((v) => `${v.file}:${v.line} (${v.rule})`),
      'These sites spell a font size as `text-[var(--token)]`. Tailwind v4 has no ' +
        'type hint there, so it compiles to `color: var(--token)` — the font size ' +
        'is never applied AND the generated rule overrides the element\'s intended ' +
        'text color (the declaration is invalid at computed-value time, so `color` ' +
        'falls back to inherit). Use a named size utility (`text-sm`) or the ' +
        'canonical hinted form for a typescale token. Only --md-sys-color-* tokens ' +
        'may use the hint-less form, because `color:` is what they want anyway.',
    ).toEqual([]);
  });

  it('the guard does not flag the canonical hinted spelling', () => {
    // Mutation check: without the `length:` carve-out this guard would condemn
    // the 40+ correct call sites it exists to protect, and someone would delete
    // it rather than fix them.
    const hinted = 'className="text-[length:var(--md-typescale-label-large-size)]"';
    expect([...hinted.matchAll(TEXT_ARBITRARY_VAR)]).toEqual([]);
  });

  it('the guard flags a hint-less non-color token', () => {
    // Mutation check in the other direction — proves the matcher is not vacuous.
    const bad = 'className="text-[var(--text-2xs)] uppercase"';
    expect([...bad.matchAll(TEXT_ARBITRARY_VAR)].map(tokenOf)).toEqual(['--text-2xs']);
  });

  it('the guard flags the v4 CSS-variable shorthand', () => {
    // `text-(--x)` is v4 sugar for `text-[var(--x)]` and compiles to the SAME
    // `color:` declaration — so it is the same bug wearing a different spelling.
    // Zero sites today; catching it now is what stops the fix from being
    // undone by a codemod that "modernizes" the syntax.
    const bad = 'className="text-(--text-2xs) uppercase"';
    expect([...bad.matchAll(TEXT_ARBITRARY_VAR)].map(tokenOf)).toEqual(['--text-2xs']);
  });

  it('the guard flags the var() fallback form', () => {
    // `var(--text-2xs, 0.625rem)` still lands in a `color:` declaration; the
    // fallback only changes WHICH invalid value is used, not the property.
    const bad = 'className="text-[var(--text-2xs,0.625rem)]"';
    expect([...bad.matchAll(TEXT_ARBITRARY_VAR)].map(tokenOf)).toEqual(['--text-2xs']);
  });

  it('the guard still allows the color token in both spellings', () => {
    // The shorthand carve-out must mirror the bracketed one, or widening the
    // matcher would condemn the 800+ legitimate color sites.
    const ok = 'className="text-(--md-sys-color-on-primary) text-[var(--md-sys-color-primary)]"';
    const flagged = [...ok.matchAll(TEXT_ARBITRARY_VAR)]
      .map(tokenOf)
      .filter((t) => !COLOR_TOKEN.test(t));
    expect(flagged).toEqual([]);
  });
});
