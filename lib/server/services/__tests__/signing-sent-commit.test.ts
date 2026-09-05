import { describe, expect, it } from 'vitest';

import type {
  AuditLogRepo,
  SigningContractRepo,
  UserRepo,
  WorkspaceRepo,
} from '@/lib/server/repositories/types';
import {
  SigningSentCommit,
  SigningSentCommitConflict,
} from '../signing-sent-commit';

describe('SigningSentCommit.confirmCreated', () => {
  it('rejects a sender that lost the lease before the local sent transition', async () => {
    const db = { transaction: async (run: (tx: object) => Promise<void>) => run({}) };
    const signingRepo = {
      markSentIfAwaiting: async () => false,
    } as unknown as SigningContractRepo;
    const commit = new SigningSentCommit(
      db,
      signingRepo,
      {} as AuditLogRepo,
      {} as WorkspaceRepo,
      {} as UserRepo,
    );

    await expect(
      commit.confirmCreated({
        active: { id: 'contract-1' } as never,
        rfp: { code: 'P-2609-0001' } as never,
        actor: { userId: 'user-1', workspaceId: 'pg-1' },
        now: new Date('2026-09-05T10:00:00.000Z'),
        providerRef: 'provider-1',
        sentAt: '2026-09-05T10:00:01.000Z',
        participants: [],
        draft: { origin: 'template', snowsignTemplateId: 'template-1' },
        auditMetadata: {},
      }),
    ).rejects.toBeInstanceOf(SigningSentCommitConflict);
  });
});

describe('SigningSentCommit.bindObserved', () => {
  it('reports a changed contract when the observed provider contract loses the local transition', async () => {
    const db = { transaction: async (run: (tx: object) => Promise<void>) => run({}) };
    const signingRepo = {
      markSentIfAwaiting: async () => false,
    } as unknown as SigningContractRepo;
    const userRepo = {
      findContactById: async () => ({ email: 'buyer@example.com' }),
    } as unknown as UserRepo;
    const commit = new SigningSentCommit(
      db,
      signingRepo,
      {} as AuditLogRepo,
      {} as WorkspaceRepo,
      userRepo,
    );

    await expect(
      commit.bindObserved({
        active: { id: 'contract-1', round: 1 } as never,
        rfp: {
          code: 'P-2609-0001',
          title: '결제 견적',
          createdBy: 'buyer-user',
        } as never,
        detail: {
          status: 'pending',
          participants: [{
            name: '구매사 담당자',
            email: 'buyer@example.com',
            status: 'pending',
          }],
        } as never,
        providerContractId: 'provider-1',
        actor: { userId: 'pg-user', workspaceId: 'pg-1' },
        source: 'recovery',
        pgWsId: 'pg-1',
      }),
    ).resolves.toEqual({ ok: false, error: 'CONTRACT_CHANGED' });
  });
});
