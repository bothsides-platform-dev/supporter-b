import { beforeEach, describe, expect, it } from 'vitest';

import {
  WEBHOOK_RECONCILE_GLOBAL_LIMIT,
  WEBHOOK_RECONCILE_LIMIT_PER_CONTRACT,
  __resetWebhookRateLimitForTest,
  consumeWebhookReconcileBudget,
} from '../webhook-rate-limit';

describe('consumeWebhookReconcileBudget', () => {
  beforeEach(() => __resetWebhookRateLimitForTest());

  it('계약별 한도 — 같은 계약은 한도까지 허용, 초과분은 contract 사유로 거절', () => {
    const now = 1_000_000;
    for (let i = 0; i < WEBHOOK_RECONCILE_LIMIT_PER_CONTRACT; i += 1) {
      expect(consumeWebhookReconcileBudget('ct_a', now)).toBe('ok');
    }
    expect(consumeWebhookReconcileBudget('ct_a', now)).toBe('contract');
  });

  it('키 격리 — 한 계약의 리플레이 포화가 다른 계약을 굶기지 않는다', () => {
    const now = 1_000_000;
    for (let i = 0; i <= WEBHOOK_RECONCILE_LIMIT_PER_CONTRACT; i += 1) {
      consumeWebhookReconcileBudget('ct_flood', now);
    }
    expect(consumeWebhookReconcileBudget('ct_flood', now)).toBe('contract');
    expect(consumeWebhookReconcileBudget('ct_other', now)).toBe('ok');
  });

  it('전역 백스톱 — 서로 다른 계약이라도 총량을 넘으면 global 사유로 거절', () => {
    const now = 1_000_000;
    const contracts = Math.ceil(
      WEBHOOK_RECONCILE_GLOBAL_LIMIT / WEBHOOK_RECONCILE_LIMIT_PER_CONTRACT,
    );
    let consumed = 0;
    for (let c = 0; c < contracts && consumed < WEBHOOK_RECONCILE_GLOBAL_LIMIT; c += 1) {
      for (
        let i = 0;
        i < WEBHOOK_RECONCILE_LIMIT_PER_CONTRACT && consumed < WEBHOOK_RECONCILE_GLOBAL_LIMIT;
        i += 1
      ) {
        expect(consumeWebhookReconcileBudget(`ct_${c}`, now)).toBe('ok');
        consumed += 1;
      }
    }
    expect(consumeWebhookReconcileBudget('ct_fresh', now)).toBe('global');
  });

  it('창 경계 — 정확히 60초에 리셋되고(≥), 59.999초는 아직 창 안이다', () => {
    const now = 1_000_000;
    for (let i = 0; i <= WEBHOOK_RECONCILE_LIMIT_PER_CONTRACT; i += 1) {
      consumeWebhookReconcileBudget('ct_a', now);
    }
    expect(consumeWebhookReconcileBudget('ct_a', now + 59_999)).toBe('contract');
    expect(consumeWebhookReconcileBudget('ct_a', now + 60_000)).toBe('ok');
  });
});
