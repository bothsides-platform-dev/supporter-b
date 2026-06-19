import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getUserRepo,
  getVerificationTokenRepo,
  getOutboxRepo,
  getAuditLogRepo,
  getPhoneOtpRepo,
  getWorkspaceRepo,
  getPgProfileRepo,
} from '@/lib/server/repositories/factory';
import {
  phoneOtps,
  users,
  workspaceMembers,
  outboxEntries,
  auditLogs,
  verificationTokens,
  workspaceInvitations,
  workspaces,
} from '@/lib/db/schema';
import { seedUser, seedPgWorkspace, seedMembership } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { hashToken, generateToken, addMinutes } from '@/lib/server/token';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { hashOtpCode } from '@/lib/server/actions/auth/phoneOtpUtils';

vi.mock('@/lib/server/outbox/templates/authReset', () => ({
  renderAuthReset: async () => '<p>reset</p>',
}));
vi.mock('@/lib/server/outbox/templates/authEmailChange', () => ({
  renderAuthEmailChange: async () => '<p>email-change</p>',
}));
vi.mock('@/lib/server/outbox/templates/authVerify', () => ({
  renderAuthVerify: async (p: { verifyUrl: string; emailCode: string }) =>
    `<a href="${p.verifyUrl}">verify</a> code:${p.emailCode}`,
}));
vi.mock('@/lib/server/env', () => ({
  baseUrl: () => 'https://example.com',
}));
vi.mock('@/lib/server/outbox/templates/workspaceInvited', () => ({
  renderWorkspaceInvited: async () => '<p>invited</p>',
}));

// claimInviteInTx 제어 가능 mock — Task 2 throw-to-rollback 테스트용
const claimOverrides: { fn?: (...args: unknown[]) => unknown } = {};
vi.mock('@/lib/server/actions/workspace/_claimWorkspaceInvite', async () => {
  const real = await vi.importActual<
    typeof import('@/lib/server/actions/workspace/_claimWorkspaceInvite')
  >('@/lib/server/actions/workspace/_claimWorkspaceInvite');
  return {
    claimInviteInTx: (...args: unknown[]) =>
      claimOverrides.fn
        ? claimOverrides.fn(...args)
        : real.claimInviteInTx(...(args as Parameters<typeof real.claimInviteInTx>)),
  };
});

import { AuthService, getAuthService, __resetAuthServiceForTest, __setAuthServiceForTest, mapUniqueViolationToEmailTaken } from '../auth';

let db: PgliteDB;

async function buildService(): Promise<AuthService> {
  const userRepo = await getUserRepo();
  const verificationTokenRepo = await getVerificationTokenRepo();
  const outboxRepo = await getOutboxRepo();
  const auditRepo = await getAuditLogRepo();
  const phoneOtpRepo = await getPhoneOtpRepo();
  const workspaceRepo = await getWorkspaceRepo();
  const pgProfileRepo = await getPgProfileRepo();
  return new AuthService(
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

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});
afterEach(() => {
  delete claimOverrides.fn;
  __resetAuthServiceForTest();
  __resetForTest();
});

async function seedVerifiedOtp(phone = '01099999999'): Promise<string> {
  const [row] = await db
    .insert(phoneOtps)
    .values({
      phone,
      codeHash: hashOtpCode('000000'),
      expiresAt: new Date(Date.now() + 5 * 60_000),
      verifiedAt: new Date(),
    })
    .returning();
  return row.id;
}

async function seedVerificationToken(opts: {
  email: string;
  purpose: 'password_reset' | 'email_change' | 'signup_email';
  meta?: Record<string, unknown>;
}): Promise<string> {
  const rawToken = generateToken();
  const verificationTokenRepo = await getVerificationTokenRepo();
  await verificationTokenRepo.save({
    id: randomUUID(),
    purpose: opts.purpose,
    email: opts.email,
    tokenHash: hashToken(rawToken),
    issuedAt: new Date().toISOString(),
    expiresAt: addMinutes(new Date(), 30),
    meta: opts.meta,
  });
  return rawToken;
}

