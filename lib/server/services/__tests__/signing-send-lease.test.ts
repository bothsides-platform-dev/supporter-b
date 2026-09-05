import { describe, expect, it } from 'vitest';

import type {
  AuditLogRepo,
  SigningContractRepo,
  WorkspaceRepo,
} from '@/lib/server/repositories/types';
import { SigningSendLease } from '../signing-send-lease';

function leaseRepo(
  claimed: boolean,
  overrides: Partial<SigningContractRepo> = {},
): SigningContractRepo {
  return {
    claimForSend: async () => claimed,
    ...overrides,
  } as unknown as SigningContractRepo;
}

function sendLease(signingRepo: SigningContractRepo): SigningSendLease {
  return new SigningSendLease({
    signingRepo,
    db: {},
    workspaceRepo: {} as WorkspaceRepo,
    auditRepo: {} as AuditLogRepo,
  });
}

describe('SigningSendLease.claim', () => {
  it('reports success when the lease is available', async () => {
    const lease = sendLease(leaseRepo(true));
    const now = new Date('2026-09-05T10:00:00.000Z');

    await expect(
      lease.claim({ contractId: 'contract-1', holderUserId: 'user-1', now }),
    ).resolves.toEqual({ ok: true });
  });

  it('reports contention when another sender holds the lease', async () => {
    const lease = sendLease(leaseRepo(false));

    await expect(
      lease.claim({
        contractId: 'contract-1',
        holderUserId: 'user-1',
        now: new Date('2026-09-05T10:00:00.000Z'),
      }),
    ).resolves.toEqual({ ok: false, error: 'SEND_HELD_BY_TEAMMATE' });
  });

  it('renews only the caller-owned token and reports the new token', async () => {
    const lease = sendLease(
      leaseRepo(true, { renewSendClaim: async () => true }),
    );
    const current = new Date('2026-09-05T10:00:00.000Z');
    const next = new Date('2026-09-05T10:01:00.000Z');

    await expect(
      lease.renew({ contractId: 'contract-1', holderUserId: 'user-1', current, next }),
    ).resolves.toEqual({ ok: true, claimedAt: next });
  });

  it('distinguishes a lease taken by another sender from ordinary contention', async () => {
    const lease = sendLease(
      leaseRepo(true, {
        renewSendClaim: async () => false,
        findSendLease: async () => ({
          claimedAt: new Date('2026-09-05T10:00:30.000Z'),
          holderUserId: 'user-2',
        }),
      }),
    );

    await expect(
      lease.renew({
        contractId: 'contract-1',
        holderUserId: 'user-1',
        current: new Date('2026-09-05T10:00:00.000Z'),
        next: new Date('2026-09-05T10:01:00.000Z'),
      }),
    ).resolves.toEqual({ ok: false, error: 'SEND_TAKEN_OVER' });
  });

  it('treats release as best-effort because expiry is the backstop', async () => {
    const lease = sendLease(
      leaseRepo(true, {
        releaseSendClaim: async () => {
          throw new Error('db unavailable');
        },
      }),
    );

    await expect(
      lease.release({
        contractId: 'contract-1',
        claimedAt: new Date('2026-09-05T10:00:00.000Z'),
      }),
    ).resolves.toEqual({ ok: true });
  });
});

describe('SigningSendLease.holder', () => {
  it('returns no holder when the signing contract has no active lease', async () => {
    const lease = new SigningSendLease({
      signingRepo: leaseRepo(true, { findSendLease: async () => undefined }),
      db: {},
      workspaceRepo: {
        teamRoster: async () => {
          throw new Error('team roster must not be queried without a holder');
        },
      } as unknown as WorkspaceRepo,
      auditRepo: {} as AuditLogRepo,
    });

    await expect(
      lease.holder({
        contractId: 'contract-1',
        workspaceId: 'pg-1',
        actorUserId: 'user-1',
      }),
    ).resolves.toEqual({ holder: null, isSelf: false });
  });

  it('does not expose a stale holder id that is absent from the current team roster', async () => {
    const lease = new SigningSendLease({
      signingRepo: leaseRepo(true, {
        findSendLease: async () => ({
          claimedAt: new Date('2026-09-05T10:00:00.000Z'),
          holderUserId: 'former-member',
        }),
      }),
      db: {},
      workspaceRepo: { teamRoster: async () => [] } as unknown as WorkspaceRepo,
      auditRepo: {} as AuditLogRepo,
    });

    await expect(
      lease.holder({
        contractId: 'contract-1',
        workspaceId: 'pg-1',
        actorUserId: 'user-1',
      }),
    ).resolves.toEqual({ holder: null, isSelf: false });
  });
});
