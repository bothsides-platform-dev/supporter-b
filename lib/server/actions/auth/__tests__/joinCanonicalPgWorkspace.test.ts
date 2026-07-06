/**
 * joinCanonicalPgWorkspaceAction — canonical PG 워크스페이스 합류 액션 테스트.
 *
 * 핵심 불변식:
 *   - canonical_pg_key가 있는 PG 워크스페이스에 기존 멤버로 합류 (새 워크스페이스 생성 없음)
 *   - 일반(non-canonical) 워크스페이스 id로 호출 시 INVALID_CANONICAL_WORKSPACE 에러
 *   - phone OTP 검증 필수
 *   - emailVerified=false로 생성 (이메일 인증 증거 없음)
 *   - 중복 이메일(미인증) → purge 후 재가입 성공
 *   - 중복 이메일(인증됨) → EMAIL_TAKEN
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: () => Promise.resolve({ get: () => null }) }));

vi.mock('@/lib/server/notifications/admin-signup', () => ({
  notifyAdminNewMembershipAfterCommit: vi.fn(),
}));

vi.mock('@/lib/server/env', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/server/env')>();
  return { ...original, adminBaseUrl: () => 'https://admin.example.com' };
});

import { count, eq } from 'drizzle-orm';
import { phoneOtps, users, workspaceMembers, workspaces } from '@/lib/db/schema';
import { randomUUID } from 'node:crypto';
import { joinCanonicalPgWorkspaceAction } from '../joinCanonicalPgWorkspaceAction';
import { hashOtpCode } from '../phoneOtpUtils';
import { setupActionEnv, teardownActionEnv } from './_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

// ─── helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_PHONE = '01033334444';
const TEST_EMAIL = 'new@tosspayments.com';
const TEST_PASSWORD = 'Password123!';
const TEST_NAME = '토스 영업팀';

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

async function seedCanonicalPgWorkspace(
  name = '토스페이먼츠',
  key = 'tosspayments',
): Promise<{ id: string }> {
  const id = randomUUID();
  await db.insert(workspaces).values({
    id, type: 'pg', name, status: 'active', canonicalPgKey: key,
  });
  return { id };
}

async function seedRegularPgWorkspace(): Promise<{ id: string }> {
  const id = randomUUID();
  await db.insert(workspaces).values({ id, type: 'pg', name: '일반PG사', status: 'active' });
  return { id };
}

// ─── setup / teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
  db = await setupActionEnv();
});
afterEach(teardownActionEnv);

// ─── tests ────────────────────────────────────────────────────────────────────

describe('joinCanonicalPgWorkspaceAction — 성공 케이스', () => {
  it('canonical PG 워크스페이스에 admin으로 합류, 새 워크스페이스 생성 없음', async () => {
    const ws = await seedCanonicalPgWorkspace();
    const phoneId = await seedVerifiedOtp();

    const r = await joinCanonicalPgWorkspaceAction({
      email: TEST_EMAIL,
      name: TEST_NAME,
      password: TEST_PASSWORD,
      phone: DEFAULT_PHONE,
      phoneVerificationId: phoneId,
      selectedPgWorkspaceId: ws.id,
    });

    expect(r.ok).toBe(true);

    // 워크스페이스 수는 1개 그대로 — 새로 생성하지 않음
    const [{ value: wsCount }] = await db.select({ value: count() }).from(workspaces);
    expect(wsCount).toBe(1);

    // 새 유저 생성 확인
    const [newUser] = await db
      .select({ id: users.id, emailVerified: users.emailVerified, lastActiveWorkspaceId: users.lastActiveWorkspaceId })
      .from(users)
      .where(eq(users.email, TEST_EMAIL))
      .limit(1);
    expect(newUser).toBeDefined();
    expect(newUser.emailVerified).toBe(false); // 이메일 인증 증거 없음 → false
    expect(newUser.lastActiveWorkspaceId).toBe(ws.id);

    // 멤버십: canonical 워크스페이스에 admin으로 (승인 게이트는 pending_approval 유지)
    const [membership] = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, newUser.id));
    expect(membership).toBeDefined();
    expect(membership.workspaceId).toBe(ws.id);
    expect(membership.role).toBe('admin');
  });

  it('redirectTo는 /home', async () => {
    const ws = await seedCanonicalPgWorkspace();
    const phoneId = await seedVerifiedOtp();

    const r = await joinCanonicalPgWorkspaceAction({
      email: TEST_EMAIL, name: TEST_NAME, password: TEST_PASSWORD,
      phone: DEFAULT_PHONE, phoneVerificationId: phoneId, selectedPgWorkspaceId: ws.id,
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.redirectTo).toBe('/home');
  });

  it('미인증 계정이지만 canonical ws(active)에 멤버십 있으면 EMAIL_TAKEN — purge는 pending ws만 대상', async () => {
    const ws = await seedCanonicalPgWorkspace();

    // 미인증 기존 계정 생성
    const first = await joinCanonicalPgWorkspaceAction({
      email: TEST_EMAIL, name: '첫 시도', password: TEST_PASSWORD,
      phone: DEFAULT_PHONE, phoneVerificationId: await seedVerifiedOtp(),
      selectedPgWorkspaceId: ws.id,
    });
    expect(first.ok).toBe(true);

    // canonical ws는 status='active' → purgeUnverifiedSignup이 guard에서 return → EMAIL_TAKEN
    const second = await joinCanonicalPgWorkspaceAction({
      email: TEST_EMAIL, name: '재가입 시도', password: 'AnotherPass456!',
      phone: DEFAULT_PHONE, phoneVerificationId: await seedVerifiedOtp(),
      selectedPgWorkspaceId: ws.id,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe('EMAIL_TAKEN');
  });
});

describe('joinCanonicalPgWorkspaceAction — 워크스페이스 검증', () => {
  it('INVALID_CANONICAL_WORKSPACE — canonical_pg_key 없는 일반 워크스페이스', async () => {
    const regularWs = await seedRegularPgWorkspace();
    const phoneId = await seedVerifiedOtp();

    const r = await joinCanonicalPgWorkspaceAction({
      email: TEST_EMAIL, name: TEST_NAME, password: TEST_PASSWORD,
      phone: DEFAULT_PHONE, phoneVerificationId: phoneId,
      selectedPgWorkspaceId: regularWs.id,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_CANONICAL_WORKSPACE');
  });

  it('INVALID_CANONICAL_WORKSPACE — 존재하지 않는 워크스페이스 id', async () => {
    const phoneId = await seedVerifiedOtp();

    const r = await joinCanonicalPgWorkspaceAction({
      email: TEST_EMAIL, name: TEST_NAME, password: TEST_PASSWORD,
      phone: DEFAULT_PHONE, phoneVerificationId: phoneId,
      selectedPgWorkspaceId: '00000000-0000-0000-0000-000000000000',
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_CANONICAL_WORKSPACE');
  });

  it('INVALID_CANONICAL_WORKSPACE — status=suspended인 canonical 워크스페이스', async () => {
    // suspended 워크스페이스는 신규 합류 불가
    const id = randomUUID();
    await db.insert(workspaces).values({
      id, type: 'pg', name: '정지된PG사', status: 'suspended', canonicalPgKey: 'suspended-pg',
    });
    const phoneId = await seedVerifiedOtp();

    const r = await joinCanonicalPgWorkspaceAction({
      email: TEST_EMAIL, name: TEST_NAME, password: TEST_PASSWORD,
      phone: DEFAULT_PHONE, phoneVerificationId: phoneId,
      selectedPgWorkspaceId: id,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_CANONICAL_WORKSPACE');
  });

  it('PHONE_NOT_VERIFIED — 다른 전화번호로 발급된 OTP 사용 시 거부', async () => {
    // OTP는 01011112222 전화번호로 인증됐지만 01033334444로 호출
    const ws = await seedCanonicalPgWorkspace();
    const phoneId = await seedVerifiedOtp('01011112222');

    const r = await joinCanonicalPgWorkspaceAction({
      email: TEST_EMAIL, name: TEST_NAME, password: TEST_PASSWORD,
      phone: DEFAULT_PHONE, // 01033334444 — OTP 전화번호와 다름
      phoneVerificationId: phoneId,
      selectedPgWorkspaceId: ws.id,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('PHONE_NOT_VERIFIED');
  });

  it('미인증 유저가 pending 워크스페이스만 가진 경우 purge 후 canonical 합류 성공', async () => {
    // purgeUnverifiedSignup은 모든 워크스페이스가 pending 상태일 때만 유저를 삭제.
    // canonical 워크스페이스는 active이므로 합류 후에는 purge 대상이 아니지만,
    // 합류 이전의 abandoned signup(미인증+pending ws) 유저는 purge 후 재가입 성공해야 함.
    const canonicalWs = await seedCanonicalPgWorkspace();
    const pendingWsId = randomUUID();

    // 미인증 유저 + pending 워크스페이스 직접 시딩
    const abandonedUserId = randomUUID();
    await db.insert(workspaces).values({ id: pendingWsId, type: 'pg', name: '방치PG', status: 'pending' });
    await db.insert(users).values({
      id: abandonedUserId, email: TEST_EMAIL, passwordHash: 'old-hash', name: '방치',
      avatarColor: 'ink', status: 'active', emailVerified: false,
    });
    await db.insert(workspaceMembers).values({ workspaceId: pendingWsId, userId: abandonedUserId, role: 'admin' });

    const r = await joinCanonicalPgWorkspaceAction({
      email: TEST_EMAIL, name: TEST_NAME, password: TEST_PASSWORD,
      phone: DEFAULT_PHONE, phoneVerificationId: await seedVerifiedOtp(),
      selectedPgWorkspaceId: canonicalWs.id,
    });

    expect(r.ok).toBe(true);
    // 이전 유저 삭제 확인
    const oldUser = await db.select().from(users).where(eq(users.id, abandonedUserId));
    expect(oldUser).toHaveLength(0);
  });
});

describe('joinCanonicalPgWorkspaceAction — 입력 유효성 검사', () => {
  it('WEAK_PASSWORD — 취약한 비밀번호 → WEAK_PASSWORD', async () => {
    const ws = await seedCanonicalPgWorkspace();
    const phoneId = await seedVerifiedOtp();

    const r = await joinCanonicalPgWorkspaceAction({
      email: TEST_EMAIL, name: TEST_NAME, password: '1234',
      phone: DEFAULT_PHONE, phoneVerificationId: phoneId,
      selectedPgWorkspaceId: ws.id,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('WEAK_PASSWORD');
  });

  it('INVALID_INPUT — 이메일 형식 오류', async () => {
    const ws = await seedCanonicalPgWorkspace();
    const phoneId = await seedVerifiedOtp();

    const r = await joinCanonicalPgWorkspaceAction({
      email: 'not-an-email', name: TEST_NAME, password: TEST_PASSWORD,
      phone: DEFAULT_PHONE, phoneVerificationId: phoneId,
      selectedPgWorkspaceId: ws.id,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });

  it('INVALID_INPUT — 정규화 불가 전화번호 형식', async () => {
    const ws = await seedCanonicalPgWorkspace();
    const phoneId = await seedVerifiedOtp();

    const r = await joinCanonicalPgWorkspaceAction({
      email: TEST_EMAIL, name: TEST_NAME, password: TEST_PASSWORD,
      phone: '123', phoneVerificationId: phoneId,
      selectedPgWorkspaceId: ws.id,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });
});

describe('joinCanonicalPgWorkspaceAction — 멤버십 승인 상태', () => {
  it('canonical PG 합류 시 멤버십 approval_status가 pending_approval로 생성된다', async () => {
    const ws = await seedCanonicalPgWorkspace();
    const phoneId = await seedVerifiedOtp();

    const r = await joinCanonicalPgWorkspaceAction({
      email: TEST_EMAIL,
      name: TEST_NAME,
      password: TEST_PASSWORD,
      phone: DEFAULT_PHONE,
      phoneVerificationId: phoneId,
      selectedPgWorkspaceId: ws.id,
    });

    expect(r.ok).toBe(true);

    const [newUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, TEST_EMAIL))
      .limit(1);

    const [membership] = await db
      .select({ approvalStatus: workspaceMembers.approvalStatus })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, newUser.id));

    expect(membership.approvalStatus).toBe('pending_approval');
  });

  it('redirectTo가 /home이다', async () => {
    const ws = await seedCanonicalPgWorkspace();
    const phoneId = await seedVerifiedOtp();

    const r = await joinCanonicalPgWorkspaceAction({
      email: TEST_EMAIL, name: TEST_NAME, password: TEST_PASSWORD,
      phone: DEFAULT_PHONE, phoneVerificationId: phoneId, selectedPgWorkspaceId: ws.id,
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.redirectTo).toBe('/home');
  });
});

describe('joinCanonicalPgWorkspaceAction — 인증 게이트', () => {
  it('PHONE_NOT_VERIFIED — 전화 인증 없이 호출 시 거부', async () => {
    const ws = await seedCanonicalPgWorkspace();

    const r = await joinCanonicalPgWorkspaceAction({
      email: TEST_EMAIL, name: TEST_NAME, password: TEST_PASSWORD,
      phone: DEFAULT_PHONE,
      phoneVerificationId: '00000000-0000-0000-0000-000000000000',
      selectedPgWorkspaceId: ws.id,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('PHONE_NOT_VERIFIED');
  });

  it('EMAIL_TAKEN — 이미 인증된 계정과 이메일 충돌', async () => {
    const ws = await seedCanonicalPgWorkspace();

    // 인증된 기존 계정 생성
    const first = await joinCanonicalPgWorkspaceAction({
      email: TEST_EMAIL, name: '선점', password: TEST_PASSWORD,
      phone: DEFAULT_PHONE, phoneVerificationId: await seedVerifiedOtp(),
      selectedPgWorkspaceId: ws.id,
    });
    expect(first.ok).toBe(true);
    // emailVerified=true로 설정 (인증 완료 시뮬레이션)
    await db.update(users).set({ emailVerified: true }).where(eq(users.email, TEST_EMAIL));

    // 같은 이메일로 재가입 시도
    const second = await joinCanonicalPgWorkspaceAction({
      email: TEST_EMAIL, name: '침입', password: TEST_PASSWORD,
      phone: DEFAULT_PHONE, phoneVerificationId: await seedVerifiedOtp(),
      selectedPgWorkspaceId: ws.id,
    });

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe('EMAIL_TAKEN');
  });
});

describe('joinCanonicalPgWorkspaceAction — 마스터 이메일 차단', () => {
  it('MASTER_EMAIL — 마스터 이메일은 유저/멤버십 생성·admin 알림 없이 차단', async () => {
    const ORIGINAL = process.env.MASTER_ACCOUNT_EMAILS;
    process.env.MASTER_ACCOUNT_EMAILS = 'op@support-b.com';
    try {
      const { notifyAdminNewMembershipAfterCommit } = await import(
        '@/lib/server/notifications/admin-signup'
      );
      vi.mocked(notifyAdminNewMembershipAfterCommit).mockClear();

      const ws = await seedCanonicalPgWorkspace();
      const phoneId = await seedVerifiedOtp();

      const r = await joinCanonicalPgWorkspaceAction({
        email: 'op@support-b.com',
        name: TEST_NAME,
        password: TEST_PASSWORD,
        phone: DEFAULT_PHONE,
        phoneVerificationId: phoneId,
        selectedPgWorkspaceId: ws.id,
      });

      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('MASTER_EMAIL');

      // orphan(유저+pending 멤버십)·admin 심사 알림이 생기면 안 된다.
      const created = await db
        .select()
        .from(users)
        .where(eq(users.email, 'op@support-b.com'));
      expect(created).toHaveLength(0);
      expect(notifyAdminNewMembershipAfterCommit).not.toHaveBeenCalled();
    } finally {
      if (ORIGINAL === undefined) delete process.env.MASTER_ACCOUNT_EMAILS;
      else process.env.MASTER_ACCOUNT_EMAILS = ORIGINAL;
    }
  });
});

describe('joinCanonicalPgWorkspaceAction — signupSource', () => {
  it('signupSource가 전달되면 users.signup_source에 저장된다', async () => {
    const ws = await seedCanonicalPgWorkspace();
    const phoneId = await seedVerifiedOtp();

    const r = await joinCanonicalPgWorkspaceAction({
      email: TEST_EMAIL,
      name: TEST_NAME,
      password: TEST_PASSWORD,
      phone: DEFAULT_PHONE,
      phoneVerificationId: phoneId,
      selectedPgWorkspaceId: ws.id,
      signupSource: { _v: 1, utmSource: 'google' },
    });

    expect(r.ok).toBe(true);
    const [u] = await db
      .select({ signupSource: users.signupSource })
      .from(users)
      .where(eq(users.email, TEST_EMAIL));
    expect(u.signupSource).toEqual({ _v: 1, utmSource: 'google' });
  });
});
