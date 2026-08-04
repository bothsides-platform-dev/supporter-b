import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

// after() has no request scope in a unit test, so capture its callbacks and run
// them manually — this also proves the reconcile is scheduled post-response.
const { afterCbs } = vi.hoisted(() => ({ afterCbs: [] as Array<() => Promise<void> | void> }));
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: (fn: () => Promise<void> | void) => afterCbs.push(fn) };
});
async function flushAfter(): Promise<void> {
  for (const cb of afterCbs.splice(0)) await cb();
}

import { POST } from '../route';
import {
  __resetContractSigningServiceForTest,
  __setContractSigningServiceForTest,
  type ContractSigningService,
} from '@/lib/server/services/contract-signing';
import {
  WEBHOOK_RECONCILE_LIMIT_PER_MIN,
  __resetWebhookRateLimitForTest,
} from '@/lib/server/signing/webhook-rate-limit';

const SECRET = 'whsec_test';

function req(body: string, sig?: string | null): Request {
  const headers = new Headers();
  if (sig !== null && sig !== undefined) headers.set('X-Webhook-Signature', sig);
  return new Request('http://localhost/api/signing/webhook', { method: 'POST', headers, body });
}
function signed(payload: unknown): Request {
  const body = JSON.stringify(payload);
  const sig = createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');
  return req(body, sig);
}

describe('POST /api/signing/webhook', () => {
  let reconcileByProviderRef: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv('SNOWSIGN_WEBHOOK_SECRET', SECRET);
    afterCbs.length = 0;
    __resetWebhookRateLimitForTest();
    reconcileByProviderRef = vi.fn(async () => ({ ok: true }));
    __setContractSigningServiceForTest({
      reconcileByProviderRef,
    } as unknown as ContractSigningService);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetContractSigningServiceForTest();
  });

  it('401 and no reconcile when the signing secret is unset (cannot verify)', async () => {
    vi.stubEnv('SNOWSIGN_WEBHOOK_SECRET', '');
    const body = JSON.stringify({ event: 'contract.completed', data: { contract_id: 'ct_1' } });
    const res = await POST(req(body, 'anything'));
    expect(res.status).toBe(401);
    expect(reconcileByProviderRef).not.toHaveBeenCalled();
  });

  it('401 and no reconcile with a bad signature', async () => {
    const body = JSON.stringify({ event: 'contract.completed', data: { contract_id: 'ct_1' } });
    const res = await POST(req(body, 'deadbeef'));
    expect(res.status).toBe(401);
    expect(reconcileByProviderRef).not.toHaveBeenCalled();
  });

  it('200 and no reconcile for a test event (valid signature)', async () => {
    const res = await POST(signed({ event: 'test', data: { message: 'hi' } }));
    expect(res.status).toBe(200);
    expect(reconcileByProviderRef).not.toHaveBeenCalled();
  });

  it('acks 200 immediately and reconciles by provider ref after the response (via after())', async () => {
    const res = await POST(
      signed({ event: 'contract.completed', data: { contract_id: 'ct_00000001' } }),
    );
    expect(res.status).toBe(200);
    // Reconcile is deferred to after() — not run before the response is returned.
    expect(reconcileByProviderRef).not.toHaveBeenCalled();
    await flushAfter();
    expect(reconcileByProviderRef).toHaveBeenCalledWith('ct_00000001');
  });

  it('200 but no reconcile for a malformed contract_id — 임베드/액션 경로와 같은 화이트리스트', async () => {
    const res = await POST(
      signed({ event: 'contract.completed', data: { contract_id: 'x); DROP--' } }),
    );
    expect(res.status).toBe(200);
    await flushAfter();
    expect(reconcileByProviderRef).not.toHaveBeenCalled();
  });

  it('한도 초과분은 200 ack 만 하고 재조회를 예약하지 않는다 — 리플레이 증폭 DoS 차단(폴링이 백스톱)', async () => {
    for (let i = 0; i < WEBHOOK_RECONCILE_LIMIT_PER_MIN; i += 1) {
      await POST(
        signed({ event: 'contract.completed', data: { contract_id: `ct_${10000000 + i}` } }),
      );
    }
    const res = await POST(
      signed({ event: 'contract.completed', data: { contract_id: 'ct_overflow_1' } }),
    );
    expect(res.status).toBe(200); // 5xx 를 돌려주지 않는 기존 정책 유지
    await flushAfter();
    expect(reconcileByProviderRef).toHaveBeenCalledTimes(WEBHOOK_RECONCILE_LIMIT_PER_MIN);
    expect(reconcileByProviderRef).not.toHaveBeenCalledWith('ct_overflow_1');
  });

  it('200 and no reconcile for an event missing contract_id', async () => {
    const res = await POST(signed({ event: 'participant.signed', data: {} }));
    expect(res.status).toBe(200);
    expect(reconcileByProviderRef).not.toHaveBeenCalled();
  });

  it('acks 200 (not 500) for an authentic body of literal null', async () => {
    const res = await POST(signed(null));
    expect(res.status).toBe(200);
    expect(reconcileByProviderRef).not.toHaveBeenCalled();
  });
});
