import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ROOT, type Violation, walkAll } from './_source-scan';

// Drift guard for the DESIGN.md §2 rule "`text-[var(--x)]`는 색 유틸리티다.
// 크기에 쓰면 안 된다" — the hint-less arbitrary form is a COLOR utility, never
// a font-size one.
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
 * A `text-sm` that sets ONLY the font size, i.e. one that needs a leading partner.
 *
 * Deliberately narrow, because a guard that cries wolf gets deleted:
 *   - `text-sm/6` and `text-sm/[1.5]` already carry a line-height → excluded by
 *     the trailing `(?!\/)`.
 *   - a variant prefix (`md:text-sm`, `hover:text-sm`) is still a bare size, so
 *     it MUST stay caught — the leading check below is variant-agnostic on
 *     purpose and a variant-scoped size with an unscoped leading is close enough
 *     for a lint-grade rule.
 *   - only class-position occurrences count: the leading `(?<![\w-\/])` keeps
 *     `--text-sm` and `foo-text-sm` out.
 */
const BARE_TEXT_SM = /(?<![\w\-/])text-sm(?![\w-])(?!\/)/;

/** Any explicit line-height on the same line — `leading-*` or the `text-sm/N` shorthand. */
const HAS_EXPLICIT_LEADING = /(?<![\w-])leading-|(?<![\w\-/])text-sm\//;

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

  // `text-sm` 은 font-size 와 line-height 를 함께 싣는다. 랜딩의 36곳은 원래
  // 크기를 상속하고 있었고, 릴리스 계약은 "색 복구 외 시각 델타 0" 이었다 —
  // 그래서 명시 leading 이 없던 28곳에 `leading-[inherit]` 을 붙였다.
  //
  // 이 규칙이 없으면 "중복 유틸리티 정리" 패스가 `leading-[inherit]` 을 노이즈로
  // 읽고 지운다. 그러면 행간이 21px→20px 로 조용히 바뀌는데, e2e 는 헤더 CTA
  // 한 곳만 재므로 나머지 27곳은 아무 테스트도 깨뜨리지 않는다.
  it('components/landing 의 text-sm 은 언제나 명시 leading 과 함께 온다', () => {
    const offenders: string[] = [];
    for (const file of walkAll()) {
      if (!file.startsWith('components/landing/')) continue;
      readFileSync(`${ROOT}${file}`, 'utf8')
        .split('\n')
        .forEach((text, i) => {
          if (BARE_TEXT_SM.test(text) && !HAS_EXPLICIT_LEADING.test(text)) {
            offenders.push(`${file}:${i + 1}`);
          }
        });
    }
    expect(
      offenders,
      'These landing sites use `text-sm` without an explicit line-height. ' +
        '`text-sm` carries Tailwind\'s own line-height (1.4286), which is NOT the ' +
        'body line-height (1.5) these elements inherited before the token fix — so ' +
        'a bare `text-sm` silently tightens them by ~1px per line. The release ' +
        'contract for that fix was "colour restoration only, zero size/rhythm ' +
        'delta". Pair it with `leading-[inherit]` (or a deliberate `leading-*`).',
    ).toEqual([]);
  });

  // 오탐이 한 번이라도 나면 다음 사람은 규칙을 고치는 대신 테스트를 지운다.
  // 실제로 나올 법한 네 모양을 못박아 둔다.
  it.each([
    ['text-sm/6 은 이미 행간을 싣는다', 'className="text-sm/6"'],
    ['text-sm/[1.5] 도 마찬가지', 'className="text-sm/[1.5]"'],
    ['leading- 이 같은 줄에 있으면 통과', 'className="text-sm leading-[inherit]"'],
    ['토큰 이름 안의 text-sm 은 클래스가 아니다', 'const x = "var(--text-sm)";'],
  ])('오탐 없음 — %s', (_label, line) => {
    expect(BARE_TEXT_SM.test(line) && !HAS_EXPLICIT_LEADING.test(line)).toBe(false);
  });

  it('오탐 방지가 진짜 위반까지 놓치지는 않는다', () => {
    const bad = 'className="text-sm tracking-[-0.006em]"';
    expect(BARE_TEXT_SM.test(bad) && !HAS_EXPLICIT_LEADING.test(bad)).toBe(true);
    const variant = 'className="md:text-sm tracking-[-0.006em]"';
    expect(BARE_TEXT_SM.test(variant) && !HAS_EXPLICIT_LEADING.test(variant)).toBe(true);
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
