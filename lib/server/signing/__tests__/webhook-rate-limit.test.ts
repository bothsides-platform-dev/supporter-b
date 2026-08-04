import { beforeEach, describe, expect, it } from 'vitest';

import {
  WEBHOOK_RECONCILE_LIMIT_PER_MIN,
  __resetWebhookRateLimitForTest,
  allowWebhookReconcile,
} from '../webhook-rate-limit';

describe('allowWebhookReconcile', () => {
  beforeEach(() => __resetWebhookRateLimitForTest());

  it('창 안에서는 한도까지 허용하고 그 다음부터 거절한다', () => {
    const now = 1_000_000;
    for (let i = 0; i < WEBHOOK_RECONCILE_LIMIT_PER_MIN; i += 1) {
      expect(allowWebhookReconcile(now)).toBe(true);
    }
    expect(allowWebhookReconcile(now)).toBe(false);
  });

  it('창이 지나면 카운터가 리셋된다', () => {
    const now = 1_000_000;
    for (let i = 0; i < WEBHOOK_RECONCILE_LIMIT_PER_MIN; i += 1) allowWebhookReconcile(now);
    expect(allowWebhookReconcile(now)).toBe(false);
    expect(allowWebhookReconcile(now + 60_001)).toBe(true);
  });
});
