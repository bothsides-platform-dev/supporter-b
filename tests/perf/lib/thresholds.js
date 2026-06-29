/**
 * 공통 임계값 — smoke/load 양쪽에서 import
 *
 * 업계 표준 기반:
 *  - p95 < 500ms (페이지 응답)
 *  - 에러율 < 1%
 *  - Server Action p95 < 800ms (DB 쓰기 포함)
 */
export const thresholds = {
  // 전체 HTTP 요청
  http_req_duration: ['p(95)<500'],
  http_req_failed: ['rate<0.01'],

  // Server Action 전용 (태그 name=server-action으로 분리)
  'http_req_duration{name:server-action}': ['p(95)<800'],

  // 인증 엔드포인트
  'http_req_duration{name:login}': ['p(95)<400'],
};
