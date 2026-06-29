/**
 * Server Action 호출 헬퍼
 *
 * Next.js Server Action = POST <page-url>
 *   Next-Action: <build-time hash>
 *   Content-Type: text/plain;charset=UTF-8
 *   body: JSON.stringify([...args])
 *
 * action-ids.json은 scripts/extract-action-ids.mjs 가 빌드 후 생성한다.
 */
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3002';

// CI에서 extract-action-ids.mjs가 tests/perf/action-ids.json에 씀
// 로컬 smoke 실행 시에는 먼저 `node scripts/extract-action-ids.mjs` 필요
let actionIds = {};
try {
  actionIds = JSON.parse(open('./action-ids.json'));
} catch {
  // 아직 빌드 전(로컬 개발) — 빈 map, 테스트에서 skip 처리
}

/**
 * @param {string} actionName - action-ids.json의 키 (예: 'submitBid')
 * @param {string} pageUrl    - action이 정의된 페이지 경로 (예: '/inbox/rfp-id')
 * @param {Array}  args       - Server Action 인자 배열
 * @param {object} [params]   - k6 http params (headers, tags 등)
 */
export function callServerAction(actionName, pageUrl, args, params = {}) {
  const actionId = actionIds[actionName];
  if (!actionId) {
    console.warn(`action-ids.json에 '${actionName}' 없음 — 빌드 후 실행 필요`);
    return null;
  }

  const res = http.post(
    `${BASE_URL}${pageUrl}`,
    JSON.stringify(args),
    {
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Next-Action': actionId,
        'Next-Router-State-Tree': '%5B%22%22%2C%7B%7D%5D', // 최소 RSC 라우터 상태
        ...params.headers,
      },
      tags: { name: 'server-action', ...params.tags },
      ...params,
    },
  );

  check(res, {
    [`${actionName} 200`]: (r) => r.status === 200,
  });

  return res;
}
