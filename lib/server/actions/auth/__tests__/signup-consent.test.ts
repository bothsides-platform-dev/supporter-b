import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { phoneOtps, users, workspaces, workspaceInvitations } from '@/lib/db/schema';
import { getSignupConsentDocuments } from '@/lib/auth/signup-documents';
import { TEST_SIGNUP_CONSENT, TEST_SIGNUP_DOCUMENTS } from '@/lib/auth/__tests__/signup-consent-fixture';
import { getAuthService } from '@/lib/server/services/auth';
import { getPgProfileRepo, getUserRepo, getWorkspaceRepo } from '@/lib/server/repositories/factory';
import { seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { hashToken } from '@/lib/server/token';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { signupCompleteAction } from '../signupCompleteAction';
import { signupViaWorkspaceInviteAction } from '../signupViaWorkspaceInviteAction';
import { joinCanonicalPgWorkspaceAction } from '../joinCanonicalPgWorkspaceAction';
import { setupActionEnv, teardownActionEnv } from './_setup';

vi.mock('next/headers', () => ({ headers: async () => ({ get: () => null }) }));
vi.mock('@/lib/auth/signup-documents', () => ({ getSignupConsentDocuments: vi.fn() }));
vi.mock('@/lib/server/env', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/server/env')>(), adminBaseUrl: () => 'https://admin.example.com',
}));
vi.mock('@/lib/server/notifications/admin-signup', () => ({
  notifyAdminNewSignupAfterCommit: vi.fn(),
  notifyAdminNewMembershipAfterCommit: vi.fn(),
}));

const base = {
  email: 'consent@example.com', name: '가입자', password: 'Password123!',
  phone: '01012345678', phoneVerificationId: '00000000-0000-4000-8000-000000000001',
};
const routes = [
  { name: 'buyer', run: (consent?: object) => signupCompleteAction({ ...base, wsKind: 'buyer', wsName: '구매사', bizProfile: { bizNo: '1248100998' }, ...consent }) },
  { name: 'pg', run: (consent?: object) => signupCompleteAction({ ...base, wsKind: 'pg', wsName: 'PG사', pgProfile: { bizNo: '1248100998' }, ...consent }) },
  { name: 'invite', run: (consent?: object) => signupViaWorkspaceInviteAction({ ...base, wsInviteToken: 'invitation', ...consent }) },
  { name: 'canonical', run: (consent?: object) => joinCanonicalPgWorkspaceAction({ ...base, selectedPgWorkspaceId: '00000000-0000-4000-8000-000000000002', ...consent }) },
];

let db: PgliteDB;
beforeEach(async () => {
  db = await setupActionEnv({ nts: true });
  vi.mocked(getSignupConsentDocuments).mockReturnValue(TEST_SIGNUP_DOCUMENTS);
});
afterEach(() => { vi.restoreAllMocks(); teardownActionEnv(); });

async function seedSignup() {
  await db.insert(phoneOtps).values({
    id: base.phoneVerificationId, phone: base.phone, codeHash: 'hash',
    verifiedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
  });
  const inviter = await seedUser(db, { email: 'inviter@example.com' });
  const workspaceId = '00000000-0000-4000-8000-000000000002';
  await db.insert(workspaces).values({
    id: workspaceId, name: '기존 PG', type: 'pg', status: 'active', canonicalPgKey: 'test-pg',
  });
  await db.insert(workspaceInvitations).values({
    workspaceId, invitedByUserId: inviter.id, invitedEmail: base.email,
    role: 'member', tokenHash: hashToken('invitation'), expiresAt: new Date(Date.now() + 60_000),
  });
}

async function consentRows() {
  return (await db.execute(sql`SELECT * FROM user_signup_consents`)).rows;
}