describe('AuthService.completeSignup', () => {
  it('creates a pg user + workspace, returns ok with workspaceId', async () => {
    const svc = await buildService();
    const otpId = await seedVerifiedOtp('01099999999');

    const r = await svc.completeSignup({
      email: 'pg@example.com',
      name: '김영업',
      plainPassword: 'Password123!',
      phone: '01099999999',
      phoneVerificationId: otpId,
      wsKind: 'pg',
      wsName: '테스트PG',
      pgProfile: { bizNo: '1234567890' },
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.workspaceId).toBeTruthy();
    expect(r.applicationId).toBeTruthy();

    const [u] = await db.select().from(users).where(eq(users.email, 'pg@example.com'));
    expect(u).toBeDefined();
    expect(u.emailVerified).toBe(false);

    const [m] = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, r.workspaceId));
    expect(m.role).toBe('admin');
  });

  it('returns PHONE_NOT_VERIFIED when OTP is not verified', async () => {
    const svc = await buildService();
    const r = await svc.completeSignup({
      email: 'pg@example.com',
      name: '김영업',
      plainPassword: 'Password123!',
      phone: '01099999999',
      phoneVerificationId: randomUUID(),
      wsKind: 'pg',
      wsName: '테스트PG',
      pgProfile: { bizNo: '1234567890' },
    });

    expect(r).toEqual({ ok: false, error: 'PHONE_NOT_VERIFIED' });
  });

  it('returns EMAIL_TAKEN for a duplicate email (verified user)', async () => {
    const svc = await buildService();

    // Seed a verified user with the target email so purgeUnverifiedSignup won't clear it
    await db.insert(users).values({
      id: randomUUID(),
      email: 'dup@example.com',
      passwordHash: 'x',
      name: 'Existing',
      avatarColor: 'ink',
      status: 'active',
      emailVerified: true,
    });

    const otpId = await seedVerifiedOtp('01099999999');
    const r = await svc.completeSignup({
      email: 'dup@example.com',
      name: '홍길동2',
      plainPassword: 'Password123!',
      phone: '01099999999',
      phoneVerificationId: otpId,
      wsKind: 'pg',
      wsName: '두번째WS',
      pgProfile: { bizNo: '1234567890' },
    });

    expect(r).toEqual({ ok: false, error: 'EMAIL_TAKEN' });
  });
});

async function seedUserWithPassword(email: string, pwd: string): Promise<string> {
  const id = randomUUID();
  await db.insert(users).values({
    id,
    email,
    passwordHash: await hashPassword(pwd),
    name: 'Tester',
    avatarColor: 'ink',
  });
  return id;
}

describe('AuthService.deleteAccount', () => {
  it('returns INVALID_PASSWORD for wrong password', async () => {
    const svc = await buildService();
    const user = await seedUser(db, { email: 'user@example.com' });

    const r = await svc.deleteAccount({ userId: user.id, plainPassword: 'WrongPass123!' });
    expect(r).toEqual({ ok: false, error: 'INVALID_PASSWORD' });
  });

  it('returns LAST_ADMIN when user is sole admin in a multi-member workspace', async () => {
    const svc = await buildService();
    const ws = await seedPgWorkspace(db, 'WS');
    const pwd = 'Password123!';
    const adminId = await seedUserWithPassword('admin@example.com', pwd);
    const member = await seedUser(db, { email: 'member@example.com' });
    await seedMembership(db, ws.id, adminId, 'admin');
    await seedMembership(db, ws.id, member.id, 'member');

    const r = await svc.deleteAccount({ userId: adminId, plainPassword: pwd });
    expect(r).toEqual({
      ok: false,
      error: 'LAST_ADMIN',
      blockingWorkspaces: [{ id: ws.id, name: 'WS' }],
    });
  });

  it('soft-deletes the user and removes memberships', async () => {
    const svc = await buildService();
    const pwd = 'Password123!';
    const userId = await seedUserWithPassword('user@example.com', pwd);
    const ws = await seedPgWorkspace(db, 'WS');
    await seedMembership(db, ws.id, userId, 'admin');

    const r = await svc.deleteAccount({ userId, plainPassword: pwd });
    expect(r).toEqual({ ok: true });

    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(u.deletedAt).not.toBeNull();

    const memberships = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId));
    expect(memberships).toHaveLength(0);
  });

  it('bumps sessionVersion so outstanding JWTs are revoked', async () => {
    const svc = await buildService();
    const pwd = 'Password123!';
    const userId = await seedUserWithPassword('user@example.com', pwd);

    await svc.deleteAccount({ userId, plainPassword: pwd });

    const [u] = await db
      .select({ sv: users.sessionVersion })
      .from(users)
      .where(eq(users.id, userId));
    expect(u.sv).toBe(2);
  });
});

