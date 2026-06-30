/**
 * Load test — 평균 부하 (main push 전용)
 *
 * 시나리오:
 *  - 0→10 VU 램프업 2분
 *  - 10 VU 유지 15분
 *  - 10→0 VU 램프다운 3분
 *
 * 각 VU는 buyer/pg 역할을 번갈아가며 핵심 API를 호출한다.
 * PG 10개 × RFP 10개 시드로 bid UNIQUE 충돌 없음.
 */
import { sleep } from 'k6';
import { loadThresholds } from './lib/thresholds.js';
import { login } from './lib/auth.js';
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL       = __ENV.BASE_URL            || 'http://localhost:3002';
const BUYER_EMAIL    = __ENV.TEST_BUYER_EMAIL    || 'perf-buyer@supporter-b.test';
const BUYER_PASSWORD = __ENV.TEST_BUYER_PASSWORD || 'perf-password-123';
const PG_PASSWORD    = __ENV.TEST_PG_PASSWORD    || 'perf-password-123';
const RFP_ID         = __ENV.TEST_RFP_ID         || '';

export const options = {
  stages: [
    { duration: '2m',  target: 10 }, // 램프업
    { duration: '15m', target: 10 }, // 유지
    { duration: '3m',  target: 0  }, // 램프다운
  ],
  // load 는 고부하 프리셋 — bcrypt 동시성으로 login·페이지 모두 여유를 둔다.
  thresholds: loadThresholds,
};

export default function loadScenario() {
  const vuIdx = __VU % 10; // 0~9 — PG별 전용 RFP 슬롯

  // ── 구매사: RFP 목록 조회 ────────────────────────────────────
  login(BUYER_EMAIL, BUYER_PASSWORD);

  const rfpListRes = http.get(`${BASE_URL}/rfp`, { tags: { name: 'rfp-list' } });
  check(rfpListRes, {
    'rfp-list 200': (r) => r.status === 200,
    'rfp-list authenticated (not /login)': (r) => !r.url.includes('/login'),
  });

  sleep(2);

  // ── PG: 인박스 조회 + 상세 ──────────────────────────────────
  // VU별 PG 이메일: perf-pg-1 ~ perf-pg-10
  const pgEmail = `perf-pg-${vuIdx + 1}@supporter-b.test`;
  login(pgEmail, PG_PASSWORD);

  const inboxRes = http.get(`${BASE_URL}/inbox`, { tags: { name: 'inbox' } });
  check(inboxRes, {
    'inbox 200': (r) => r.status === 200,
    'inbox authenticated (not /login)': (r) => !r.url.includes('/login'),
  });

  if (RFP_ID) {
    const detailRes = http.get(`${BASE_URL}/inbox/${RFP_ID}`, { tags: { name: 'inbox-detail' } });
    check(detailRes, { 'inbox-detail 200': (r) => r.status === 200 });
  }

  sleep(3);
}
