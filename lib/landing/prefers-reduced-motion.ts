// 랜딩 연출용 공용 헬퍼. SSR(window 없음)·matchMedia 미지원·동작 줄이기 선호를 모두
// "애니메이션 생략"으로 처리한다. 이펙트(클라이언트 전용) 안에서만 호출할 것.
export function prefersReducedMotion(): boolean {
  return (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
