import { and, count, eq, sql } from 'drizzle-orm';

import { workspaceInvitations, workspaceMembers } from '@/lib/db/schema';
import { getMembership } from '@/lib/auth/active-workspace';
import type { AuditLogRepo, OutboxRepo, WorkspaceRepo } from '@/lib/server/repositories/types';
import { isUniqueViolation } from '@/lib/server/repositories/utils';
import { emitAfterCommit } from '@/lib/server/notifications/dispatch';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { generateToken, hashToken } from '@/lib/server/token';
import { renderWorkspaceInvited } from '@/lib/server/outbox/templates/workspaceInvited';
import { baseUrl } from '@/lib/server/env';
import { createWorkspaceInTx } from '@/lib/server/actions/workspace/_createWorkspace';
import { claimInviteInTx } from '@/lib/server/actions/workspace/_claimWorkspaceInvite';
import { dispatchWorkspaceInviteInApp } from '@/lib/server/actions/workspace/_workspaceInviteNotify';
import type { Notification } from '@/lib/types/notification';
import type { ServiceResult } from './types';

export type WorkspaceActor = { userId: string; workspaceId: string };

export type AcceptInviteActor = { userId: string; userEmail: string; workspaceId: string };

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function bucket15Min(now: Date = new Date()): number {
  return Math.floor(now.getTime() / (15 * 60 * 1000));
}

