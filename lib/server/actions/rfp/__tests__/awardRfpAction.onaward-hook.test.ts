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
  });
});
