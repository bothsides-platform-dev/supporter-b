/**
 * signupViaWorkspaceInviteAction — 워크스페이스 초대 신규 가입 액션 테스트.
 *
 * 핵심 불변식:
 *   - 초대 유저는 기존 워크스페이스에 member로 합류한다 (새 워크스페이스 생성 안 함)
 *   - 고아 워크스페이스/운영자 심사 대기 row를 만들지 않는다
 *   - phone OTP + 이메일 인증 게이트는 signupCompleteAction과 동일하게 적용
 *   - 초대 토큰 이메일이 가입 이메일과 다르면 INVITE_EMAIL_MISMATCH
 *   - 만료·사용된 토큰은 INVITE_EXPIRED
 *   - 초대 role(member/admin)이 workspace_members에 그대로 반영
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, count, eq } from 'drizzle-orm';

import {
  outboxEntries,
  phoneOtps,
  workspaceInvitations,
  workspaceMembers,
  workspaces,
  users,
} from '@/lib/db/schema';
import { signupEmailAction } from '../signupEmailAction';
import { verifyEmailAction } from '../verifyEmailAction';
import { signupViaWorkspaceInviteAction } from '../signupViaWorkspaceInviteAction';
import { hashOtpCode } from '../phoneOtpUtils';
import { setupActionEnv, teardownActionEnv } from './_setup';
import { seedPgWorkspace, seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { generateToken, hashToken } from '@/lib/server/token';
import type { PgliteDB } from '@/lib/db/client-pglite';

// ─── helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_PHONE = '01011112222';
const TEST_EMAIL = 'newmember@toss.im';
const TEST_PASSWORD = 'Password123!';
const TEST_NAME = '신규 영업담당';

let db: PgliteDB;

async function seedVerifiedOtp(phone = DEFAULT_PHONE): Promise<string> {
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

async function seedVerifiedEmail(email: string): Promise<void> {
  await signupEmailAction({ email, workspaceType: 'pg' });
  const [row] = await db
    .select({ html: outboxEntries.html })
    .from(outboxEntries)
    .where(eq(outboxEntries.toAddr, email.toLowerCase()))
    .limit(1);
  const rawToken = decodeURIComponent(row.html.match(/token=([^"]+)"/)?.[1] ?? '');
  await verifyEmailAction(rawToken);
}

async function seedInvitation(opts: {
  workspaceId: string;
  invitedByUserId: string;
  invitedEmail?: string;
  status?: 'pending' | 'accepted' | 'expired';
  expiresAt?: Date;
  role?: 'admin' | 'member';
}): Promise<{ rawToken: string }> {
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  await db.insert(workspaceInvitations).values({
    workspaceId: opts.workspaceId,
    invitedEmail: opts.invitedEmail ?? TEST_EMAIL,
    invitedByUserId: opts.invitedByUserId,
    role: opts.role ?? 'member',
    tokenHash,
    status: opts.status ?? 'pending',
    expiresAt: opts.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  return { rawToken };
}

// ─── setup / teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
  db = await setupActionEnv();
});
afterEach(teardownActionEnv);

// ─── tests ────────────────────────────────────────────────────────────────────

describe('signupViaWorkspaceInviteAction — success', () => {
  it('초대 워크스페이스에 멤버십 1건만 생성 (새 워크스페이스 없음)', async () => {
    const ws = await seedPgWorkspace(db, 'TossPayments PG');
    const admin = await seedUser(db, { email: 'admin@toss.im' });
    const phoneId = await seedVerifiedOtp();
    await seedVerifiedEmail(TEST_EMAIL);
    const { rawToken } = await seedInvitation({
      workspaceId: ws.id,
      invitedByUserId: admin.id,
      invitedEmail: TEST_EMAIL,
    });

    const r = await signupViaWorkspaceInviteAction({
      email: TEST_EMAIL,
      name: TEST_NAME,
      password: TEST_PASSWORD,
      phone: DEFAULT_PHONE,
      phoneVerificationId: phoneId,
      wsInviteToken: rawToken,
    });

    expect(r.ok).toBe(true);

    // 워크스페이스 수 — 초대 전 1개 그대로
    const [{ value: wsCount }] = await db.select({ value: count() }).from(workspaces);
    expect(wsCount).toBe(1);

    // 새 유저의 멤버십: 초대 워크스페이스에만 존재
    const newUser = await db
      .select({ id: users.id, lastActiveWorkspaceId: users.lastActiveWorkspaceId })
      .from(users)
      .where(eq(users.email, TEST_EMAIL))
      .limit(1);
    expect(newUser).toHaveLength(1);
    const userId = newUser[0].id;

    const memberships = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId));
    expect(memberships).toHaveLength(1);
    expect(memberships[0].workspaceId).toBe(ws.id);
    expect(memberships[0].role).toBe('member');

    // lastActiveWorkspaceId = 초대 워크스페이스
    expect(newUser[0].lastActiveWorkspaceId).toBe(ws.id);
  });

  it('redirectTo는 /home (일반 가입의 /inbox와 다름)', async () => {
    const ws = await seedPgWorkspace(db, 'KakaoPay PG');
    const admin = await seedUser(db, { email: 'kakao-admin@kakaobank.com' });
    const phoneId = await seedVerifiedOtp();
    await seedVerifiedEmail(TEST_EMAIL);
    const { rawToken } = await seedInvitation({ workspaceId: ws.id, invitedByUserId: admin.id });

    const r = await signupViaWorkspaceInviteAction({
      email: TEST_EMAIL,
      name: TEST_NAME,
      password: TEST_PASSWORD,
      phone: DEFAULT_PHONE,
      phoneVerificationId: phoneId,
      wsInviteToken: rawToken,
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.redirectTo).toBe('/home');
  });

  it('초대 상태가 accepted로 변경되고 acceptedByUserId가 설정됨', async () => {
    const ws = await seedPgWorkspace(db, 'NaverPay PG');
    const admin = await seedUser(db, { email: 'admin@naver.com' });
    const phoneId = await seedVerifiedOtp();
    await seedVerifiedEmail(TEST_EMAIL);
    const { rawToken } = await seedInvitation({ workspaceId: ws.id, invitedByUserId: admin.id });

    await signupViaWorkspaceInviteAction({
      email: TEST_EMAIL,
      name: TEST_NAME,
      password: TEST_PASSWORD,
      phone: DEFAULT_PHONE,
      phoneVerificationId: phoneId,
      wsInviteToken: rawToken,
    });

    const [inv] = await db
      .select()
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.workspaceId, ws.id));
    expect(inv.status).toBe('accepted');
    expect(inv.acceptedByUserId).not.toBeNull();
  });

  it('초대 role=admin이면 workspace_members.role도 admin', async () => {
    const ws = await seedPgWorkspace(db, 'NICE Payments');
    const admin = await seedUser(db, { email: 'boss@nice.com' });
    const phoneId = await seedVerifiedOtp();
    await seedVerifiedEmail(TEST_EMAIL);
    const { rawToken } = await seedInvitation({
      workspaceId: ws.id,
      invitedByUserId: admin.id,
      role: 'admin',
    });

    const r = await signupViaWorkspaceInviteAction({
      email: TEST_EMAIL,
      name: TEST_NAME,
      password: TEST_PASSWORD,
      phone: DEFAULT_PHONE,
      phoneVerificationId: phoneId,
      wsInviteToken: rawToken,
    });

    expect(r.ok).toBe(true);
    const newUser = await db.select({ id: users.id }).from(users).where(eq(users.email, TEST_EMAIL)).limit(1);
    const [m] = await db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.userId, newUser[0].id), eq(workspaceMembers.workspaceId, ws.id)));
    expect(m.role).toBe('admin');
  });
});

describe('signupViaWorkspaceInviteAction — 초대 토큰 검증', () => {
  it('INVITE_INVALID — 존재하지 않는 토큰', async () => {
    const phoneId = await seedVerifiedOtp();
    await seedVerifiedEmail(TEST_EMAIL);

    const r = await signupViaWorkspaceInviteAction({
      email: TEST_EMAIL,
      name: TEST_NAME,
      password: TEST_PASSWORD,
      phone: DEFAULT_PHONE,
      phoneVerificationId: phoneId,
      wsInviteToken: generateToken(),
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVITE_INVALID');
  });

  it('INVITE_EXPIRED — 만료된 초대', async () => {
    const ws = await seedPgWorkspace(db, 'PG Co');
    const admin = await seedUser(db, { email: 'admin@pg.co' });
    const phoneId = await seedVerifiedOtp();
    await seedVerifiedEmail(TEST_EMAIL);
    const { rawToken } = await seedInvitation({
      workspaceId: ws.id,
      invitedByUserId: admin.id,
      expiresAt: new Date(Date.now() - 1000), // already expired
    });

    const r = await signupViaWorkspaceInviteAction({
      email: TEST_EMAIL,
      name: TEST_NAME,
      password: TEST_PASSWORD,
      phone: DEFAULT_PHONE,
      phoneVerificationId: phoneId,
      wsInviteToken: rawToken,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVITE_EXPIRED');
  });

  it('INVITE_EXPIRED — 이미 사용된(accepted) 초대', async () => {
    const ws = await seedPgWorkspace(db, 'PG Co');
    const admin = await seedUser(db, { email: 'admin@pg.co' });
    const phoneId = await seedVerifiedOtp();
    await seedVerifiedEmail(TEST_EMAIL);
    const { rawToken } = await seedInvitation({
      workspaceId: ws.id,
      invitedByUserId: admin.id,
      status: 'accepted',
    });

    const r = await signupViaWorkspaceInviteAction({
      email: TEST_EMAIL,
      name: TEST_NAME,
      password: TEST_PASSWORD,
      phone: DEFAULT_PHONE,
      phoneVerificationId: phoneId,
      wsInviteToken: rawToken,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVITE_EXPIRED');
  });

  it('INVITE_EMAIL_MISMATCH — 가입 이메일과 초대 이메일이 다름', async () => {
    const ws = await seedPgWorkspace(db, 'PG Co');
    const admin = await seedUser(db, { email: 'admin@pg.co' });
    const phoneId = await seedVerifiedOtp();
    const otherEmail = 'other@toss.im';
    await seedVerifiedEmail(otherEmail);
    const { rawToken } = await seedInvitation({
      workspaceId: ws.id,
      invitedByUserId: admin.id,
      invitedEmail: TEST_EMAIL, // 초대는 TEST_EMAIL로
    });

    const r = await signupViaWorkspaceInviteAction({
      email: otherEmail, // 가입은 other@toss.im으로
      name: TEST_NAME,
      password: TEST_PASSWORD,
      phone: DEFAULT_PHONE,
      phoneVerificationId: phoneId,
      wsInviteToken: rawToken,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVITE_EMAIL_MISMATCH');
  });
});

describe('signupViaWorkspaceInviteAction — 인증 게이트', () => {
  it('PHONE_NOT_VERIFIED — 전화 인증 없이 호출 시 거부', async () => {
    const ws = await seedPgWorkspace(db, 'PG Co');
    const admin = await seedUser(db, { email: 'admin@pg.co' });
    await seedVerifiedEmail(TEST_EMAIL);
    const { rawToken } = await seedInvitation({ workspaceId: ws.id, invitedByUserId: admin.id });

    // phoneVerificationId가 DB에 없는 UUID
    const r = await signupViaWorkspaceInviteAction({
      email: TEST_EMAIL,
      name: TEST_NAME,
      password: TEST_PASSWORD,
      phone: DEFAULT_PHONE,
      phoneVerificationId: '00000000-0000-0000-0000-000000000000',
      wsInviteToken: rawToken,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('PHONE_NOT_VERIFIED');
  });

  it('EMAIL_NOT_VERIFIED — 이메일 인증 없이 호출 시 거부', async () => {
    const ws = await seedPgWorkspace(db, 'PG Co');
    const admin = await seedUser(db, { email: 'admin@pg.co' });
    const phoneId = await seedVerifiedOtp();
    // signupEmailAction만 호출하고 verifyEmailAction 생략 → consumedAt NULL
    await signupEmailAction({ email: TEST_EMAIL, workspaceType: 'pg' });
    const { rawToken } = await seedInvitation({ workspaceId: ws.id, invitedByUserId: admin.id });

    const r = await signupViaWorkspaceInviteAction({
      email: TEST_EMAIL,
      name: TEST_NAME,
      password: TEST_PASSWORD,
      phone: DEFAULT_PHONE,
      phoneVerificationId: phoneId,
      wsInviteToken: rawToken,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('EMAIL_NOT_VERIFIED');
  });

  it('EMAIL_NOT_VERIFIED — 이메일 토큰 자체가 없으면 거부', async () => {
    const ws = await seedPgWorkspace(db, 'PG Co');
    const admin = await seedUser(db, { email: 'admin@pg.co' });
    const phoneId = await seedVerifiedOtp();
    // signupEmailAction 미호출 — 토큰 없음
    const { rawToken } = await seedInvitation({ workspaceId: ws.id, invitedByUserId: admin.id });

    const r = await signupViaWorkspaceInviteAction({
      email: TEST_EMAIL,
      name: TEST_NAME,
      password: TEST_PASSWORD,
      phone: DEFAULT_PHONE,
      phoneVerificationId: phoneId,
      wsInviteToken: rawToken,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('EMAIL_NOT_VERIFIED');
  });
});