export class WorkspaceService {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly _db: any,
    private readonly outboxRepo: OutboxRepo,
    private readonly auditRepo: AuditLogRepo,
    private readonly workspaceRepo: WorkspaceRepo,
  ) {}

  async createWorkspace(
    input: { userId: string; type: 'buyer' | 'pg'; name: string; bizProfile?: object },
    _actor: WorkspaceActor,
  ): Promise<ServiceResult<{ workspaceId: string; applicationId: string }>> {
    const { workspaceId, applicationId } = await this._db.transaction(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (tx: any) => {
        const ids = await createWorkspaceInTx(tx, {
          userId: input.userId,
          type: input.type,
          name: input.name,
          bizProfile: input.bizProfile as Parameters<typeof createWorkspaceInTx>[1]['bizProfile'],
        });
        // 감사 로그 (C5) — 생성과 같은 트랜잭션에서 커밋.
        await this.auditRepo.insert(
          {
            actorUserId: input.userId,
            actorWorkspaceId: ids.workspaceId,
            action: 'workspace.create',
            entityType: 'workspace',
            entityId: ids.workspaceId,
            metadata: { name: input.name, type: input.type },
          },
          tx,
        );
        return ids;
      },
    );
    return { ok: true, workspaceId, applicationId };
  }

  async inviteMember(
    input: { email: string; role: 'admin' | 'member' },
    actor: WorkspaceActor,
  ): Promise<ServiceResult> {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
      return { ok: false, error: 'INVALID_INPUT' };
    }

    const membership = await getMembership(this._db, actor.userId, actor.workspaceId);
    if (!membership || membership.role !== 'admin') {
      return { ok: false, error: 'FORBIDDEN_NOT_ADMIN' };
    }

    const wsName = await this.workspaceRepo.getName(actor.workspaceId);
    if (wsName === undefined) return { ok: false, error: 'WORKSPACE_NOT_FOUND' };

    const normalizedEmail = normalizeEmail(input.email);
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    let pendingEmit: Notification | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this._db.transaction(async (tx: any): Promise<ServiceResult> => {
      try {
        await tx.insert(workspaceInvitations).values({
          workspaceId: actor.workspaceId,
          invitedEmail: normalizedEmail,
          invitedByUserId: actor.userId,
          role: input.role,
          tokenHash,
          expiresAt,
          status: 'pending',
        });
      } catch (err) {
        if (isUniqueViolation(err)) return { ok: false, error: 'ALREADY_INVITED' };
        throw err;
      }

      const inviteUrl = `${baseUrl()}/invite/workspace/${rawToken}`;
      const html = await renderWorkspaceInvited({ workspaceName: wsName, inviteUrl });
      await this.outboxRepo.enqueue(
        {
          event: 'workspace.invited',
          to: normalizedEmail,
          subject: '[Supporter B] 워크스페이스 초대장',
          html,
          dedupeKey: `ws-invite:${actor.workspaceId}:${normalizedEmail}:${bucket15Min()}`,
        },
        tx,
      );

      pendingEmit = await dispatchWorkspaceInviteInApp(tx, {
        invitedEmail: normalizedEmail,
        workspaceName: wsName,
        linkUrl: `/invite/workspace/${rawToken}`,
      });

      // 감사 로그 (C5) — 초대와 같은 트랜잭션에서 커밋.
      await this.auditRepo.insert(
        {
          actorUserId: actor.userId,
          actorWorkspaceId: actor.workspaceId,
          action: 'workspace.member_invite',
          entityType: 'workspace',
          entityId: actor.workspaceId,
          metadata: { email: normalizedEmail, role: input.role },
        },
        tx,
      );

      return { ok: true };
    });

    if (result.ok) {
      if (pendingEmit) emitAfterCommit([pendingEmit]);
      flushAfterCommit();
    }
    return result;
  }

  async resendInvite(
    input: { email: string },
    actor: WorkspaceActor,
  ): Promise<ServiceResult> {
    const membership = await getMembership(this._db, actor.userId, actor.workspaceId);
    if (!membership || membership.role !== 'admin') {
      return { ok: false, error: 'FORBIDDEN_NOT_ADMIN' };
    }

    const wsName = await this.workspaceRepo.getName(actor.workspaceId);
    if (wsName === undefined) return { ok: false, error: 'WORKSPACE_NOT_FOUND' };

    const normalizedEmail = normalizeEmail(input.email);
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    let pendingEmit: Notification | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this._db.transaction(async (tx: any): Promise<ServiceResult> => {
      const updated = await tx
        .update(workspaceInvitations)
        .set({ tokenHash, expiresAt, updatedAt: new Date() })
        .where(
          and(
            eq(workspaceInvitations.workspaceId, actor.workspaceId),
            eq(workspaceInvitations.status, 'pending'),
            sql`lower(${workspaceInvitations.invitedEmail}) = ${normalizedEmail}`,
          ),
        )
        .returning({ id: workspaceInvitations.id });

      if (updated.length === 0) return { ok: false, error: 'INVITE_NOT_FOUND' };

      const inviteUrl = `${baseUrl()}/invite/workspace/${rawToken}`;
      const html = await renderWorkspaceInvited({ workspaceName: wsName, inviteUrl });
      await this.outboxRepo.enqueue(
        {
          event: 'workspace.invited',
          to: normalizedEmail,
          subject: '[Supporter B] 워크스페이스 초대장',
          html,
          dedupeKey: `ws-invite-resend:${actor.workspaceId}:${normalizedEmail}:${tokenHash}`,
        },
        tx,
      );

      pendingEmit = await dispatchWorkspaceInviteInApp(tx, {
        invitedEmail: normalizedEmail,
        workspaceName: wsName,
        linkUrl: `/invite/workspace/${rawToken}`,
      });

      return { ok: true };
    });

    if (result.ok) {
      if (pendingEmit) emitAfterCommit([pendingEmit]);
      flushAfterCommit();
    }
    return result;
  }

  async cancelInvite(
    input: { email: string },
    actor: WorkspaceActor,
  ): Promise<ServiceResult> {
    const membership = await getMembership(this._db, actor.userId, actor.workspaceId);
    if (!membership || membership.role !== 'admin') {
      return { ok: false, error: 'FORBIDDEN_NOT_ADMIN' };
    }

    const normalizedEmail = normalizeEmail(input.email);

    const updated = await this._db
      .update(workspaceInvitations)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(
        and(
          eq(workspaceInvitations.workspaceId, actor.workspaceId),
          eq(workspaceInvitations.status, 'pending'),
          sql`lower(${workspaceInvitations.invitedEmail}) = ${normalizedEmail}`,
        ),
      )
      .returning({ id: workspaceInvitations.id });

    if (updated.length === 0) return { ok: false, error: 'INVITE_NOT_FOUND' };
    return { ok: true };
  }

  async acceptInvite(
    rawToken: string,
    actor: AcceptInviteActor,
  ): Promise<ServiceResult<{ workspaceId: string }>> {
    const { hashToken: hashFn } = await import('@/lib/server/token');
    const tokenHash = hashFn(rawToken);

    const [invitation] = await this._db
      .select()
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.tokenHash, tokenHash))
      .limit(1);

    if (!invitation) return { ok: false, error: 'INVITE_INVALID' };

    if (invitation.status !== 'pending' || invitation.expiresAt < new Date()) {
      return { ok: false, error: 'INVITE_EXPIRED' };
    }

    if (normalizeEmail(invitation.invitedEmail) !== normalizeEmail(actor.userEmail)) {
      return { ok: false, error: 'INVITE_EMAIL_MISMATCH' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this._db.transaction(async (tx: any) => {
      const r = await claimInviteInTx(tx, invitation, actor.userId);
      if (r.ok) {
        // 감사 로그 (C5) — 수락과 같은 트랜잭션에서 커밋.
        await this.auditRepo.insert(
          {
            actorUserId: actor.userId,
            actorWorkspaceId: invitation.workspaceId,
            action: 'workspace.invite_accept',
            entityType: 'workspace',
            entityId: invitation.workspaceId,
          },
          tx,
        );
      }
      return r;
    });
  }

  async changeMemberRole(
    input: { targetUserId: string; role: 'admin' | 'member' },
    actor: WorkspaceActor,
  ): Promise<ServiceResult> {
    const membership = await getMembership(this._db, actor.userId, actor.workspaceId);
    if (!membership || membership.role !== 'admin') {
      return { ok: false, error: 'FORBIDDEN_NOT_ADMIN' };
    }

    const [target] = await this._db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, actor.workspaceId),
          eq(workspaceMembers.userId, input.targetUserId),
        ),
      )
      .limit(1);
    if (!target) return { ok: false, error: 'MEMBER_NOT_FOUND' };

    if (input.role === 'member' && target.role === 'admin') {
      const [{ value: adminCount }] = await this._db
        .select({ value: count() })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, actor.workspaceId),
            eq(workspaceMembers.role, 'admin'),
          ),
        );
      if (adminCount <= 1) return { ok: false, error: 'LAST_ADMIN' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this._db.transaction(async (tx: any) => {
      await tx
        .update(workspaceMembers)
        .set({ role: input.role })
        .where(
          and(
            eq(workspaceMembers.workspaceId, actor.workspaceId),
            eq(workspaceMembers.userId, input.targetUserId),
          ),
        );
      // 감사 로그 (C5) — 역할 변경과 같은 트랜잭션에서 커밋.
      await this.auditRepo.insert(
        {
          actorUserId: actor.userId,
          actorWorkspaceId: actor.workspaceId,
          action: 'workspace.member_role_change',
          entityType: 'workspace',
          entityId: actor.workspaceId,
          metadata: { targetUserId: input.targetUserId, role: input.role },
        },
        tx,
      );
    });

    return { ok: true };
  }

  async removeMember(
    input: { targetUserId: string },
    actor: WorkspaceActor,
  ): Promise<ServiceResult> {
    const membership = await getMembership(this._db, actor.userId, actor.workspaceId);
    if (!membership || membership.role !== 'admin') {
      return { ok: false, error: 'FORBIDDEN_NOT_ADMIN' };
    }

    if (input.targetUserId === actor.userId) {
      return { ok: false, error: 'SELF_REMOVAL' };
    }

    const [target] = await this._db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, actor.workspaceId),
          eq(workspaceMembers.userId, input.targetUserId),
        ),
      )
      .limit(1);
    if (!target) return { ok: false, error: 'MEMBER_NOT_FOUND' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this._db.transaction(async (tx: any) => {
      await tx
        .delete(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, actor.workspaceId),
            eq(workspaceMembers.userId, input.targetUserId),
          ),
        );
      // 감사 로그 (C5) — 제거와 같은 트랜잭션에서 커밋.
      await this.auditRepo.insert(
        {
          actorUserId: actor.userId,
          actorWorkspaceId: actor.workspaceId,
          action: 'workspace.member_remove',
          entityType: 'workspace',
          entityId: actor.workspaceId,
          metadata: { targetUserId: input.targetUserId },
        },
        tx,
      );
    });

    return { ok: true };
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var -- global augmentation requires var
  var __bidit_workspace_service__: WorkspaceService | undefined;
}

export async function getWorkspaceService(): Promise<WorkspaceService> {
  if (!globalThis.__bidit_workspace_service__) {
    const [{ db }, { getOutboxRepo, getAuditLogRepo, getWorkspaceRepo }] = await Promise.all([
      import('@/lib/db/client'),
      import('@/lib/server/repositories/factory'),
    ]);

    const [outboxRepo, auditRepo, workspaceRepo] = await Promise.all([
      getOutboxRepo(),
      getAuditLogRepo(),
      getWorkspaceRepo(),
    ]);

    globalThis.__bidit_workspace_service__ = new WorkspaceService(
      db,
      outboxRepo,
      auditRepo,
      workspaceRepo,
    );
  }
  return globalThis.__bidit_workspace_service__!;
}

export function __resetWorkspaceServiceForTest(): void {
  globalThis.__bidit_workspace_service__ = undefined;
}

export function __setWorkspaceServiceForTest(service: WorkspaceService): void {
  globalThis.__bidit_workspace_service__ = service;
}
