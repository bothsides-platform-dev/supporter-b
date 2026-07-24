/**
 * load-shed 상한 파싱 — route 모듈 로드 시 1회 호출.
 *
 * `Number(env)` 직결이던 시절엔 malformed 값('abc')이 NaN 이 되어
 * `inFlight >= NaN` 항상-false 로 load-shed 전체가 조용히 꺼졌고, 음수면
 * 항상-true 로 전 요청이 503 이었다. finite ≥ 0 만 수용하고 그 외에는
 * 기본값으로 폴백한다. 0 은 유효한 킬스위치(전부 shed).
 *
 * route.ts 와 분리된 이유: Next 는 route 파일의 export 를 핸들러/설정으로
 * 제한하므로 순수 파서를 여기서 export 해 단위 테스트한다.
 */
export const DEFAULT_MAX_INFLIGHT = 25;

export function resolveMaxInflight(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_MAX_INFLIGHT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_MAX_INFLIGHT;
  return n;
}
