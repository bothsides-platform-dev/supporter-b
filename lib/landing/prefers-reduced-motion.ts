// 랜딩 연출용 공용 헬퍼. SSR(window 없음)·matchMedia 미지원·동작 줄이기 선호를 모두
// "애니메이션 생략"으로 처리한다. 이펙트(클라이언트 전용) 안에서만 호출할 것.
// 랜딩 컴포넌트가 아닌 곳(테마 전환 view-transition 등)에서만 쓴다 — 랜딩 연출은
// 아래 landingMotionUnavailable()을 대신 쓴다(제품 결정으로 reduce 선호를 무시).
export function prefersReducedMotion(): boolean {
  return (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// 랜딩 연출은 사용자의 '동작 줄이기'(prefers-reduced-motion) 선호를 의도적으로 무시하고 항상
// 실행한다(제품 결정 — DESIGN.md §9 예외 ③, ScrollPinnedSection과 동일한 랜딩 한정 예외).
// 브라우저 애니메이션 API가 없는 SSR·jsdom(테스트) 환경만 정적 폴백이 필요하므로 그 경우에만
// true를 반환한다. reduce 선호(matchMedia(...).matches)는 보지 않는다.
export function landingMotionUnavailable(): boolean {
  return typeof window === 'undefined' || typeof window.matchMedia !== 'function';
}
