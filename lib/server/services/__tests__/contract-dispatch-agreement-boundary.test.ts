import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/signing/agreement-boundary', () => ({
  requiresCommonAgreement: vi.fn(async () => false),
}));

import { ContractDispatch } from '../contract-dispatch';
import { requiresCommonAgreement } from '@/lib/server/signing/agreement-boundary';

const actor = { userId: 'pg-user', workspaceId: 'pg-workspace' };

function dispatchWith(overrides: {
  contract?: { id: string; rfpId: string; status: string };
  rfp?: { id: string; awardedBidId: string | null };
  party?: 'pg' | null;
}) {
  const agreement = vi.fn(async () => ({ ok: true as const }));
  const findById = vi.fn(async () => overrides.contract ? { contract: overrides.contract } : undefined);
  const findRfp = vi.fn(async () => overrides.rfp);
  const resolveParty = vi.fn(async () => overrides.party === undefined ? 'pg' : overrides.party);
  const dispatch = new ContractDispatch({
    agreementRepo: { findDraft: vi.fn(async () => undefined) },
    rfpRepo: { findById: findRfp } as never,
    signingRepo: { findById } as never,
    bidRepo: {} as never,
    templateRepo: {} as never,
    resolveParty,
    adapters: { template: vi.fn(), compose: vi.fn(), agreement },
  });
  return { dispatch, agreement, findById, findRfp, resolveParty };
}

describe('ContractDispatch agreement boundary', () => {
  it('hides a missing contract before reading an RFP or invoking an adapter', async () => {
    const f = dispatchWith({});
    await expect(f.dispatch.dispatch({ source: 'agreement', contractId: 'missing', actor, stamp: 'v1' }))
      .resolves.toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(f.findRfp).not.toHaveBeenCalled();
    expect(f.agreement).not.toHaveBeenCalled();
  });

  it('hides a missing RFP and denies a foreign PG before agreement evaluation', async () => {
    const contract = { id: 'contract-1', rfpId: 'rfp-1', status: 'awaiting_pg_template' };
    const missingRfp = dispatchWith({ contract });
    await expect(missingRfp.dispatch.dispatch({ source: 'agreement', contractId: contract.id, actor, stamp: 'v1' }))
      .resolves.toEqual({ ok: false, error: 'FORBIDDEN' });
    const foreign = dispatchWith({ contract, rfp: { id: 'rfp-1', awardedBidId: 'bid-1' }, party: null });
    await expect(foreign.dispatch.dispatch({ source: 'agreement', contractId: contract.id, actor, stamp: 'v1' }))
      .resolves.toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(foreign.agreement).not.toHaveBeenCalled();
  });

  it('rejects an inapplicable agreement without dispatching a provider contract', async () => {
    vi.mocked(requiresCommonAgreement).mockResolvedValueOnce(false);
    const f = dispatchWith({
      contract: { id: 'contract-1', rfpId: 'rfp-1', status: 'awaiting_pg_template' },
      rfp: { id: 'rfp-1', awardedBidId: 'bid-1' },
    });
    await expect(f.dispatch.dispatch({ source: 'agreement', contractId: 'contract-1', actor, stamp: 'v1' }))
      .resolves.toEqual({ ok: false, error: 'AGREEMENT_NOT_APPLICABLE' });
    expect(f.agreement).not.toHaveBeenCalled();
  });
});
