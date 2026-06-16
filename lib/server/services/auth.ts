import { randomInt, randomUUID } from 'node:crypto';

import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { baseUrl } from '@/lib/server/env';
import { isUniqueViolation } from '@/lib/server/repositories/utils';
import { addMinutes, generateToken, hashToken } from '@/lib/server/token';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { renderAuthReset } from '@/lib/server/outbox/templates/authReset';
import { renderAuthEmailChange } from '@/lib/server/outbox/templates/authEmailChange';
import { renderAuthVerify } from '@/lib/server/outbox/templates/authVerify';
import { createWorkspaceInTx } from '@/lib/server/actions/workspace/_createWorkspace';
import { claimInviteInTx } from '@/lib/server/actions/workspace/_claimWorkspaceInvite';
import { purgeUnverifiedSignup } from '@/lib/server/actions/auth/_purgeUnverifiedSignup';
import type {
  AuditLogRepo,
  OutboxRepo,
  PgProfileRepo,
  PhoneOtpRepo,
  UserRepo,
  VerificationTokenRepo,
  WorkspaceRepo,
} from '@/lib/server/repositories/types';
import type { ServiceResult } from './types';

export type AuthActor = { userId: string };

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function bucket15Min(now: Date = new Date()): number {
  return Math.floor(now.getTime() / (15 * 60 * 1000));
}

/** 6자리 숫자 OTP 코드 생성 (000000~999999). */
function generateEmailCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

// 코드 오입력 허용 횟수 (전화 OTP verifyPhoneOtpAction 과 동일).
const MAX_CODE_ATTEMPTS = 5;

export type WorkspaceStub = { id: string; name: string };

export class AuthService {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly _db: any,
    private readonly userRepo: UserRepo,
    private readonly verificationTokenRepo: VerificationTokenRepo,
    private readonly outboxRepo: OutboxRepo,
    private readonly auditRepo: AuditLogRepo,
    private readonly phoneOtpRepo: PhoneOtpRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly pgProfileRepo: PgProfileRepo,
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

    const phoneVerified = await this.phoneOtpRepo.isVerified(input.phoneVerificationId, input.phone);
    if (!phoneVerified) return { ok: false, error: 'PHONE_NOT_VERIFIED' };

    if (!input.wsName) return { ok: false, error: 'MISSING_WS_NAME' };

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

      await this.userRepo.create({ id: userId, email, passwordHash, name: input.name, phone: input.phone }, tx);

      const { workspaceId, applicationId } = await createWorkspaceInTx(tx, {
        userId,
        type: input.wsKind,
        name: input.wsName,
        bizProfile: input.bizProfile,
      });

