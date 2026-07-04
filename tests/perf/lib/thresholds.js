/**
 * 공통 임계값 — smoke/load 양쪽에서 import
 *
 * 설계 원칙:
 *  - 페이지 응답은 **태그별**로 측정한다. 무차별 `http_req_duration` 은 login 에
 *    오염된다 — credentials authorize 가 bcryptjs(순수 JS) cost 12 검증을 수행해
 *    본질적으로 느리기 때문(CI 단일 요청 ~700-800ms, 동시성 하에선 더). 그래서
 *    login·server-action 은 페이지 기준과 분리한 별도 상한으로 회귀만 잡는다.
 *  - 에러율 < 1%.
 *
 * 업계 표준(저부하 기준): 페이지 p95 < 500ms, Server Action p95 < 800ms.
 */

/**
 * 부하 프로파일별 임계값을 만든다 — smoke/load 가 구조적으로 어긋나지 않도록 단일 출처.
 * @param {{page:number, login:number, action:number}} ms - 각 그룹의 p95 상한(ms)
 */
function makeThresholds({ page, login, action }) {
  return {
    http_req_failed: ['rate<0.01'],

    // 페이지 로드 — auth.js/scenario 의 tags.name 과 일치해야 한다.
    'http_req_duration{name:home}': [`p(95)<${page}`],
    'http_req_duration{name:rfp-list}': [`p(95)<${page}`],
    'http_req_duration{name:inbox}': [`p(95)<${page}`],
    'http_req_duration{name:inbox-detail}': [`p(95)<${page}`],

    // Server Action 전용 (DB 쓰기 포함)
    'http_req_duration{name:server-action}': [`p(95)<${action}`],

    // 인증 — bcryptjs cost 12 검증으로 본질적으로 느림. 명백한 회귀만 잡는 현실적 상한.
    'http_req_duration{name:login}': [`p(95)<${login}`],
  };
}

// smoke (2 VU) — 저부하, 엄격
export const thresholds = makeThresholds({ page: 500, login: 1500, action: 800 });

// load (10 VU) — bcrypt 동시성으로 login·페이지 모두 여유 필요
export const loadThresholds = makeThresholds({ page: 1000, login: 3000, action: 1500 });
