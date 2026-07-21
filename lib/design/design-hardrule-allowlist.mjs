// Single source of truth for the DESIGN.md §9 typography hard-rule exemptions.
//
// Hard rule (DESIGN.md §9): "No 내비/라벨에 font-mono uppercase wide-tracking —
// sentence case + 약한 음수 자간. `.md-numeric`은 금융 수치에만."
//
// `--font-mono` (JetBrains Mono → ui-monospace → SF Mono → Menlo) carries NO
// Hangul glyphs, so a `font-mono` label written in Korean silently falls back to
// the OS default Korean face instead of Pretendard — the label renders in a
// different typeface than the rest of the screen. `uppercase` is a no-op on
// Hangul, leaving only the wide positive tracking, which fights Linear density.
// App surfaces therefore use `.md-label-{small,medium,large}` (app/globals.css).
//
// Consumed by `lib/design/__tests__/mono-label-drift.test.ts` — an fs-walk drift
// guard over `app/**` and `components/**`. Add an entry here ONLY with a
// reviewed justification recorded in DESIGN.md §9.
//
// Paths are repo-relative directory prefixes.
export const MONO_LABEL_ALLOWLIST = [
  // DESIGN.md §9 "랜딩·마케팅 타이포" 예외 — 이어브로우·비교표 헤더·계산기 라벨의
  // mono + wide-tracking 은 기술적 마케팅 룩을 노린 제품 결정이다. 인증 앱 면
  // (`(app)`·`(public)`)에는 적용되지 않는다.
  'components/landing',
];
