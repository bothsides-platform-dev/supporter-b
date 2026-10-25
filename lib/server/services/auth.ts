import { isSessionVersionStale } from '@/lib/auth/session-version';
import type { VerificationSessionRenewal } from '@/lib/auth/verification-session';
import { getGuestDraftService, type GuestSignupSnapshot, type GuestDraftService } from './guest-drafts';
import { resolveBuyerBusiness } from '@/lib/server/buyer-approval/resolve';
import { defineAsyncSingleton } from '@/lib/server/_singleton';
import { randomInt, randomUUID } from 'node:crypto';

import { normalizeEmail, bucket15Min } from './_service-utils';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { classifyAccountDeletion } from '@/lib/auth/account-deletion';
import type { BlockingWorkspace } from '@/lib/auth/account-deletion';
import { baseUrl } from '@/lib/server/env';
import { addMinutes, generateToken, hashToken } from '@/lib/server/token';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { disconnectCentrifugoUser } from '@/lib/server/realtime/centrifugo';
import { renderAuthReset } from '@/lib/server/outbox/templates/authReset';
import { renderAuthEmailChange } from '@/lib/server/outbox/templates/authEmailChange';
import { renderAuthVerify } from '@/lib/server/outbox/templates/authVerify';
import { getWorkspaceMembership, type WorkspaceMembership } from './workspace-membership';
import { purgeUnverifiedSignup } from './purge-unverified-signup';
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
import type { MerchantTier } from '@/lib/types/bid';
import type { SignupSource } from '@/lib/types/signup-source';
import { validateSignupConsent, type SignupConsentInput } from '@/lib/auth/signup-consent';

/** 6자리 숫자 OTP 코드 생성 (000000~999999). */
function generateEmailCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

// 코드 오입력 허용 횟수 (전화 OTP verifyPhoneOtpAction 과 동일).
const MAX_CODE_ATTEMPTS = 5;

/**
 * `users.email` unique violation(23505)이면 EMAIL_TAKEN 으로 매핑, 아니면 재던진다.
 *
 * 드문 동시-가입 경쟁: 선검사(purgeUnverifiedSignup) 통과 후 INSERT 직전
 * 같은 이메일이 들어와 충돌하면 postgres-js 가 tx 종료 후 위반을 재던진다
 * → tx 경계 밖 `.catch()` 또는 `try/catch` 에서 이 함수로 EMAIL_TAKEN 으로
 * 매핑한다. 흔한 케이스는 선검사에서 처리된다.
 *
 * `users_email_unique` 컨스트레인트에 한정: 다른 테이블/컬럼의 23505
 * (예: workspaces.canonical_pg_key)는 EMAIL_TAKEN 으로 오진단하지 않고 재던진다.
 */
export function mapUniqueViolationToEmailTaken<T extends object = object>(err: unknown): ServiceResult<T> {
  type PgErrShape = { code?: unknown; constraint?: unknown; cause?: { code?: unknown; constraint?: unknown } } | null;
  const e = err as PgErrShape;
  const isEmailUnique =
    (e?.code === '23505' && e?.constraint === 'users_email_unique') ||
    (e?.cause?.code === '23505' && e?.cause?.constraint === 'users_email_unique');
  if (isEmailUnique) return { ok: false, error: 'EMAIL_TAKEN' };
  throw err;
}