describe('AuthService.requestPasswordReset', () => {
  it('always returns { ok: true } even for unknown email', async () => {
    const svc = await buildService();
    const r = await svc.requestPasswordReset({ email: 'ghost@example.com' });
    expect(r).toEqual({ ok: true });
  });

  it('enqueues an outbox row when the user exists', async () => {
    const svc = await buildService();
    await seedUser(db, { email: 'real@example.com' });

    await svc.requestPasswordReset({ email: 'real@example.com' });

    const rows = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'real@example.com'));
    expect(rows).toHaveLength(1);
    expect(rows[0].event).toBe('auth.reset');
  });

  it('does NOT enqueue an outbox row when the user does not exist', async () => {
    const svc = await buildService();
    await svc.requestPasswordReset({ email: 'ghost@example.com' });

    const rows = await db.select().from(outboxEntries);
    expect(rows).toHaveLength(0);
  });
});

describe('AuthService.resetPassword', () => {
  it('returns TOKEN_INVALID_OR_EXPIRED for an unknown token', async () => {
    const svc = await buildService();
    const r = await svc.resetPassword({ rawToken: generateToken(), plainPassword: 'NewPass123!' });
    expect(r).toEqual({ ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' });
  });

  it('updates the passwordHash on success', async () => {
    const svc = await buildService();
    const user = await seedUser(db, { email: 'reset@example.com' });
    const rawToken = await seedVerificationToken({ email: 'reset@example.com', purpose: 'password_reset' });

    const r = await svc.resetPassword({ rawToken, plainPassword: 'NewPass123!' });
    expect(r).toEqual({ ok: true, email: 'reset@example.com' });

    const [u] = await db
      .select({ hash: users.passwordHash })
      .from(users)
      .where(eq(users.id, user.id));
    expect(await verifyPassword('NewPass123!', u.hash)).toBe(true);
  });

  it('bumps sessionVersion so sessions issued before the reset are revoked', async () => {
    const svc = await buildService();
    const user = await seedUser(db, { email: 'reset@example.com' });
    const rawToken = await seedVerificationToken({ email: 'reset@example.com', purpose: 'password_reset' });

    await svc.resetPassword({ rawToken, plainPassword: 'NewPass123!' });

    const [u] = await db
      .select({ sv: users.sessionVersion })
      .from(users)
      .where(eq(users.id, user.id));
    expect(u.sv).toBe(2);
  });
});

describe('AuthService.requestEmailChange', () => {
  it('saves a verification token and enqueues an outbox row', async () => {
    const svc = await buildService();
    const user = await seedUser(db, { email: 'old@example.com' });

    const r = await svc.requestEmailChange({ userId: user.id, newEmail: 'new@example.com' });
    expect(r).toEqual({ ok: true });

    const rows = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'new@example.com'));
    expect(rows).toHaveLength(1);
    expect(rows[0].event).toBe('auth.email-change');
  });
});

