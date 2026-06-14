import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { phoneOtps, users, workspaceInvitations, workspaceMembers, workspaces } from '@/lib/db/schema';
import { baseUrl } from '@/lib/server/env';
import { isUniqueViolation } from '@/lib/server/repositories/utils';
import { addMinutes, generateToken, hashToken } from '@/lib/server/token';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { renderAuthReset } from '@/lib/server/outbox/templates/authReset';
import { renderAuthEmailChange } from '@/lib/server/outbox/templates/authEmailChange';
import { createWorkspaceInTx } from '@/lib/server/actions/workspace/_createWorkspace';
import { claimInviteInTx } from '@/lib/server/actions/workspace/_claimWorkspaceInvite';
import { purgeUnverifiedSignup } from '@/lib/server/actions/auth/_purgeUnverifiedSignup';
import type {
  AuditLogRepo, UserRepo, VerificationTokenRepo, OutboxRepo } from '@/lib/server/repositories/types';
import type { ServiceResult } from './types';

export type AuthActor = { userId: string };

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function bucket15Min(now: Date = new Date()): number {
  return Math.floor(now.getTime() / (15 * 60 * 1000));
}

export type WorkspaceStub = { id: string; name: string };

export class AuthService {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly _db: any,
    private readonly userRepo: UserRepo,
    private readonly verificationTokenRepo: VerificationTokenRepo,
    private readonly outboxRepo: OutboxRepo,
    private readonly auditRepo: AuditLogRepo,
  ) {}

  async completeSignup(input: {
    email: string;
    name: string;
    plainPassword: string;
    phone: string;
    phoneVerificationId: string;
    wsKind: 'buyer' | 'pg';
    wsName: string;
    bizProfile?: { bizNo: string; taxType: 'general' | 'simple' | 'exempt'; status: 'active' | 'suspended' | 'closed'; grade?: 'general' | 'small' | 'sme1' | 'sme2' | 'sme3'; gradeSource?: 'user_confirmed' | 'user_overridden' | 'unset' };
    pgProfile?: { bizNo: string; slaDays?: number };
  }): Promise<ServiceResult<{ workspaceId: string; applicationId: string; email: string }>> {
    const email = normalizeEmail(input.email);

    const [otpRow] = await this._db
      .select()
      .from(phoneOtps)
      .where(
        and(
          eq(phoneOtps.id, input.phoneVerificationId),
          eq(phoneOtps.phone, input.phone),
          isNotNull(phoneOtps.verifiedAt),
        ),
      )
      .limit(1);

    if (!otpRow) return { ok: false, error: 'PHONE_NOT_VERIFIED' };

    const passwordHash = await hashPassword(input.plainPassword);
    const userId = randomUUID();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this._db.transaction(async (tx: any): Promise<ServiceResult<{ workspaceId: string; applicationId: string; email: string }>> => {
      // 선검사: 이미 가입된 이메일이면 INSERT 전에 EMAIL_TAKEN 반환. postgres-js 는
      // tx 안에서 발생한 unique violation 을 콜백 종료 후 재던지므로(try/catch 로 못 막음)
      // 충돌을 일으키기 전에 차단한다. 상세는 purgeUnverifiedSignup 주석 참조.
      if ((await purgeUnverifiedSignup(tx, email)) === 'blocked') {
        return { ok: false, error: 'EMAIL_TAKEN' };
      }

      await tx.insert(users).values({
        id: userId,
        email,
        passwordHash,
        name: input.name,
        phone: input.phone,
        avatarColor: 'ink',
        status: 'active',
        emailVerified: false,
      });

      if (!input.wsName) return { ok: false, error: 'MISSING_WS_NAME' };

      const { workspaceId, applicationId } = await createWorkspaceInTx(tx, {
        userId,
        type: input.wsKind,
        name: input.wsName,
        bizProfile: input.bizProfile,
      });

      if (input.wsKind === 'pg' && input.pgProfile) {
        const { pgProfiles } = await import('@/lib/db/schema');
        await tx.insert(pgProfiles).values({
          workspaceId,
          bizNo: input.pgProfile.bizNo,
          serviceScope: null,
          slaDays: input.pgProfile.slaDays ?? null,
        });
      }

      return { ok: true, workspaceId, applicationId, email };
    }).catch((err: unknown) => {
      // 드문 동시-가입 경쟁: 선검사 통과 후 INSERT 직전 같은 이메일이 들어와 충돌하면
      // postgres-js 가 tx 종료 후 위반을 재던진다 → tx 경계 밖에서 잡아 EMAIL_TAKEN 으로 매핑
      // (confirmEmailChange 와 동일 패턴). 흔한 케이스는 위 선검사가 처리한다.
      if (isUniqueViolation(err)) return { ok: false, error: 'EMAIL_TAKEN' };
      throw err;
    });

    return result;
  }

  async signupViaInvite(input: {
    email: string;
    name: string;
    plainPassword: string;
    phone: string;
    phoneVerificationId: string;
    wsInviteRawToken: string;
  }): Promise<ServiceResult<{ workspaceId: string; email: string }>> {
    const email = normalizeEmail(input.email);

    const [otpRow] = await this._db
      .select()
      .from(phoneOtps)
      .where(
        and(
          eq(phoneOtps.id, input.phoneVerificationId),
          eq(phoneOtps.phone, input.phone),
          isNotNull(phoneOtps.verifiedAt),
        ),
      )
      .limit(1);

    if (!otpRow) return { ok: false, error: 'PHONE_NOT_VERIFIED' };

    const inviteTokenHash = hashToken(input.wsInviteRawToken);
    const [invitation] = await this._db
      .select()
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.tokenHash, inviteTokenHash))
      .limit(1);

    if (!invitation) return { ok: false, error: 'INVITE_INVALID' };
    if (invitation.status !== 'pending' || invitation.expiresAt < new Date()) {
      return { ok: false, error: 'INVITE_EXPIRED' };
    }
    if (normalizeEmail(invitation.invitedEmail) !== email) {
      return { ok: false, error: 'INVITE_EMAIL_MISMATCH' };
    }

    const passwordHash = await hashPassword(input.plainPassword);
    const userId = randomUUID();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this._db.transaction(async (tx: any): Promise<ServiceResult<{ workspaceId: string; email: string }>> => {
      // 선검사: 이미 가입된 이메일이면 INSERT 전에 EMAIL_TAKEN 반환. postgres-js 는
      // tx 안에서 발생한 unique violation 을 콜백 종료 후 재던지므로(try/catch 로 못 막음)
      // 충돌을 일으키기 전에 차단한다. 상세는 purgeUnverifiedSignup 주석 참조.
      if ((await purgeUnverifiedSignup(tx, email)) === 'blocked') {
        return { ok: false, error: 'EMAIL_TAKEN' };
      }

      await tx.insert(users).values({
        id: userId,
        email,
        passwordHash,
        name: input.name,
        phone: input.phone,
        avatarColor: 'ink',
        status: 'active',
        emailVerified: false,
      });

      const claim = await claimInviteInTx(tx, invitation, userId);
      if (!claim.ok) return claim;

      await tx
        .update(users)
        .set({ lastActiveWorkspaceId: invitation.workspaceId })
        .where(eq(users.id, userId));

      return { ok: true, workspaceId: claim.workspaceId, email };
    }).catch((err: unknown) => {
      // 드문 동시-가입 경쟁: 선검사 통과 후 INSERT 직전 같은 이메일이 들어와 충돌하면
      // postgres-js 가 tx 종료 후 위반을 재던진다 → tx 경계 밖에서 잡아 EMAIL_TAKEN 으로 매핑
      // (confirmEmailChange 와 동일 패턴). 흔한 케이스는 위 선검사가 처리한다.
      if (isUniqueViolation(err)) return { ok: false, error: 'EMAIL_TAKEN' };
      throw err;
    });

    return result;
  }

  async joinCanonicalPgWorkspace(input: {
    email: string;
    name: string;
    plainPassword: string;
    phone: string;
    phoneVerificationId: string;
    selectedPgWorkspaceId: string;
  }): Promise<ServiceResult<{ email: string }>> {
    const email = normalizeEmail(input.email);

    const [otpRow] = await this._db
      .select()
      .from(phoneOtps)
      .where(
        and(
          eq(phoneOtps.id, input.phoneVerificationId),
          eq(phoneOtps.phone, input.phone),
          isNotNull(phoneOtps.verifiedAt),
        ),
      )
      .limit(1);

    if (!otpRow) return { ok: false, error: 'PHONE_NOT_VERIFIED' };

    const [workspace] = await this._db
      .select({ id: workspaces.id, canonicalPgKey: workspaces.canonicalPgKey })
      .from(workspaces)
      .where(
        and(
          eq(workspaces.id, input.selectedPgWorkspaceId),
          eq(workspaces.type, 'pg'),
          eq(workspaces.status, 'active'),
          isNotNull(workspaces.canonicalPgKey),
        ),
      )
      .limit(1);

    if (!workspace) return { ok: false, error: 'INVALID_CANONICAL_WORKSPACE' };

    const passwordHash = await hashPassword(input.plainPassword);
    const userId = randomUUID();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this._db.transaction(async (tx: any): Promise<ServiceResult<{ email: string }>> => {
      // 선검사: 이미 가입된 이메일이면 INSERT 전에 EMAIL_TAKEN 반환. postgres-js 는
      // tx 안에서 발생한 unique violation 을 콜백 종료 후 재던지므로(try/catch 로 못 막음)
      // 충돌을 일으키기 전에 차단한다. 상세는 purgeUnverifiedSignup 주석 참조.
      if ((await purgeUnverifiedSignup(tx, email)) === 'blocked') {
        return { ok: false, error: 'EMAIL_TAKEN' };
      }

      await tx.insert(users).values({
        id: userId,
        email,
        passwordHash,
        name: input.name,
        phone: input.phone,
        avatarColor: 'ink',
        status: 'active',
        emailVerified: false,
      });

      await tx
        .insert(workspaceMembers)
        .values({ workspaceId: input.selectedPgWorkspaceId, userId, role: 'member' })
        .onConflictDoNothing();

      await tx
        .update(users)
        .set({ lastActiveWorkspaceId: input.selectedPgWorkspaceId })
        .where(eq(users.id, userId));

      return { ok: true, email };
    }).catch((err: unknown) => {
      // 드문 동시-가입 경쟁: 선검사 통과 후 INSERT 직전 같은 이메일이 들어와 충돌하면
      // postgres-js 가 tx 종료 후 위반을 재던진다 → tx 경계 밖에서 잡아 EMAIL_TAKEN 으로 매핑
      // (confirmEmailChange 와 동일 패턴). 흔한 케이스는 위 선검사가 처리한다.
      if (isUniqueViolation(err)) return { ok: false, error: 'EMAIL_TAKEN' };
      throw err;
    });

    return result;
  }

  async deleteAccount(input: {
    userId: string;
    plainPassword: string;
  }): Promise<{ ok: true } | { ok: false; error: 'INVALID_PASSWORD' } | { ok: false; error: 'LAST_ADMIN'; blockingWorkspaces: WorkspaceStub[] }> {
    const [user] = await this._db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);

    const valid = user ? await verifyPassword(input.plainPassword, user.passwordHash) : false;
    if (!valid) return { ok: false, error: 'INVALID_PASSWORD' };

    const myMemberships = await this._db
      .select({
        workspaceId: workspaceMembers.workspaceId,
        role: workspaceMembers.role,
        name: workspaces.name,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, input.userId));

    const blockingWorkspaces: WorkspaceStub[] = [];
    const soloWorkspaceIds: string[] = [];

    for (const membership of myMemberships) {
      const allMembers = await this._db
        .select({ userId: workspaceMembers.userId, role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, membership.workspaceId));

      if (allMembers.length === 1) {
        soloWorkspaceIds.push(membership.workspaceId);
      } else if (membership.role === 'admin') {
        const otherAdmins = allMembers.filter(
          (m: { userId: string; role: string }) => m.userId !== input.userId && m.role === 'admin',
        );
        if (otherAdmins.length === 0) {
          blockingWorkspaces.push({ id: membership.workspaceId, name: membership.name });
        }
      }
    }

    if (blockingWorkspaces.length > 0) {
      return { ok: false, error: 'LAST_ADMIN', blockingWorkspaces };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this._db.transaction(async (tx: any) => {
      if (soloWorkspaceIds.length > 0) {
        await tx.delete(workspaces).where(inArray(workspaces.id, soloWorkspaceIds));
      }
      await tx.delete(workspaceMembers).where(eq(workspaceMembers.userId, input.userId));
      await tx
        .update(users)
        .set({
          deletedAt: new Date(),
          lastActiveWorkspaceId: null,
          // Revoke every outstanding JWT for the deleted account.
          sessionVersion: sql`${users.sessionVersion} + 1`,
        })
        .where(eq(users.id, input.userId));
      // 감사 로그 (C5) — 워크스페이스 무관 인증 이벤트 (FK 없음 → 행 보존).
      await this.auditRepo.insert(
        { actorUserId: input.userId, actorWorkspaceId: null, action: 'auth.account_delete' },
        tx,
      );
    });

    return { ok: true };
  }

  async requestPasswordReset(input: { email: string }): Promise<{ ok: true }> {
    const user = await this.userRepo.findByEmail(input.email);
    if (!user) return { ok: true };

    const rawToken = generateToken();
    const resetUrl = `${baseUrl()}/password/reset?token=${rawToken}`;
    const html = await renderAuthReset({ resetUrl, expiresMinutes: 30 });
    const dedupeKey = `password-reset:${input.email}:${bucket15Min()}`;
    const now = new Date();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this._db.transaction(async (tx: any) => {
      const entry = await this.outboxRepo.enqueue(
        {
          event: 'auth.reset',
          to: input.email,
          subject: '[Supporter B] 비밀번호 재설정 안내',
          html,
          dedupeKey,
        },
        tx,
      );
      if (!entry) return;

      await this.verificationTokenRepo.invalidatePending({ email: input.email, purpose: 'password_reset', now }, tx);
      await this.verificationTokenRepo.save(
        {
          id: randomUUID(),
          purpose: 'password_reset',
          email: input.email,
          tokenHash: hashToken(rawToken),
          issuedAt: now.toISOString(),
          expiresAt: addMinutes(now, 30),
        },
        tx,
      );
    });

    flushAfterCommit();

    return { ok: true };
  }

  async resetPassword(input: {
    rawToken: string;
    plainPassword: string;
  }): Promise<ServiceResult<{ email: string }>> {
    const consumed = await this.verificationTokenRepo.consume(hashToken(input.rawToken), new Date());
    if (!consumed) return { ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' };
    if (consumed.purpose !== 'password_reset') return { ok: false, error: 'WRONG_PURPOSE' };

    const passwordHash = await hashPassword(input.plainPassword);
    const resetUser = await this.userRepo.findByEmail(consumed.email);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this._db.transaction(async (tx: any) => {
      await tx
        .update(users)
        // sessionVersion bump revokes sessions issued before the reset — the
        // whole point of resetting a (possibly compromised) password.
        .set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1` })
        .where(eq(users.email, consumed.email));
      if (resetUser) {
        // 감사 로그 (C5) — 워크스페이스 무관 인증 이벤트.
        await this.auditRepo.insert(
          { actorUserId: resetUser.id, actorWorkspaceId: null, action: 'auth.password_reset' },
          tx,
        );
      }
    });

    return { ok: true, email: consumed.email };
  }

  async requestEmailChange(input: { userId: string; newEmail: string }): Promise<ServiceResult> {
    const rawToken = generateToken();
    const now = new Date();

    await this.verificationTokenRepo.save({
      id: randomUUID(),
      purpose: 'email_change',
      email: input.newEmail,
      tokenHash: hashToken(rawToken),
      issuedAt: now.toISOString(),
      expiresAt: addMinutes(now, 24 * 60),
      meta: { userId: input.userId, newEmail: input.newEmail },
    });

    const confirmUrl = `${baseUrl()}/auth/email-change?token=${rawToken}`;
    const html = await renderAuthEmailChange({ confirmUrl, newEmail: input.newEmail, expiresHours: 24 });

    await this.outboxRepo.enqueue({
      event: 'auth.email-change',
      to: input.newEmail,
      subject: '[Supporter B] 이메일 변경 확인',
      html,
      dedupeKey: `email-change:${input.userId}:${input.newEmail}:${bucket15Min()}`,
    });

    flushAfterCommit();

    return { ok: true };
  }

  async confirmEmailChange(input: { rawToken: string }): Promise<ServiceResult> {
    const consumed = await this.verificationTokenRepo.consume(hashToken(input.rawToken), new Date());
    if (!consumed) return { ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' };
    if (consumed.purpose !== 'email_change') return { ok: false, error: 'WRONG_PURPOSE' };

    const meta = (consumed.meta ?? {}) as Record<string, unknown>;
    const userId = typeof meta.userId === 'string' ? meta.userId : undefined;
    const newEmail = typeof meta.newEmail === 'string' ? meta.newEmail : consumed.email;
    if (!userId || !newEmail) return { ok: false, error: 'TOKEN_META_CORRUPT' };

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this._db.transaction(async (tx: any) => {
        await tx
          .update(users)
          // Email is the login identifier — revoke sessions minted under the old one.
          .set({ email: newEmail, sessionVersion: sql`${users.sessionVersion} + 1` })
          .where(eq(users.id, userId));
        // 감사 로그 (C5) — 워크스페이스 무관 인증 이벤트.
        await this.auditRepo.insert(
          { actorUserId: userId, actorWorkspaceId: null, action: 'auth.email_change', metadata: { newEmail } },
          tx,
        );
      });
    } catch (err) {
      if (isUniqueViolation(err)) return { ok: false, error: 'EMAIL_TAKEN' };
      throw err;
    }

    return { ok: true };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __bidit_auth_service__: AuthService | undefined;
  // eslint-disable-next-line no-var
  var __bidit_auth_service_override__: AuthService | undefined;
}

export async function getAuthService(): Promise<AuthService> {
  if (globalThis.__bidit_auth_service_override__) {
    return globalThis.__bidit_auth_service_override__;
  }
  if (!globalThis.__bidit_auth_service__) {
    const { getUserRepo, getVerificationTokenRepo, getOutboxRepo, getAuditLogRepo } = await import('@/lib/server/repositories/factory');
    const { actionDb } = await import('@/lib/server/actions/auth/_shared');
    const db = actionDb();
    const userRepo = await getUserRepo();
    const auditRepo = await getAuditLogRepo();
    const verificationTokenRepo = await getVerificationTokenRepo();
    const outboxRepo = await getOutboxRepo();
    globalThis.__bidit_auth_service__ = new AuthService(db, userRepo, verificationTokenRepo, outboxRepo, auditRepo);
  }
  return globalThis.__bidit_auth_service__!;
}

export function __resetAuthServiceForTest(): void {
  globalThis.__bidit_auth_service__ = undefined;
  globalThis.__bidit_auth_service_override__ = undefined;
}

export function __setAuthServiceForTest(svc: AuthService): void {
  globalThis.__bidit_auth_service_override__ = svc;
}