// The final proof claim happens after purgeUnverifiedSignup inside the same
// transaction. A normal return would commit that purge when a concurrent
// request already consumed the proof, so this sentinel must escape the
// callback and force a rollback before it is translated to an action result.
class PhoneProofNotConsumableError extends Error {
  constructor() {
    super('PHONE_PROOF_NOT_CONSUMABLE');
  }
}

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
    private readonly workspaceMembership: Pick<WorkspaceMembership, 'create' | 'claimInvitation'>,
    private readonly guestDrafts: Pick<GuestDraftService, 'bindSignup' | 'matchesBoundSignup' | 'retireUser'>,
  ) {}

  async completeSignup(input: {
    email: string;
    name: string;
    plainPassword: string;
    phone: string;
    phoneVerificationId: string;
    guestDraft?: { id: string; secret: string };
    wsKind: 'buyer' | 'pg';
    wsName: string;
    // taxType/status 는 국세청 장애로 검증을 건너뛴 경우 비어 있다 (미검증 프로필).
    // 판정은 액션 레이어의 resolveBizProfileForWrite 가 끝낸 상태로 들어온다.
    bizProfile?: { bizNo: string; taxType?: 'general' | 'simple' | 'exempt'; status?: 'active' | 'suspended' | 'closed'; grade?: MerchantTier; gradeSource?: 'user_confirmed' | 'user_overridden' | 'unset' };
    /** false = 미검증 통과 — createWorkspaceInTx 가 운영자용 risk flag 를 남긴다. */
    bizVerified?: boolean;
    pgProfile?: { bizNo: string; slaDays?: number };
    signupSource?: SignupSource;
    consent?: SignupConsentInput;
  }): Promise<ServiceResult<{ workspaceId: string; applicationId: string; email: string; autoApproved?: boolean; guestDraft?: GuestSignupSnapshot }>> {
    if (input.guestDraft && input.wsKind !== 'buyer') return { ok: false, error: 'INVALID_INPUT' };
    const consent = validateSignupConsent(input.consent);
    if (!consent.ok) return consent;

    const email = normalizeEmail(input.email);

    const phoneVerified = await this.phoneOtpRepo.isConsumable({
      id: input.phoneVerificationId,
      phone: input.phone,
      purpose: 'signup',
      userId: null,
      now: new Date(),
    });
    if (!phoneVerified) return { ok: false, error: 'PHONE_NOT_VERIFIED' };

    if (!input.wsName) return { ok: false, error: 'MISSING_WS_NAME' };

    const { approval: autoApproval, apickLookup } = await resolveBuyerBusiness({
      type: input.wsKind, bizProfile: input.bizProfile, bizVerified: input.bizVerified,
    });

    const passwordHash = await hashPassword(input.plainPassword);
    const userId = randomUUID();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this._db.transaction(async (tx: any): Promise<ServiceResult<{ workspaceId: string; applicationId: string; email: string; autoApproved?: boolean; guestDraft?: GuestSignupSnapshot }>> => {
      // 선검사: 이미 가입된 이메일이면 INSERT 전에 EMAIL_TAKEN 반환. postgres-js 는
      // tx 안에서 발생한 unique violation 을 콜백 종료 후 재던지므로(try/catch 로 못 막음)
      // 충돌을 일으키기 전에 차단한다. 상세는 purgeUnverifiedSignup 주석 참조.
      if ((await purgeUnverifiedSignup(tx, email, this.guestDrafts, input.guestDraft)) === 'blocked') {
        return { ok: false, error: 'EMAIL_TAKEN' };
      }

      const consumedPhoneProof = await this.phoneOtpRepo.consumeVerified(
        {
          id: input.phoneVerificationId,
          phone: input.phone,
          purpose: 'signup',
          userId: null,
          now: new Date(),
        },
        tx,
      );
      if (!consumedPhoneProof) throw new PhoneProofNotConsumableError();

      await this.userRepo.create(
        { id: userId, email, passwordHash, name: input.name, phone: input.phone, signupSource: input.signupSource },
        tx,
      );

      await this.userRepo.recordSignupConsent(userId, consent.consent, tx);

      const { workspaceId, applicationId } = await this.workspaceMembership.create(tx, {
        userId,
        type: input.wsKind,
        name: input.wsName,
        bizProfile: input.bizProfile,
        bizVerified: input.bizVerified,
        autoApproval,
        apickLookup,
      });

      if (input.wsKind === 'pg' && input.pgProfile) {
        await this.pgProfileRepo.create(
          { workspaceId, bizNo: input.pgProfile.bizNo, slaDays: input.pgProfile.slaDays },
          tx,
        );
      }

      const guestDraft = input.guestDraft
        ? await this.guestDrafts.bindSignup(input.guestDraft, { userId, workspaceId, applicationId }, tx)
        : undefined;
      return { ok: true, workspaceId, applicationId, email, autoApproved: !!autoApproval, ...(guestDraft ? { guestDraft } : {}) };
    }).catch((error: unknown) => {
      if (error instanceof PhoneProofNotConsumableError) {
        return { ok: false as const, error: 'PHONE_NOT_VERIFIED' };
      }
      if (error instanceof Error && ['GUEST_DRAFT_UNAVAILABLE', 'GUEST_FILES_NOT_READY'].includes(error.message)) return { ok: false as const, error: error.message };
      return mapUniqueViolationToEmailTaken<{ workspaceId: string; applicationId: string; email: string; autoApproved?: boolean; guestDraft?: GuestSignupSnapshot }>(error);
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
    signupSource?: SignupSource;
    consent?: SignupConsentInput;
  }): Promise<ServiceResult<{ workspaceId: string; email: string }>> {
    const consent = validateSignupConsent(input.consent);
    if (!consent.ok) return consent;

    const email = normalizeEmail(input.email);

    const phoneVerified = await this.phoneOtpRepo.isConsumable({
      id: input.phoneVerificationId,
      phone: input.phone,
      purpose: 'signup',
      userId: null,
      now: new Date(),
    });
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
      if ((await purgeUnverifiedSignup(tx, email, this.guestDrafts)) === 'blocked') {
        return { ok: false, error: 'EMAIL_TAKEN' };
      }

      const consumedPhoneProof = await this.phoneOtpRepo.consumeVerified(
        {
          id: input.phoneVerificationId,
          phone: input.phone,
          purpose: 'signup',
          userId: null,
          now: new Date(),
        },
        tx,
      );
      if (!consumedPhoneProof) throw new PhoneProofNotConsumableError();

      await this.userRepo.create(
        { id: userId, email, passwordHash, name: input.name, phone: input.phone, signupSource: input.signupSource },
        tx,
      );

      await this.userRepo.recordSignupConsent(userId, consent.consent, tx);

      const claim = await this.workspaceMembership.claimInvitation(tx, invitation, userId);
      if (!claim.ok) {
        throw Object.assign(new Error('CLAIM_FAILED'), { claimError: claim.error });
      }

      await this.userRepo.setLastActiveWorkspace(userId, invitation.workspaceId, tx);

      return { ok: true, workspaceId: claim.workspaceId, email };
    }).catch((err: unknown) => {
      if (err instanceof PhoneProofNotConsumableError) {
        return { ok: false, error: 'PHONE_NOT_VERIFIED' };
      }
      if (err instanceof Error && 'claimError' in err) {
        return { ok: false, error: (err as Error & { claimError: string }).claimError };
      }
      return mapUniqueViolationToEmailTaken<{ workspaceId: string; email: string }>(err);
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
    signupSource?: SignupSource;
    consent?: SignupConsentInput;
  }): Promise<ServiceResult<{ email: string; workspaceName: string }>> {
    const consent = validateSignupConsent(input.consent);
    if (!consent.ok) return consent;

    const email = normalizeEmail(input.email);

    const phoneVerified = await this.phoneOtpRepo.isConsumable({
      id: input.phoneVerificationId,
      phone: input.phone,
      purpose: 'signup',
      userId: null,
      now: new Date(),
    });
    if (!phoneVerified) return { ok: false, error: 'PHONE_NOT_VERIFIED' };

    const workspace = await this.workspaceRepo.findActiveCanonicalPgById(input.selectedPgWorkspaceId);
    if (!workspace) return { ok: false, error: 'INVALID_CANONICAL_WORKSPACE' };

    const passwordHash = await hashPassword(input.plainPassword);
    const userId = randomUUID();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this._db.transaction(async (tx: any): Promise<ServiceResult<{ email: string; workspaceName: string }>> => {
      // 선검사: 이미 가입된 이메일이면 INSERT 전에 EMAIL_TAKEN 반환. postgres-js 는
      // tx 안에서 발생한 unique violation 을 콜백 종료 후 재던지므로(try/catch 로 못 막음)
      // 충돌을 일으키기 전에 차단한다. 상세는 purgeUnverifiedSignup 주석 참조.
      if ((await purgeUnverifiedSignup(tx, email, this.guestDrafts)) === 'blocked') {
        return { ok: false, error: 'EMAIL_TAKEN' };
      }

      const consumedPhoneProof = await this.phoneOtpRepo.consumeVerified(
        {
          id: input.phoneVerificationId,
          phone: input.phone,
          purpose: 'signup',
          userId: null,
          now: new Date(),
        },
        tx,
      );
      if (!consumedPhoneProof) throw new PhoneProofNotConsumableError();

      await this.userRepo.create(
        { id: userId, email, passwordHash, name: input.name, phone: input.phone, signupSource: input.signupSource },
        tx,
      );

      await this.userRepo.recordSignupConsent(userId, consent.consent, tx);

      // 기존 PG사(canonical 워크스페이스)에 합류하는 담당자는 admin 으로 들어온다.
      // 단, 승인 게이트(pending_approval)는 유지 — 승인 전까지 /pending-approval 에서 막힌다.
      await this.workspaceRepo.addMember(
        { workspaceId: input.selectedPgWorkspaceId, userId, role: 'admin', approvalStatus: 'pending_approval' },
        tx,
      );

      await this.userRepo.setLastActiveWorkspace(userId, input.selectedPgWorkspaceId, tx);

      return { ok: true, email, workspaceName: workspace.name };
    }).catch((error: unknown) => {
      if (error instanceof PhoneProofNotConsumableError) {
        return { ok: false as const, error: 'PHONE_NOT_VERIFIED' };
      }
      return mapUniqueViolationToEmailTaken<{ email: string; workspaceName: string }>(error);
    });

    return result;
  }

  async updatePhone(input: {
    userId: string;
    phone: string;
    phoneVerificationId: string;
  }): Promise<ServiceResult> {
    return this._db.transaction(async (tx: Parameters<PhoneOtpRepo['consumeVerified']>[1]) => {
      const consumedPhoneProof = await this.phoneOtpRepo.consumeVerified(
        {
          id: input.phoneVerificationId,
          phone: input.phone,
          purpose: 'profile_phone_update',
          userId: input.userId,
          now: new Date(),
        },
        tx,
      );
      if (!consumedPhoneProof) return { ok: false, error: 'PHONE_NOT_VERIFIED' };

      await this.userRepo.updatePhone(input.userId, input.phone, tx);
      return { ok: true };
    });
  }

  async deleteAccount(input: {
    userId: string;
    plainPassword: string;
  }): Promise<{ ok: true } | { ok: false; error: 'INVALID_PASSWORD' } | { ok: false; error: 'LAST_ADMIN'; blockingWorkspaces: BlockingWorkspace[] }> {
    const passwordHash = await this.userRepo.findPasswordHashById(input.userId);

    const valid = passwordHash ? await verifyPassword(input.plainPassword, passwordHash) : false;
    if (!valid) return { ok: false, error: 'INVALID_PASSWORD' };

    const myMemberships = await this.workspaceRepo.listMembershipsWithMembers(input.userId);

    // Shared with the read-only `getDeleteAccountStatus` pre-check — one
    // classifier means the warning the user reads and the rule that blocks them
    // cannot drift apart.
    const { blockingWorkspaces, soloWorkspaces } = classifyAccountDeletion(
      myMemberships,
      input.userId,
    );
    const soloWorkspaceIds = soloWorkspaces.map((w) => w.id);

    if (blockingWorkspaces.length > 0) {
      return { ok: false, error: 'LAST_ADMIN', blockingWorkspaces };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this._db.transaction(async (tx: any) => {
      await this.guestDrafts.retireUser(input.userId, tx);
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

    // Post-commit: force-disconnect live WS sockets now that session_version is bumped.
    void disconnectCentrifugoUser(input.userId);

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
          subject: '[서포트비] 비밀번호 재설정 안내',
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

    // Post-commit: force-disconnect live WS sockets now that session_version is bumped.
    if (resetUser) void disconnectCentrifugoUser(resetUser.id);

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
      subject: '[서포트비] 이메일 변경 확인',
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
      return mapUniqueViolationToEmailTaken(err);
    }

    // Post-commit: force-disconnect live WS sockets now that session_version is bumped.
    void disconnectCentrifugoUser(userId);

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
    /** Present only for post-signup verification; binds activation to this provisional principal. */
    userId?: string;
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
        : `signup-verify:${email}:${params.userId ?? 'pre-signup'}:${bucket15Min()}`;

    const metaFields = {
      ...(params.userId ? { userId: params.userId } : {}),
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
            subject: '[서포트비] 이메일 인증을 완료해 주세요',
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
  async verifyEmailCode(input: { email: string; code: string; actorUserId?: string; actorSessionVersion?: number }): Promise<
    ServiceResult<{
      email: string;
      inviteToken?: string;
      workspaceType?: 'buyer' | 'pg';
      sessionRenewal?: VerificationSessionRenewal;
    }>
  > {
    const codeHash = hashToken(input.code);
    const now = new Date();

    // Principal validation, attempt accounting, exact-row claim, activation and
    // provisional-session revocation are one transaction.
    return this._db.transaction(
      async (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tx: any,
      ): Promise<
        ServiceResult<{
          email: string;
          inviteToken?: string;
          workspaceType?: 'buyer' | 'pg';
          sessionRenewal?: VerificationSessionRenewal;
        }>
      > => {
        // F2 — cap brute-force of the 6-digit code (phone OTP has the same guard).
        const active = await this.verificationTokenRepo.findActiveEmailCodeToken(
          { email: input.email, purpose: 'signup_email', now },
          tx,
        );
        if (!active) return { ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' };
        if (active.userBinding.kind === 'invalid') {
          return { ok: false, error: 'TOKEN_META_CORRUPT' };
        }
        if (active.userBinding.kind === 'bound' && !input.actorUserId) {
          return { ok: false, error: 'UNAUTHENTICATED' };
        }
        if (active.userBinding.kind === 'bound' && active.userBinding.userId !== input.actorUserId) {
          return { ok: false, error: 'TOKEN_PRINCIPAL_MISMATCH' };
        }

        const boundUser =
          active.userBinding.kind === 'bound'
            ? await this.userRepo.findAuthRowByEmailForUpdate(input.email, tx)
            : undefined;
        if (
          active.userBinding.kind === 'bound' &&
          (!boundUser || boundUser.id !== input.actorUserId || boundUser.deletedAt !== null)
        ) {
          return { ok: false, error: 'TOKEN_PRINCIPAL_MISMATCH' };
        }
        if (boundUser && isSessionVersionStale(input.actorSessionVersion, boundUser.sessionVersion)) {
          return { ok: false, error: 'SESSION_REVOKED' };
        }
        if (!(await this.verificationTokenRepo.bumpEmailCodeAttempts(active.id, MAX_CODE_ATTEMPTS, now, tx))) {
          return { ok: false, error: 'MAX_ATTEMPTS' };
        }
        if (active.emailCodeHash !== codeHash) {
          return { ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' };
        }

        const claimed = await this.verificationTokenRepo.consumeByEmailCode(
          {
            tokenId: active.id,
            email: input.email,
            purpose: 'signup_email',
            codeHash,
            now,
          },
          tx,
        );
        if (!claimed) return { ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' };

        // Unbound tokens are the legacy pre-signup proof flow. They may be
        // consumed, but they must never activate a user row created later.
        if (active.userBinding.kind === 'bound' && boundUser && !boundUser.emailVerified) {
          await this.userRepo.markEmailVerifiedById(boundUser.id, tx);
          await this.userRepo.bumpSessionVersion(boundUser.id, tx);
        }

        const meta = claimed.meta && typeof claimed.meta === 'object' ? (claimed.meta as Record<string, unknown>) : {};
        const inviteToken = meta.inviteToken;
        const rawWorkspaceType = meta.workspaceType;

        return {
          ok: true,
          email: claimed.email,
          ...(boundUser && !boundUser.emailVerified ? { sessionRenewal: { userId: boundUser.id, fromVersion: boundUser.sessionVersion, toVersion: boundUser.sessionVersion + 1 } } : {}),
          inviteToken: typeof inviteToken === 'string' ? inviteToken : undefined,
          workspaceType: rawWorkspaceType === 'buyer' || rawWorkspaceType === 'pg' ? rawWorkspaceType : undefined,
        };
      },
    );
  }

  /**
   * signup_email 토큰의 atomic 소비 (링크 클릭 경로).
   *
   * 가입 후 토큰은 발급 당시 userId와 현재 provisional session을 함께 확인한 뒤에만
   * 그 userId의 emailVerified를 전환한다. 성공 시 sessionVersion을 올려 모든 provisional
   * JWT를 폐기한다. 가입 전 unbound 토큰은 소비할 수 있지만 user row를 바꾸지 않는다.
   *
   * `rawToken` 은 raw 토큰을 받아 서비스 안에서 hashToken 한다 (resetPassword 와 동일).
   * !rawToken / typeof 가드는 액션 책임.
   */
  async verifyEmailToken(
    rawToken: string,
    actorUserId?: string,
    actorSessionVersion?: number,
  ): Promise<
    ServiceResult<{
      email: string;
      inviteToken?: string;
      workspaceType?: 'buyer' | 'pg';
      sessionRenewal?: VerificationSessionRenewal;
    }>
  > {
    const tokenHash = hashToken(rawToken);
    const now = new Date();

    // Token consumption, principal validation, activation and session revocation
    // share one transaction. A mismatched or unauthenticated click leaves the
    // single-use token intact so the legitimate provisional user can still use it.
    const consumed = await this._db.transaction(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (tx: any) => {
        const valid = await this.verificationTokenRepo.findValid(tokenHash, now, tx);
        if (!valid) return { ok: false as const, error: 'TOKEN_INVALID_OR_EXPIRED' };
        if (valid.purpose !== 'signup_email') {
          return { ok: false as const, error: 'WRONG_PURPOSE' };
        }

        const meta = valid.meta && typeof valid.meta === 'object' ? (valid.meta as Record<string, unknown>) : {};
        const hasUserBinding = Object.prototype.hasOwnProperty.call(meta, 'userId');
        const boundUserId = typeof meta.userId === 'string' ? meta.userId : undefined;
        if (hasUserBinding && !boundUserId) {
          return { ok: false as const, error: 'TOKEN_META_CORRUPT' };
        }
        if (boundUserId && !actorUserId) {
          return { ok: false as const, error: 'UNAUTHENTICATED' };
        }
        if (boundUserId && boundUserId !== actorUserId) {
          return { ok: false as const, error: 'TOKEN_PRINCIPAL_MISMATCH' };
        }

        const boundUser = boundUserId
          ? await this.userRepo.findAuthRowByEmailForUpdate(valid.email, tx)
          : undefined;
        if (boundUserId && (!boundUser || boundUser.id !== actorUserId || boundUser.deletedAt !== null)) {
          return { ok: false as const, error: 'TOKEN_PRINCIPAL_MISMATCH' };
        }

        if (boundUser && isSessionVersionStale(actorSessionVersion, boundUser.sessionVersion)) {
          return { ok: false as const, error: 'SESSION_REVOKED' };
        }

        const claimed = await this.verificationTokenRepo.consume(tokenHash, now, tx);
        if (!claimed) {
          return { ok: false as const, error: 'TOKEN_INVALID_OR_EXPIRED' };
        }

        // Unbound tokens are pre-signup proofs only. They cannot activate whatever
        // user row happens to own the same email later.
        if (boundUser && !boundUser.emailVerified) {
          await this.userRepo.markEmailVerifiedById(boundUser.id, tx);
          await this.userRepo.bumpSessionVersion(boundUser.id, tx);
        }
        return { ok: true as const, token: claimed,
          sessionRenewal: boundUser && !boundUser.emailVerified
            ? { userId: boundUser.id, fromVersion: boundUser.sessionVersion, toVersion: boundUser.sessionVersion + 1 }
            : undefined,
        };
      },
    );
    if (!consumed.ok) return consumed;

    const meta =
      consumed.token.meta && typeof consumed.token.meta === 'object'
        ? (consumed.token.meta as Record<string, unknown>)
        : {};

    const inviteToken = meta.inviteToken;
    const rawWorkspaceType = meta.workspaceType;

    return {
      ok: true,
      email: consumed.token.email,
      ...(consumed.sessionRenewal ? { sessionRenewal: consumed.sessionRenewal } : {}),
      inviteToken: typeof inviteToken === 'string' ? inviteToken : undefined,
      workspaceType: rawWorkspaceType === 'buyer' || rawWorkspaceType === 'pg' ? rawWorkspaceType : undefined,
    };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const {
  get: getAuthService,
  set: __setAuthServiceForTest,
  reset: __resetAuthServiceForTest,
} = defineAsyncSingleton('auth_service', 'service', async () => {
  const {
    getDb,
    getUserRepo,
    getVerificationTokenRepo,
    getOutboxRepo,
    getAuditLogRepo,
    getPhoneOtpRepo,
    getWorkspaceRepo,
    getPgProfileRepo,
  } = await import('@/lib/server/repositories/factory');
  const [db, userRepo, auditRepo, verificationTokenRepo, outboxRepo, phoneOtpRepo, workspaceRepo, pgProfileRepo] =
    await Promise.all([
      getDb(),
      getUserRepo(),
      getAuditLogRepo(),
      getVerificationTokenRepo(),
      getOutboxRepo(),
      getPhoneOtpRepo(),
      getWorkspaceRepo(),
      getPgProfileRepo(),
    ]);
  return new AuthService(
    db,
    userRepo,
    verificationTokenRepo,
    outboxRepo,
    auditRepo,
    phoneOtpRepo,
    workspaceRepo,
    pgProfileRepo,
    await getWorkspaceMembership(),
    await getGuestDraftService(),
  );
});