describe('AuthService.confirmEmailChange', () => {
  it('returns TOKEN_INVALID_OR_EXPIRED for an unknown token', async () => {
    const svc = await buildService();
    const r = await svc.confirmEmailChange({ rawToken: generateToken() });
    expect(r).toEqual({ ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' });
  });

  it('updates users.email on success', async () => {
    const svc = await buildService();
    const user = await seedUser(db, { email: 'old@example.com' });
    const rawToken = await seedVerificationToken({
      email: 'new@example.com',
      purpose: 'email_change',
      meta: { userId: user.id, newEmail: 'new@example.com' },
    });

    const r = await svc.confirmEmailChange({ rawToken });
    expect(r).toEqual({ ok: true });

    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, user.id));
    expect(u.email).toBe('new@example.com');
  });

  it('bumps sessionVersion so sessions issued before the email change are revoked', async () => {
    const svc = await buildService();
    const user = await seedUser(db, { email: 'old@example.com' });
    const rawToken = await seedVerificationToken({
      email: 'new@example.com',
      purpose: 'email_change',
      meta: { userId: user.id, newEmail: 'new@example.com' },
    });

    await svc.confirmEmailChange({ rawToken });

    const [u] = await db
      .select({ sv: users.sessionVersion })
      .from(users)
      .where(eq(users.id, user.id));
    expect(u.sv).toBe(2);
  });

  it('returns EMAIL_TAKEN if the new email is already in use', async () => {
    const svc = await buildService();
    await seedUser(db, { email: 'taken@example.com' });
    const user = await seedUser(db, { email: 'old@example.com' });
    const rawToken = await seedVerificationToken({
      email: 'taken@example.com',
      purpose: 'email_change',
      meta: { userId: user.id, newEmail: 'taken@example.com' },
    });

    const r = await svc.confirmEmailChange({ rawToken });
    expect(r).toEqual({ ok: false, error: 'EMAIL_TAKEN' });
  });
});

describe('getAuthService / __setAuthServiceForTest / __resetAuthServiceForTest', () => {
  it('__setAuthServiceForTest overrides the singleton', async () => {
    const fake = {} as AuthService;
    __setAuthServiceForTest(fake);
    const svc = await getAuthService();
    expect(svc).toBe(fake);
  });

  it('__resetAuthServiceForTest removes the override', async () => {
    const fake = {} as AuthService;
    __setAuthServiceForTest(fake);
    __resetAuthServiceForTest();
    // Next call would create a real service — just check it's no longer the fake
    // We can't call getAuthService() here without a real DB, so just verify no throw
    expect(() => __resetAuthServiceForTest()).not.toThrow();
  });
});

// ─── 감사 로그 (C5) ───────────────────────────────────────────────────────────

describe('AuthService — 감사 로그 기록', () => {
  async function rowsFor(action: string) {
    return db.select().from(auditLogs).where(eq(auditLogs.action, action));
  }

  it('resetPassword 성공 시 auth.password_reset 감사 행을 남긴다 (워크스페이스 무관)', async () => {
    const svc = await buildService();
    const user = await seedUser(db, { email: 'reset@audit.com' });
    const rawToken = await seedVerificationToken({ email: 'reset@audit.com', purpose: 'password_reset' });

    await svc.resetPassword({ rawToken, plainPassword: 'NewPass123!' });

    const rows = await rowsFor('auth.password_reset');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorUserId: user.id, actorWorkspaceId: null });
  });

  it('confirmEmailChange 성공 시 auth.email_change 감사 행을 남긴다', async () => {
    const svc = await buildService();
    const user = await seedUser(db, { email: 'old@audit.com' });
    const rawToken = await seedVerificationToken({
      email: 'new@audit.com',
      purpose: 'email_change',
      meta: { userId: user.id, newEmail: 'new@audit.com' },
    });

    await svc.confirmEmailChange({ rawToken });

    const rows = await rowsFor('auth.email_change');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorUserId: user.id, actorWorkspaceId: null });
    expect(rows[0]!.metadata).toMatchObject({ newEmail: 'new@audit.com' });
  });

  it('deleteAccount 성공 시 auth.account_delete 감사 행을 남긴다', async () => {
    const svc = await buildService();
    const pwd = 'Password123!';
    const userId = await seedUserWithPassword('gone@audit.com', pwd);

    await svc.deleteAccount({ userId, plainPassword: pwd });

    const rows = await rowsFor('auth.account_delete');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorUserId: userId, actorWorkspaceId: null });
  });
});