      if (input.wsKind === 'pg' && input.pgProfile) {
        await this.pgProfileRepo.create(
          { workspaceId, bizNo: input.pgProfile.bizNo, slaDays: input.pgProfile.slaDays },
          tx,
        );
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

    const phoneVerified = await this.phoneOtpRepo.isVerified(input.phoneVerificationId, input.phone);
    if (!phoneVerified) return { ok: false, error: 'PHONE_NOT_VERIFIED' };

    const inviteTokenHash = hashToken(input.wsInviteRawToken);
    const invitation = await this.workspaceRepo.findInvitationClaimByTokenHash(inviteTokenHash);

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

      await this.userRepo.create({ id: userId, email, passwordHash, name: input.name, phone: input.phone }, tx);

      const claim = await claimInviteInTx(tx, invitation, userId);
      if (!claim.ok) {
        throw Object.assign(new Error('CLAIM_FAILED'), { claimError: claim.error });
      }

      await this.userRepo.setLastActiveWorkspace(userId, invitation.workspaceId, tx);

      return { ok: true, workspaceId: claim.workspaceId, email };
    }).catch((err: unknown) => {
      if (err instanceof Error && 'claimError' in err) {
        return { ok: false, error: (err as Error & { claimError: string }).claimError };
      }
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

    const phoneVerified = await this.phoneOtpRepo.isVerified(input.phoneVerificationId, input.phone);
    if (!phoneVerified) return { ok: false, error: 'PHONE_NOT_VERIFIED' };

    const workspace = await this.workspaceRepo.findActiveCanonicalPgById(input.selectedPgWorkspaceId);
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

      await this.userRepo.create({ id: userId, email, passwordHash, name: input.name, phone: input.phone }, tx);

      await this.workspaceRepo.addMember(
        { workspaceId: input.selectedPgWorkspaceId, userId, role: 'member' },
        tx,
      );

      await this.userRepo.setLastActiveWorkspace(userId, input.selectedPgWorkspaceId, tx);

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
    const passwordHash = await this.userRepo.findPasswordHashById(input.userId);

    const valid = passwordHash ? await verifyPassword(input.plainPassword, passwordHash) : false;
    if (!valid) return { ok: false, error: 'INVALID_PASSWORD' };

    const myMemberships = await this.workspaceRepo.listMembershipsWithMembers(input.userId);

    const blockingWorkspaces: WorkspaceStub[] = [];
    const soloWorkspaceIds: string[] = [];

    for (const membership of myMemberships) {
      const allMembers = membership.members;

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
        await this.workspaceRepo.deleteWorkspaces(soloWorkspaceIds, tx);
      }
      await this.workspaceRepo.removeAllMembershipsForUser(input.userId, tx);
      await this.userRepo.softDelete(input.userId, tx);
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
      await this.userRepo.updatePassword(consumed.email, passwordHash, tx);
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
        await this.userRepo.updateEmail(userId, newEmail, tx);
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

  /**
   * signup_email 토큰 발급 + 인증 메일 enqueue (link + 6자리 코드).
   *
   * 가입 게이트(EMAIL_TAKEN) 검사와 무관한 순수 발급 로직 — 두 호출자가 공유한다:
   *   - signupEmailAction: 가입 전(유저 없음) 발급, EMAIL_TAKEN 가드는 호출자가 수행
   *   - sendMyEmailVerificationAction: 가입 후(유저 존재) /pending-approval 자동 발송·재발송
   *
   * `email` 은 normalizeEmail 을 거친 값이어야 한다. TTL 15분.
   *
   * dedupe·토큰 회전 정책 (requestPasswordReset 과 동일한 enqueue-before-rotate):
   *   1. 메일을 **먼저** enqueue 한다.
   *   2. dedupe 충돌로 새 메일이 큐에 안 들어가면(`entry === null`) 이전 미소비
   *      토큰을 그대로 두고 종료한다 — 그래야 직전 메일의 링크·코드가 계속 유효하다
   *      (burn 후 메일도 못 보내면 작동 인증 수단이 0개가 되는 함정 회피).
   *   3. 새 메일이 실제로 enqueue 됐을 때만 이전 토큰을 만료(expiresAt=now, consumedAt 은
   *      NULL 유지 — "consumedAt IS NOT NULL ⟺ 인증 완료" 불변식 보존)하고 새 토큰 저장.
   *
   * mode:
   *   - 'auto'  (default): /pending-approval 마운트 자동 발송. 15분 버킷 dedupeKey 로
   *      리마운트/중복 마운트에 멱등.
   *   - 'resend': 사용자가 누른 명시적 재발송. tokenHash 기반 유니크 dedupeKey 로 같은
   *      버킷에서도 항상 새 메일을 보낸다 (resendWorkspaceInviteAction 과 동일 패턴).
   *      도배 방지는 클라이언트 쿨다운이 담당한다.
   */
  async issueSignupEmail(params: {
    email: string;
    inviteToken?: string;
    workspaceType?: 'buyer' | 'pg';
    mode?: 'auto' | 'resend';
  }): Promise<void> {
    const { email, mode = 'auto' } = params;

    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = addMinutes(new Date(), 15);
    const emailCode = generateEmailCode();
    const emailCodeHash = hashToken(emailCode);

    const verifyUrl = `${baseUrl()}/auth/verify?token=${rawToken}`;
    const html = await renderAuthVerify({ verifyUrl, expiresMinutes: 15, emailCode });

    // 명시적 재발송은 tokenHash 유니크 키 → 같은 15분 버킷에서도 dedup 되지 않고 항상
    // 전송. 마운트 자동 발송은 버킷 키 → 리마운트/중복 마운트에 멱등.
    const dedupeKey =
      mode === 'resend'
        ? `signup-verify-resend:${email}:${tokenHash}`
        : `signup-verify:${email}:${bucket15Min()}`;

    const metaFields = {
      ...(params.inviteToken ? { inviteToken: params.inviteToken } : {}),
      ...(params.workspaceType ? { workspaceType: params.workspaceType } : {}),
      emailCode: emailCodeHash,
    };

    await this._db.transaction(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (tx: any) => {
        const entry = await this.outboxRepo.enqueue(
          {
            event: 'auth.verify',
            to: email,
            subject: '[Supporter B] 이메일 인증을 완료해 주세요',
            html,
            dedupeKey,
          },
          tx,
        );
        // dedupe 충돌 — 새 메일이 안 나갔으므로 이전 토큰을 그대로 두고 종료.
        if (!entry) return;

        await this.verificationTokenRepo.expirePendingByEmail(
          { email, purpose: 'signup_email', now: new Date() },
          tx,
        );
        await this.verificationTokenRepo.save(
          {
            id: randomUUID(),
            purpose: 'signup_email',
            email,
            tokenHash,
            issuedAt: new Date().toISOString(),
            expiresAt,
            meta: metaFields,
          },
          tx,
        );
      },
    );

    flushAfterCommit();
  }

  /**
   * 이메일로 발송된 6자리 OTP 코드로 signup_email 토큰을 인증.
   * 링크 클릭이 어려운 환경(다른 기기, 웹메일)의 폴백 경로.
   * 코드 → sha256 해시 → meta.emailCode 비교 → atomic consumeByEmailCode.
   *
   * `code` 는 raw 6자리 문자열을 받아 서비스 안에서 hashToken 한다 (resetPassword 가
   * raw 토큰을 받는 것과 동일). zod `/^\d{6}$/` 형식 가드 + normalizeEmail 은 액션 책임.
   */
  async verifyEmailCode(input: {
    email: string;
    code: string;
  }): Promise<ServiceResult<{ email: string; inviteToken?: string; workspaceType?: 'buyer' | 'pg' }>> {
    const codeHash = hashToken(input.code);
    const now = new Date();

    // F2 — cap brute-force of the 6-digit code (phone OTP has the same guard).
    const active = await this.verificationTokenRepo.findActiveEmailCodeToken({
      email: input.email,
      purpose: 'signup_email',
      now,
    });
    if (!active) return { ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' };
    if (active.attempts >= MAX_CODE_ATTEMPTS) {
      return { ok: false, error: 'MAX_ATTEMPTS' };
    }
    if (active.emailCodeHash !== codeHash) {
      await this.verificationTokenRepo.bumpEmailCodeAttempts(active.id);
      return { ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' };
    }

    const consumed = await this.verificationTokenRepo.consumeByEmailCode({
      email: input.email,
      purpose: 'signup_email',
      codeHash,
      now,
    });

    if (!consumed) return { ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' };

    // 코드 소비 = 이메일 인증. 이미 생성된 유저의 플래그 전환(없으면 no-op).
    await this.userRepo.markEmailVerified(consumed.email);

    const meta = consumed.meta && typeof consumed.meta === 'object'
      ? (consumed.meta as Record<string, unknown>)
      : {};

    const inviteToken = meta.inviteToken;
    const rawWorkspaceType = meta.workspaceType;

    return {
      ok: true,
      email: consumed.email,
      inviteToken: typeof inviteToken === 'string' ? inviteToken : undefined,
      workspaceType:
        rawWorkspaceType === 'buyer' || rawWorkspaceType === 'pg'
          ? rawWorkspaceType
          : undefined,
    };
  }

  /**
   * signup_email 토큰의 atomic 소비 (링크 클릭 경로).
   *
   * 토큰 소비 = 이메일 인증: 이미 생성된 유저의 emailVerified 플래그를 전환한다(유저가
   * 아직 없으면 no-op). 교차 기기/탭과 무관하게 서버 상태가 진실의 원천.
   *
   * `rawToken` 은 raw 토큰을 받아 서비스 안에서 hashToken 한다 (resetPassword 와 동일).
   * !rawToken / typeof 가드는 액션 책임.
   */
  async verifyEmailToken(
    rawToken: string,
  ): Promise<ServiceResult<{ email: string; inviteToken?: string; workspaceType?: 'buyer' | 'pg' }>> {
    const consumed = await this.verificationTokenRepo.consume(hashToken(rawToken), new Date());
    if (!consumed) return { ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' };
    if (consumed.purpose !== 'signup_email') return { ok: false, error: 'WRONG_PURPOSE' };

    await this.userRepo.markEmailVerified(consumed.email);

    const meta = consumed.meta && typeof consumed.meta === 'object'
      ? (consumed.meta as Record<string, unknown>)
      : {};

    const inviteToken = meta.inviteToken;
    const rawWorkspaceType = meta.workspaceType;

    return {
      ok: true,
      email: consumed.email,
      inviteToken: typeof inviteToken === 'string' ? inviteToken : undefined,
      workspaceType:
        rawWorkspaceType === 'buyer' || rawWorkspaceType === 'pg'
          ? rawWorkspaceType
          : undefined,
    };
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
    const {
      getUserRepo,
      getVerificationTokenRepo,
      getOutboxRepo,
      getAuditLogRepo,
      getPhoneOtpRepo,
      getWorkspaceRepo,
      getPgProfileRepo,
    } = await import('@/lib/server/repositories/factory');
    const { actionDb } = await import('@/lib/server/actions/auth/_shared');
    const db = actionDb();
    const userRepo = await getUserRepo();
    const auditRepo = await getAuditLogRepo();
    const verificationTokenRepo = await getVerificationTokenRepo();
    const outboxRepo = await getOutboxRepo();
    const phoneOtpRepo = await getPhoneOtpRepo();
    const workspaceRepo = await getWorkspaceRepo();
    const pgProfileRepo = await getPgProfileRepo();
    globalThis.__bidit_auth_service__ = new AuthService(
      db,
      userRepo,
      verificationTokenRepo,
      outboxRepo,
      auditRepo,
      phoneOtpRepo,
      workspaceRepo,
      pgProfileRepo,
    );
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
