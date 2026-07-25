/**
 * 캔버스 색(`--md-sys-color-background`)의 JS 사본 — 단일 출처.
 *
 * CSS 토큰을 그대로 읽어 쓸 수 없는 지점이 둘 있다: `viewport.themeColor`·manifest 는
 * 빌드타임 값이 필요하고, FOUC 방지 인라인 스크립트는 스타일시트가 적용되기 전에 돈다
 * (`getComputedStyle` 로 토큰을 읽으면 빈 문자열이다). 그래서 JS 쪽 사본이 하나는 필요하다.
 *
 * 대신 **이 파일이 그 유일한 사본**이다 — layout 의 viewport, manifest, 런타임 크롬
 * 동기화(`./chrome-color`), 인라인 스크립트가 전부 여기서 읽는다. 이전에는 같은 리터럴이
 * `app/layout.tsx`·`app/manifest.ts` 에 흩어져 있었다.
 *
 * `styles/tokens.css` 와의 일치는 `app/__tests__/chrome-colors.test.ts` 가 고정한다
 * (tokens.css → CANVAS_COLOR → viewport/manifest 체인). 캔버스 토큰을 바꾸면 여기도 바뀐다.
 */
export const CANVAS_COLOR = {
  light: '#FFFFFF',
  dark: '#08090A',
} as const;