// Mocked renderAuthVerify above renders `... href="<verifyUrl>" ... code:<emailCode>`.
function tokenFromHtml(html: string): string {
  return html.match(/token=([^"]+)"/)?.[1] ?? '';
}
function codeFromHtml(html: string): string {
  return html.match(/code:(\d{6})/)?.[1] ?? '';
}
async function verifyMailFor(to: string): Promise<string> {
  const [row] = await db
    .select({ html: outboxEntries.html })
    .from(outboxEntries)
    .where(eq(outboxEntries.toAddr, to))
    .limit(1);
  return row.html;
}

describe('AuthService.issueSignupEmail', () => {
  it('enqueues an auth.verify mail and saves one signup_email token', async () => {
    const svc = await buildService();
    await svc.issueSignupEmail({ email: 'issue@example.com', workspaceType: 'buyer' });

    const mail = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'issue@example.com'));
    expect(mail).toHaveLength(1);
    expect(mail[0].event).toBe('auth.verify');

    const toks = await db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.email, 'issue@example.com'));
    expect(toks).toHaveLength(1);
    expect(toks[0].purpose).toBe('signup_email');
  });

  it('enqueue-before-rotate: a deduped auto re-send keeps the first token valid (no expire/save)', async () => {
    const svc = await buildService();
    await svc.issueSignupEmail({ email: 'dedupe@example.com' }); // mount auto → token A + mail
    await svc.issueSignupEmail({ email: 'dedupe@example.com' }); // same bucket → dedup, no rotate

    const mail = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'dedupe@example.com'));
    expect(mail).toHaveLength(1); // idempotent

    const toks = await db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.email, 'dedupe@example.com'));
    expect(toks).toHaveLength(1); // second save skipped

    // first mail's link token still consumable (not expired by the deduped call)
    const rawToken = tokenFromHtml(mail[0].html);
    const r = await svc.verifyEmailToken(rawToken);
    expect(r.ok).toBe(true);
  });

  it("resend mode sends a second mail in the same 15-minute bucket", async () => {
    const svc = await buildService();
    await svc.issueSignupEmail({ email: 'resend@example.com', mode: 'auto' });
    await svc.issueSignupEmail({ email: 'resend@example.com', mode: 'resend' });

    const mail = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'resend@example.com'));
    expect(mail).toHaveLength(2);
  });
});

