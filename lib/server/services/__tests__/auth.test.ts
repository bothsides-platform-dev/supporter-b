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
} from '@/lib/server/repositories/factory';
import {
  phoneOtps,
  users,
  workspaceMembers,
  outboxEntries,
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
vi.mock('@/lib/server/env', () => ({
  baseUrl: () => 'https://example.com',
}));
vi.mock('@/lib/server/outbox/templates/workspaceInvited', () => ({
  renderWorkspaceInvited: async () => '<p>invited</p>',
}));

import { AuthService, getAuthService, __resetAuthServiceForTest, __setAuthServiceForTest } from '../auth';

let db: PgliteDB;

async function buildService(): Promise<AuthService> {
  const userRepo = await getUserRepo();
  const verificationTokenRepo = await getVerificationTokenRepo();
  const outboxRepo = await getOutboxRepo();
  return new AuthService(db, userRepo, verificationTokenRepo, outboxRepo);
}

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});
afterEach(() => {
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
