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

// Single source of truth for the DESIGN.md §2 "outline 은 보더 토큰" hard-rule
// exemptions.
//
// Hard rule (DESIGN.md §2 텍스트·보더): `--md-sys-color-outline` is the STRONG
// BORDER token (인풋 포커스 전). The token designated for 보조/메타 텍스트 and
// 아이콘 is `--md-sys-color-on-surface-variant`.
//
// Why this needs a guard rather than good intentions: light `outline` (#D4D6DC)
// on `surface` (#FBFBFC) measures 1.41:1, and dark (#2E3033 on #0F1011) 1.45:1 —
// both far under the WCAG AA body-text floor of 4.5:1 and under the 3:1
// non-text floor that interactive glyphs (× remove buttons) owe. It had spread
// to 82 sites across 51 files before anyone measured it, because `outline` reads
// like a plausible "third text tier" name. There is no room for a genuine third
// AA-passing tier: 4.5:1 on `surface` caps relative luminance at L≤0.175 and
// `on-surface-variant` already sits at L=0.161. Text hierarchy below the
// secondary tier is carried by typescale (size/weight), not by a lighter color.
//
// The ONLY sanctioned use as a text color is a purely decorative separator
// glyph that is hidden from assistive tech (`aria-hidden`) — WCAG 1.4.3 exempts
// decorative text, and a separator that AT never announces is exactly that.
// Every entry below must satisfy that test.
//
// Consumed by `lib/design/__tests__/outline-text-drift.test.ts`. Add an entry
// ONLY for an aria-hidden decorative glyph, with the reason recorded here.
//
// Paths are repo-relative file paths or directory prefixes.
export const OUTLINE_TEXT_ALLOWLIST = [
  // Breadcrumb 항목 사이 "/" 구분자. `role="presentation" aria-hidden="true"` 로
  // 이미 AT 에서 완전히 배제된 순수 장식이며, 실제 항목과 같은 톤으로 올리면
  // 구분자가 항목만큼 진해져 위계가 오히려 무너진다.
  'components/ui/breadcrumb.tsx',
  // 딜룸 헤더의 견적번호·제목 사이 "·" 구분자. 위와 같은 이유로 장식이며,
  // 같은 계약을 만족하도록 `aria-hidden` 을 함께 부여했다.
  'components/deal-room/DealRoomShell.tsx',
];
