/**
 * Smoke test — 2 VU, 1분
 *
 * 핵심 사용자 흐름이 기본적으로 동작하는지 확인.
 * PR마다 실행 (빠른 회귀 감지).
 */
import { sleep } from 'k6';
import { thresholds } from './lib/thresholds.js';
import { login } from './lib/auth.js';
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL        || 'http://localhost:3002';
const BUYER_EMAIL    = __ENV.TEST_BUYER_EMAIL    || 'perf-buyer@supporter-b.test';
const BUYER_PASSWORD = __ENV.TEST_BUYER_PASSWORD || 'perf-password-123';
const PG_EMAIL       = __ENV.TEST_PG_EMAIL       || 'perf-pg-1@supporter-b.test';
const PG_PASSWORD    = __ENV.TEST_PG_PASSWORD    || 'perf-password-123';
const RFP_ID         = __ENV.TEST_RFP_ID         || '';

export const options = {
  vus: 2,
  duration: '1m',
  thresholds,
};

export default function smokeScenario() {
  // ── 구매사 흐름 ─────────────────────────────────────────────
  login(BUYER_EMAIL, BUYER_PASSWORD);

  // 홈 페이지 로드
  const homeRes = http.get(`${BASE_URL}/home`, { tags: { name: 'home' } });
  check(homeRes, { 'home 200': (r) => r.status === 200 });

  // RFP 목록
  const rfpRes = http.get(`${BASE_URL}/rfp`, { tags: { name: 'rfp-list' } });
  check(rfpRes, { 'rfp-list 200': (r) => r.status === 200 });

  sleep(1);

  // ── PG 흐름 ─────────────────────────────────────────────────
  login(PG_EMAIL, PG_PASSWORD);

  // 인박스 목록
  const inboxRes = http.get(`${BASE_URL}/inbox`, { tags: { name: 'inbox' } });
  check(inboxRes, { 'inbox 200': (r) => r.status === 200 });

  if (RFP_ID) {
    // 인박스 상세 (견적 작성 페이지)
    const detailRes = http.get(`${BASE_URL}/inbox/${RFP_ID}`, { tags: { name: 'inbox-detail' } });
    check(detailRes, { 'inbox-detail 200': (r) => r.status === 200 });
  }

  sleep(1);
}