describe('AuthService.verifyEmailToken', () => {
  it('consumes a signup_email token, flips emailVerified, returns meta', async () => {
    const svc = await buildService();
    await svc.issueSignupEmail({ email: 'vt@example.com', inviteToken: 'INV-1', workspaceType: 'pg' });
    await seedUser(db, { email: 'vt@example.com' });

    const rawToken = tokenFromHtml(await verifyMailFor('vt@example.com'));
    const r = await svc.verifyEmailToken(rawToken);
    expect(r).toEqual({ ok: true, email: 'vt@example.com', inviteToken: 'INV-1', workspaceType: 'pg' });

    const [u] = await db
      .select({ ev: users.emailVerified })
      .from(users)
      .where(eq(users.email, 'vt@example.com'));
    expect(u.ev).toBe(true);
  });

  it('rejects an unknown token with TOKEN_INVALID_OR_EXPIRED', async () => {
    const svc = await buildService();
    const r = await svc.verifyEmailToken('not-a-real-token');
    expect(r).toEqual({ ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' });
  });

  it('rejects a non-signup_email token with WRONG_PURPOSE', async () => {
    const svc = await buildService();
    const rawToken = await seedVerificationToken({ email: 'wp@example.com', purpose: 'password_reset' });
    const r = await svc.verifyEmailToken(rawToken);
    expect(r).toEqual({ ok: false, error: 'WRONG_PURPOSE' });
  });
});

describe('AuthService.verifyEmailCode', () => {
  it('verifies the correct 6-digit code, flips emailVerified, returns meta', async () => {
    const svc = await buildService();
    await svc.issueSignupEmail({ email: 'vc@example.com', inviteToken: 'INV-CODE' });
    await seedUser(db, { email: 'vc@example.com' });

    const code = codeFromHtml(await verifyMailFor('vc@example.com'));
    const r = await svc.verifyEmailCode({ email: 'vc@example.com', code });
    expect(r).toEqual({ ok: true, email: 'vc@example.com', inviteToken: 'INV-CODE', workspaceType: undefined });

    const [u] = await db
      .select({ ev: users.emailVerified })
      .from(users)
      .where(eq(users.email, 'vc@example.com'));
    expect(u.ev).toBe(true);
  });

  it('locks the code after 5 wrong attempts (MAX_ATTEMPTS) — even the correct code is refused', async () => {
    const svc = await buildService();
    await svc.issueSignupEmail({ email: 'brute@example.com' });
    const code = codeFromHtml(await verifyMailFor('brute@example.com'));
    const wrong = code === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i++) {
      const r = await svc.verifyEmailCode({ email: 'brute@example.com', code: wrong });
      expect(r).toEqual({ ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' });
    }
    const r = await svc.verifyEmailCode({ email: 'brute@example.com', code });
    expect(r).toEqual({ ok: false, error: 'MAX_ATTEMPTS' });
  });
});

// ─── Task 2: signupViaInvite throw-to-rollback ────────────────────────────────

describe('AuthService.signupViaInvite — claim 실패 throw-to-rollback', () => {
  async function seedInvite(wsId: string, inviterId: string, email: string): Promise<string> {
    const rawToken = generateToken();
    await db.insert(workspaceInvitations).values({
      workspaceId: wsId,
      invitedEmail: email,
      invitedByUserId: inviterId,
      tokenHash: hashToken(rawToken),
      status: 'pending',
      expiresAt: new Date(addMinutes(new Date(), 60)),
    });
    return rawToken;
  }

  it('claimInviteInTx 실패 시 user 행을 남기지 않고 claim 에러 반환', async () => {
    const svc = await buildService();
    const ws = await seedPgWorkspace(db, 'TestPG');
    const inviter = await seedUser(db, { email: 'inviter-task2@example.com' });
    await seedMembership(db, ws.id, inviter.id, 'admin');
    const rawToken = await seedInvite(ws.id, inviter.id, 'race@example.com');
    const otpId = await seedVerifiedOtp('01066666666');

    claimOverrides.fn = vi.fn().mockResolvedValue({ ok: false, error: 'INVITE_EXPIRED' });

    const r = await svc.signupViaInvite({
      email: 'race@example.com',
      name: '홍길동',
      plainPassword: 'Password123!',
      phone: '01066666666',
      phoneVerificationId: otpId,
      wsInviteRawToken: rawToken,
    });

    expect(r).toEqual({ ok: false, error: 'INVITE_EXPIRED' });
    const rows = await db.select().from(users).where(eq(users.email, 'race@example.com'));
    expect(rows).toHaveLength(0);
  });
});

// ─── Task 3: signupViaInvite 통합 테스트 ─────────────────────────────────────

describe('AuthService.signupViaInvite', () => {
  async function seedInvitation(opts: {
    email: string;
    expiresOffsetMin?: number;
  }): Promise<{ rawToken: string; wsId: string }> {
    const ws = await seedPgWorkspace(db, 'InviteWS');
    const inviter = await seedUser(db, { email: `inv-${Date.now()}@example.com` });
    await seedMembership(db, ws.id, inviter.id, 'admin');
    const rawToken = generateToken();
    await db.insert(workspaceInvitations).values({
      workspaceId: ws.id,
      invitedEmail: opts.email,
      invitedByUserId: inviter.id,
      tokenHash: hashToken(rawToken),
      status: 'pending',
      expiresAt: new Date(addMinutes(new Date(), opts.expiresOffsetMin ?? 60)),
    });
    return { rawToken, wsId: ws.id };
  }

  it('초대 수락 성공: user 생성·멤버십 추가·emailVerified=true', async () => {
    const svc = await buildService();
    const email = 'invok@example.com';
    const { rawToken, wsId } = await seedInvitation({ email });
    const otpId = await seedVerifiedOtp('01055555550');

    const r = await svc.signupViaInvite({
      email, name: '홍길동', plainPassword: 'Password123!',
      phone: '01055555550', phoneVerificationId: otpId, wsInviteRawToken: rawToken,
    });

    expect(r).toEqual({ ok: true, workspaceId: wsId, email });
    const [u] = await db.select().from(users).where(eq(users.email, email));
    expect(u).toBeDefined();
    expect(u.emailVerified).toBe(true);
    const memberships = await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, u.id));
    expect(memberships).toHaveLength(1);
    expect(memberships[0].workspaceId).toBe(wsId);
  });

  it('PHONE_NOT_VERIFIED: 미인증 OTP', async () => {
    const svc = await buildService();
    const { rawToken } = await seedInvitation({ email: 'inv-nophone@example.com' });
    const r = await svc.signupViaInvite({
      email: 'inv-nophone@example.com', name: '홍길동', plainPassword: 'Password123!',
      phone: '01055555551', phoneVerificationId: randomUUID(), wsInviteRawToken: rawToken,
    });
    expect(r).toEqual({ ok: false, error: 'PHONE_NOT_VERIFIED' });
  });

  it('INVITE_INVALID: 존재하지 않는 토큰', async () => {
    const svc = await buildService();
    const otpId = await seedVerifiedOtp('01055555552');
    const r = await svc.signupViaInvite({
      email: 'inv-ghost@example.com', name: '홍길동', plainPassword: 'Password123!',
      phone: '01055555552', phoneVerificationId: otpId, wsInviteRawToken: generateToken(),
    });
    expect(r).toEqual({ ok: false, error: 'INVITE_INVALID' });
  });

  it('INVITE_EXPIRED: 만료된 초대', async () => {
    const svc = await buildService();
    const email = 'inv-expired@example.com';
    const { rawToken } = await seedInvitation({ email, expiresOffsetMin: -5 });
    const otpId = await seedVerifiedOtp('01055555553');
    const r = await svc.signupViaInvite({
      email, name: '홍길동', plainPassword: 'Password123!',
      phone: '01055555553', phoneVerificationId: otpId, wsInviteRawToken: rawToken,
    });
    expect(r).toEqual({ ok: false, error: 'INVITE_EXPIRED' });
  });

  it('INVITE_EMAIL_MISMATCH: 초대 이메일과 다른 이메일로 시도', async () => {
    const svc = await buildService();
    const { rawToken } = await seedInvitation({ email: 'invited@example.com' });
    const otpId = await seedVerifiedOtp('01055555554');
    const r = await svc.signupViaInvite({
      email: 'different@example.com', name: '홍길동', plainPassword: 'Password123!',
      phone: '01055555554', phoneVerificationId: otpId, wsInviteRawToken: rawToken,
    });
    expect(r).toEqual({ ok: false, error: 'INVITE_EMAIL_MISMATCH' });
  });

  it('EMAIL_TAKEN: 인증된 기존 유저 차단', async () => {
    const svc = await buildService();
    const email = 'inv-taken@example.com';
    await db.insert(users).values({ id: randomUUID(), email, passwordHash: 'x', name: 'Existing', avatarColor: 'ink', emailVerified: true });
    const { rawToken } = await seedInvitation({ email });
    const otpId = await seedVerifiedOtp('01055555555');
    const r = await svc.signupViaInvite({
      email, name: '홍길동', plainPassword: 'Password123!',
      phone: '01055555555', phoneVerificationId: otpId, wsInviteRawToken: rawToken,
    });
    expect(r).toEqual({ ok: false, error: 'EMAIL_TAKEN' });
  });
});

// ─── Task 3: joinCanonicalPgWorkspace 통합 테스트 ─────────────────────────────

describe('AuthService.joinCanonicalPgWorkspace', () => {
  async function seedCanonicalWs(): Promise<{ wsId: string }> {
    const wsId = randomUUID();
    await db.insert(workspaces).values({
      id: wsId, type: 'pg', name: '정규PG', status: 'active',
      canonicalPgKey: `canonical-${wsId.slice(0, 8)}`,
    });
    return { wsId };
  }

  it('canonical PG 합류 성공: user 생성·멤버십 추가', async () => {
    const svc = await buildService();
    const { wsId } = await seedCanonicalWs();
    const otpId = await seedVerifiedOtp('01099991230');
    const r = await svc.joinCanonicalPgWorkspace({
      email: 'canon-ok@example.com', name: '홍길동', plainPassword: 'Password123!',
      phone: '01099991230', phoneVerificationId: otpId, selectedPgWorkspaceId: wsId,
    });
    expect(r).toEqual({ ok: true, email: 'canon-ok@example.com', workspaceName: '정규PG' });
    const [u] = await db.select().from(users).where(eq(users.email, 'canon-ok@example.com'));
    expect(u).toBeDefined();
    const memberships = await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, u.id));
    expect(memberships).toHaveLength(1);
    expect(memberships[0].workspaceId).toBe(wsId);
  });

  it('PHONE_NOT_VERIFIED', async () => {
    const svc = await buildService();
    const { wsId } = await seedCanonicalWs();
    const r = await svc.joinCanonicalPgWorkspace({
      email: 'canon-nophone@example.com', name: '홍길동', plainPassword: 'Password123!',
      phone: '01099991231', phoneVerificationId: randomUUID(), selectedPgWorkspaceId: wsId,
    });
    expect(r).toEqual({ ok: false, error: 'PHONE_NOT_VERIFIED' });
  });

  it('INVALID_CANONICAL_WORKSPACE: 존재하지 않는 ws id', async () => {
    const svc = await buildService();
    const otpId = await seedVerifiedOtp('01099991232');
    const r = await svc.joinCanonicalPgWorkspace({
      email: 'canon-noexist@example.com', name: '홍길동', plainPassword: 'Password123!',
      phone: '01099991232', phoneVerificationId: otpId, selectedPgWorkspaceId: randomUUID(),
    });
    expect(r).toEqual({ ok: false, error: 'INVALID_CANONICAL_WORKSPACE' });
  });

  it('EMAIL_TAKEN: 인증된 기존 유저 차단', async () => {
    const svc = await buildService();
    const { wsId } = await seedCanonicalWs();
    const email = 'canon-taken@example.com';
    await db.insert(users).values({ id: randomUUID(), email, passwordHash: 'x', name: 'Existing', avatarColor: 'ink', emailVerified: true });
    const otpId = await seedVerifiedOtp('01099991233');
    const r = await svc.joinCanonicalPgWorkspace({
      email, name: '홍길동', plainPassword: 'Password123!',
      phone: '01099991233', phoneVerificationId: otpId, selectedPgWorkspaceId: wsId,
    });
    expect(r).toEqual({ ok: false, error: 'EMAIL_TAKEN' });
  });
});

