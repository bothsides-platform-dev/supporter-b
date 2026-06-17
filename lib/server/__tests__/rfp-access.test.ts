import { describe, expect, it } from 'vitest';
import { canWorkspaceAccessRfp } from '../rfp-access';
import type { RfpRepo, InvitationRepo } from '../repositories/types';

// Minimal fake RFP for test fixtures.
const rfpBase = {
  id: 'rfp-1',
  code: 'P-2605-0001',
  title: 'Test RFP',
  buyerWsId: 'buyer-ws',
  memo: '',
  deadline: '2025-12-31T00:00:00.000Z',
  status: 'sent' as const,
  rfpFiles: [],
  allowedPgWorkspaceIds: [],
  requiredPaymentMethods: [],
  customPaymentMethods: [],
  createdBy: 'user-1',
  createdAt: '2025-06-01T00:00:00.000Z',
};

function makeRfpRepo(rfp?: typeof rfpBase): Pick<RfpRepo, 'findById'> {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findById: async () => rfp as any,
  };
}

function makeInvRepo(canAccess: boolean): Pick<InvitationRepo, 'canAccess'> {
  return {
    canAccess: async () => canAccess,
  };
}

describe('canWorkspaceAccessRfp', () => {
  it('allows buyer workspace that owns the RFP', async () => {
    const result = await canWorkspaceAccessRfp(
      makeRfpRepo(rfpBase),
      makeInvRepo(false),
      'rfp-1',
      'buyer-ws',
    );
    expect(result).toEqual({ allowed: true });
  });

  it('allows invited PG workspace', async () => {
    const result = await canWorkspaceAccessRfp(
      makeRfpRepo(rfpBase),
      makeInvRepo(true),
      'rfp-1',
      'pg-ws',
    );
    expect(result).toEqual({ allowed: true });
  });

  it('denies uninvited PG workspace', async () => {
    const result = await canWorkspaceAccessRfp(
      makeRfpRepo(rfpBase),
      makeInvRepo(false),
      'rfp-1',
      'pg-ws',
    );
    expect(result).toEqual({ allowed: false, reason: 'FORBIDDEN' });
  });

  it('returns RFP_NOT_FOUND when RFP does not exist', async () => {
    const result = await canWorkspaceAccessRfp(
      makeRfpRepo(undefined),
      makeInvRepo(false),
      'rfp-missing',
      'any-ws',
    );
    expect(result).toEqual({ allowed: false, reason: 'RFP_NOT_FOUND' });
  });
});
