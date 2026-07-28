import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

// 세션 목 — award.test.ts 와 동일 패턴.
const sessionRef: {
  value: {
    user: {
      id: string;
      email: string;
      workspaceId: string;
      workspaceType: 'buyer';
      role: 'admin' | 'member';
    };
  } | null;
} = { value: null };

vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value ? Promise.resolve(sessionRef.value) : Promise.reject(new Error('UNAUTHENTICATED')),
  requireBuyerSession: () =>
    sessionRef.value ? Promise.resolve(sessionRef.value) : Promise.reject(new Error('FORBIDDEN_BUYER')),
}));

// after() has no request scope in a unit test — capture its callbacks and run them
// manually. This also proves signing initiation is deferred to after the response.
const { afterCbs, afterState } = vi.hoisted(() => ({
  afterCbs: [] as Array<() => Promise<void> | void>,
  afterState: { throws: false },
}));
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: (fn: () => Promise<void> | void) => {
      if (afterState.throws) throw new Error('`after` was called outside a request scope.');
      afterCbs.push(fn);
    },
  };
});
async function flushAfter(): Promise<void> {
  for (const cb of afterCbs.splice(0)) await cb();
}

import { awardRfpAction } from '../awardRfpAction';
import {
  __resetRfpServiceForTest,
  __setRfpServiceForTest,
  type RfpService,
} from '@/lib/server/services/rfp';
import {
  __resetContractSigningServiceForTest,
  __setContractSigningServiceForTest,
  type ContractSigningService,
} from '@/lib/server/services/contract-signing';

const RFP_ID = randomUUID();
const BID_ID = randomUUID();

const buyer = {
  user: {
    id: 'u1',
    email: 'b@x.com',
    workspaceId: 'ws1',
    workspaceType: 'buyer' as const,
    role: 'admin' as const,
  },
};

describe('awardRfpAction → onAward hook', () => {
  beforeEach(() => {
    sessionRef.value = buyer;
    afterCbs.length = 0;
    afterState.throws = false;
  });
  afterEach(() => {
    __resetRfpServiceForTest();
    __resetContractSigningServiceForTest();
    sessionRef.value = null;
  });

  it('calls signing.onAward after a successful award', async () => {
    __setRfpServiceForTest({ award: vi.fn(async () => ({ ok: true as const })) } as unknown as RfpService);
    const onAward = vi.fn(async () => ({ ok: true as const }));
    __setContractSigningServiceForTest({ onAward } as unknown as ContractSigningService);

    const r = await awardRfpAction({ rfpId: RFP_ID, awardedBidId: BID_ID });
    expect(r.ok).toBe(true);
    await flushAfter();
    expect(onAward).toHaveBeenCalledWith(RFP_ID, BID_ID, { userId: 'u1', workspaceId: 'ws1' });
  });

  it('does NOT start signing when the award itself fails', async () => {
    __setRfpServiceForTest({
      award: vi.fn(async () => ({ ok: false as const, error: 'INVALID_TRANSITION' })),
    } as unknown as RfpService);
    const onAward = vi.fn();
    __setContractSigningServiceForTest({ onAward } as unknown as ContractSigningService);

    const r = await awardRfpAction({ rfpId: RFP_ID, awardedBidId: BID_ID });
    expect(r.ok).toBe(false);
    expect(onAward).not.toHaveBeenCalled();
  });

  it('award stays successful even if onAward throws (award is immutable)', async () => {
    __setRfpServiceForTest({ award: vi.fn(async () => ({ ok: true as const })) } as unknown as RfpService);
    __setContractSigningServiceForTest({
      onAward: vi.fn(async () => {
        throw new Error('snowsign down');
      }),
    } as unknown as ContractSigningService);

    const r = await awardRfpAction({ rfpId: RFP_ID, awardedBidId: BID_ID });
    expect(r.ok).toBe(true);
    // after() 콜백이 onAward 의 throw 를 안에서 삼킨다 — flush 가 reject 되지 않는다.
    await expect(flushAfter()).resolves.toBeUndefined();
  });

  it('defers onAward to after() — award returns before signing starts (a SnowSign hang cannot block it)', async () => {
    __setRfpServiceForTest({ award: vi.fn(async () => ({ ok: true as const })) } as unknown as RfpService);
    const onAward = vi.fn(async () => ({ ok: true as const }));
    __setContractSigningServiceForTest({ onAward } as unknown as ContractSigningService);

    const r = await awardRfpAction({ rfpId: RFP_ID, awardedBidId: BID_ID });
    expect(r.ok).toBe(true);
    // 응답 전에는 onAward 가 실행되지 않는다(after() 로 지연) — SnowSign hang 이 award 응답을 막지 못한다.
    expect(onAward).not.toHaveBeenCalled();

    await flushAfter();
    expect(onAward).toHaveBeenCalledWith(RFP_ID, BID_ID, { userId: 'u1', workspaceId: 'ws1' });
  });

  it('falls back to fire-and-forget when after() is unavailable (no request scope) — award still returns', async () => {
    __setRfpServiceForTest({ award: vi.fn(async () => ({ ok: true as const })) } as unknown as RfpService);
    const onAward = vi.fn(async () => ({ ok: true as const }));
    __setContractSigningServiceForTest({ onAward } as unknown as ContractSigningService);
    afterState.throws = true; // after() throws outside a request scope

    const r = await awardRfpAction({ rfpId: RFP_ID, awardedBidId: BID_ID });
    expect(r.ok).toBe(true); // award unaffected by after() throwing
    // fallback ran onAward fire-and-forget (not deferred to afterCbs).
    await vi.waitFor(() =>
      expect(onAward).toHaveBeenCalledWith(RFP_ID, BID_ID, { userId: 'u1', workspaceId: 'ws1' }),
    );
  });
});