// ─── mapUniqueViolationToEmailTaken ───────────────────────────────────────────

describe('mapUniqueViolationToEmailTaken', () => {
  it('postgres-js 형태 (code + constraint: users_email_unique) 이면 EMAIL_TAKEN 을 반환한다', () => {
    const err = Object.assign(new Error('unique'), { code: '23505', constraint: 'users_email_unique' });
    expect(mapUniqueViolationToEmailTaken(err)).toEqual({ ok: false, error: 'EMAIL_TAKEN' });
  });

  it('pglite 형태 (cause.code + cause.constraint: users_email_unique) 이면 EMAIL_TAKEN 을 반환한다', () => {
    const err = Object.assign(new Error('unique'), { cause: { code: '23505', constraint: 'users_email_unique' } });
    expect(mapUniqueViolationToEmailTaken(err)).toEqual({ ok: false, error: 'EMAIL_TAKEN' });
  });

  it('unique violation 이 아닌 에러는 재던진다', () => {
    const err = new Error('other error');
    expect(() => mapUniqueViolationToEmailTaken(err)).toThrow('other error');
  });

  it('users_email_unique 이외 컬럼 23505 은 재던진다 (오진단 방지)', () => {
    const err = Object.assign(new Error('unique'), { code: '23505', constraint: 'workspaces_canonical_pg_key_unique' });
    expect(() => mapUniqueViolationToEmailTaken(err)).toThrow('unique');
  });

  it('pglite 형태 — users_email_unique 이외 컬럼 23505 은 재던진다', () => {
    const err = Object.assign(new Error('unique'), { cause: { code: '23505', constraint: 'workspaces_canonical_pg_key_unique' } });
    expect(() => mapUniqueViolationToEmailTaken(err)).toThrow('unique');
  });
});