describe('가입 동의 서버 경계', () => {
  it.each(routes)('$name 직접 호출에서 동의가 없으면 OTP 조회보다 먼저 거부한다', async ({ run }) => {
    expect(await run()).toEqual({ ok: false, error: 'SIGNUP_CONSENT_REQUIRED' });
    expect(await db.select().from(users).where(eq(users.email, base.email))).toHaveLength(0);
  });

  it.each(routes)('$name 필수 항목 거부와 잘못된 판본을 직접 호출로 우회할 수 없다', async ({ run }) => {
    for (const consent of [
      { ...TEST_SIGNUP_CONSENT, terms: false }, { ...TEST_SIGNUP_CONSENT, privacy: false },
    ]) {
      expect(await run({ consent })).toEqual({ ok: false, error: 'SIGNUP_CONSENT_REQUIRED' });
    }
    for (const key of ['termsVersion', 'privacyVersion', 'marketingVersion']) {
      expect(await run({ consent: { ...TEST_SIGNUP_CONSENT, [key]: 'obsolete' } }))
        .toEqual({ ok: false, error: 'SIGNUP_CONSENT_VERSION_MISMATCH' });
    }
  });

  it.each(routes)('$name 승인된 문서가 없으면 가입을 차단한다', async ({ run }) => {
    vi.mocked(getSignupConsentDocuments).mockReturnValue(null);
    expect(await run({ consent: TEST_SIGNUP_CONSENT })).toEqual({ ok: false, error: 'SIGNUP_DOCUMENTS_UNAVAILABLE' });
  });

  it.each(routes)('$name 성공 시 사용자 단위로 서버의 시각과 문서 판본을 보존한다', async ({ run }) => {
    await seedSignup();
    const started = Date.now();
    expect(await run({ consent: { ...TEST_SIGNUP_CONSENT, marketing: true } })).toMatchObject({ ok: true });
    const [user] = await db.select().from(users).where(eq(users.email, base.email));
    const rows = await consentRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: user.id, terms_accepted: true, privacy_accepted: true, marketing_accepted: true,
      terms_version: 'test-terms-1', privacy_version: 'test-privacy-1', marketing_version: 'test-marketing-1',
      terms_url: 'https://example.com/legal/test-terms-1.html',
      privacy_url: 'https://example.com/legal/test-privacy-1.html',
      marketing_url: 'https://example.com/legal/test-marketing-1.html',
    });
    const recordedAt = new Date(rows[0].recorded_at as string).getTime();
    expect(recordedAt).toBeGreaterThanOrEqual(started);
    expect(recordedAt).toBeLessThanOrEqual(Date.now());
  });

  it('마케팅 생략은 false로 기록하고 기존 사용자에게 기록을 만들지 않는다', async () => {
    await seedSignup();
    const { marketing: _marketing, ...consent } = TEST_SIGNUP_CONSENT;
    expect(await routes[0].run({ consent })).toMatchObject({ ok: true });
    expect(await consentRows()).toMatchObject([{ marketing_accepted: false }]);
    expect(await db.select().from(users)).toHaveLength(2);
    expect(await consentRows()).toHaveLength(1);
  });

  it('서비스 직접 호출도 동의 누락과 오래된 판본을 거부한다', async () => {
    const service = await getAuthService();
    const serviceBase = { ...base, plainPassword: base.password };
    const calls = [
      (consent?: typeof TEST_SIGNUP_CONSENT) => service.completeSignup({ ...serviceBase, wsKind: 'buyer', wsName: '회사', consent }),
      (consent?: typeof TEST_SIGNUP_CONSENT) => service.signupViaInvite({ ...serviceBase, wsInviteRawToken: 'invitation', consent }),
      (consent?: typeof TEST_SIGNUP_CONSENT) => service.joinCanonicalPgWorkspace({ ...serviceBase, selectedPgWorkspaceId: '00000000-0000-4000-8000-000000000002', consent }),
    ];
    for (const call of calls) {
      expect(await call()).toEqual({ ok: false, error: 'SIGNUP_CONSENT_REQUIRED' });
      expect(await call({ ...TEST_SIGNUP_CONSENT, termsVersion: 'obsolete' })).toEqual({ ok: false, error: 'SIGNUP_CONSENT_VERSION_MISMATCH' });
    }
  });

  it.each(routes)('$name 가입 후속 쓰기가 실패하면 사용자와 동의 기록을 함께 롤백한다', async ({ name, run }) => {
    await seedSignup();
    // 실제 사용자/동의 INSERT 이후 쓰기에서 실패시켜 같은 transaction인지 검증한다.
    const repo = name === 'pg' ? await getPgProfileRepo() : await getWorkspaceRepo();
    if (name === 'pg') vi.spyOn(repo as Awaited<ReturnType<typeof getPgProfileRepo>>, 'create').mockRejectedValueOnce(new Error('WRITE_FAILED'));
    else vi.spyOn(repo as Awaited<ReturnType<typeof getWorkspaceRepo>>, 'addMember').mockRejectedValueOnce(new Error('WRITE_FAILED'));
    await expect(run({ consent: TEST_SIGNUP_CONSENT })).rejects.toThrow('WRITE_FAILED');
    expect(await db.select().from(users).where(eq(users.email, base.email))).toHaveLength(0);
    expect(await consentRows()).toHaveLength(0);
  });

  it.each(routes)('$name 동의 증빙 저장이 실패하면 가입 자체를 롤백한다', async ({ run }) => {
    await seedSignup();
    vi.spyOn(await getUserRepo(), 'recordSignupConsent').mockRejectedValueOnce(new Error('CONSENT_WRITE_FAILED'));
    await expect(run({ consent: TEST_SIGNUP_CONSENT })).rejects.toThrow('CONSENT_WRITE_FAILED');
    expect(await db.select().from(users).where(eq(users.email, base.email))).toHaveLength(0);
    expect(await consentRows()).toHaveLength(0);
  });

  it.each(routes)('$name 미인증 계정 재가입이 실패하면 기존 계정과 동의 증빙을 복원한다', async ({ name, run }) => {
    await seedSignup();
    expect(await routes[0].run({ consent: TEST_SIGNUP_CONSENT })).toMatchObject({ ok: true });
    const beforeUsers = await db.select().from(users).where(eq(users.email, base.email));
    const beforeConsent = await consentRows();
    if (name === 'pg') vi.spyOn(await getPgProfileRepo(), 'create').mockRejectedValueOnce(new Error('WRITE_FAILED'));
    else vi.spyOn(await getWorkspaceRepo(), 'addMember').mockRejectedValueOnce(new Error('WRITE_FAILED'));
    await expect(run({ consent: { ...TEST_SIGNUP_CONSENT, marketing: true } })).rejects.toThrow('WRITE_FAILED');
    expect(await db.select().from(users).where(eq(users.email, base.email))).toEqual(beforeUsers);
    expect(await consentRows()).toEqual(beforeConsent);
  });
});
