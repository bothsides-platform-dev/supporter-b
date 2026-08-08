// updateMyPhoneAction — 설정에서 휴대폰을 인증·저장한다.
//
// 이 액션이 존재하는 이유: 서명 본인인증 기본강제(v0.4.46.0)는 양측 담당자에게
// 010 휴대폰을 요구하는데, 가입 외에는 번호를 넣을 경로가 없어 번호 없는 계정이
// 발송에서 막히면 **자력 복구가 불가능**했다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { phoneOtps, users } from '@/lib/db/schema';
import { hashOtpCode } from '@/lib/server/actions/auth/phoneOtpUtils';
import { setupActionEnv, teardownActionEnv } from '@/lib/server/actions/auth/__tests__/_setup';
import { seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import type { PgliteDB } from '@/lib/db/client-pglite';

const session = vi.hoisted(() => ({ current: null as { user: { id: string } } | null }));
vi.mock('@/lib/auth/session', () => ({
  requireSession: () => {
    if (!session.current) throw new Error('no session');
    return Promise.resolve(session.current);
  },
}));

let db: PgliteDB;

/** 인증 완료된 OTP row 를 직접 심는다 — 발급/입력 왕복은 이 액션의 책임이 아니다. */
async function seedVerifiedOtp(phone: string, verified = true): Promise<string> {
  const [row] = await db
    .insert(phoneOtps)
    .values({
      phone,
      codeHash: hashOtpCode('000000'),
      expiresAt: new Date(Date.now() + 5 * 60_000),
      ...(verified ? { verifiedAt: new Date() } : {}),
    })
    .returning();
  return row.id;
}

async function storedPhone(userId: string): Promise<string | null> {
  const [row] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, userId));
  return row?.phone ?? null;
}

describe('updateMyPhoneAction', () => {
  beforeEach(async () => {
    db = await setupActionEnv();
    session.current = null;
  });
  afterEach(() => {
    teardownActionEnv();
    vi.restoreAllMocks();
  });

  it('검증된 번호를 숫자만으로 저장한다', async () => {
    const { updateMyPhoneAction } = await import('../updateMyPhoneAction');
    const user = await seedUser(db, { email: 'a@x.com', name: '이용자' });
    session.current = { user: { id: user.id } };
    const vid = await seedVerifiedOtp('01055556666');

    expect(await updateMyPhoneAction({ phone: '010-5555-6666', phoneVerificationId: vid })).toEqual({
      ok: true,
    });
    // 저장 형태는 normalizePhone 과 같아야 한다 — 발송 경로가 그 형태를 전제로
    // 하이픈을 다시 붙인다(형태가 갈리면 조용히 강제가 풀린다).
    expect(await storedPhone(user.id)).toBe('01055556666');
  });

  it('다른 번호로 발급된 검증 id 는 거부한다 — 남의 인증을 빌려 쓰지 못한다', async () => {
    const { updateMyPhoneAction } = await import('../updateMyPhoneAction');
    const user = await seedUser(db, { email: 'b@x.com', name: '이용자' });
    session.current = { user: { id: user.id } };
    const otherVid = await seedVerifiedOtp('01099998888');

    expect(await updateMyPhoneAction({ phone: '010-5555-6666', phoneVerificationId: otherVid })).toEqual(
      { ok: false, error: 'PHONE_NOT_VERIFIED' },
    );
    expect(await storedPhone(user.id)).toBeNull();
  });

  it('인증이 끝나지 않은 id 는 거부한다', async () => {
    const { updateMyPhoneAction } = await import('../updateMyPhoneAction');
    const user = await seedUser(db, { email: 'c@x.com', name: '이용자' });
    session.current = { user: { id: user.id } };
    const unverified = await seedVerifiedOtp('01055556666', false);

    expect(await updateMyPhoneAction({ phone: '010-5555-6666', phoneVerificationId: unverified })).toEqual(
      { ok: false, error: 'PHONE_NOT_VERIFIED' },
    );
    expect(await storedPhone(user.id)).toBeNull();
  });

  it('간편인증이 쓸 수 없는 번호는 저장하지 않는다 (010 만)', async () => {
    // 저장해 두면 발송에서 PHONE_NOT_MOBILE_010 으로 막혀 같은 데드엔드가 된다 —
    // 발송 경로와 **같은 술어**(resolveSecurityMethod)로 입력에서 끊는다.
    const { updateMyPhoneAction } = await import('../updateMyPhoneAction');
    const user = await seedUser(db, { email: 'd@x.com', name: '이용자' });
    session.current = { user: { id: user.id } };
    const vid = await seedVerifiedOtp('0111234567');

    expect(await updateMyPhoneAction({ phone: '011-123-4567', phoneVerificationId: vid })).toEqual({
      ok: false,
      error: 'PHONE_NOT_MOBILE_010',
    });
    expect(await storedPhone(user.id)).toBeNull();
  });

  it('미로그인이면 DB 를 건드리지 않고 거부한다', async () => {
    const { updateMyPhoneAction } = await import('../updateMyPhoneAction');
    const user = await seedUser(db, { email: 'e@x.com', name: '이용자' });
    const vid = await seedVerifiedOtp('01055556666');
    session.current = null;

    expect(await updateMyPhoneAction({ phone: '010-5555-6666', phoneVerificationId: vid })).toEqual({
      ok: false,
      error: 'UNAUTHENTICATED',
    });
    expect(await storedPhone(user.id)).toBeNull();
  });

  it('입력이 형식에 맞지 않으면 거부한다', async () => {
    const { updateMyPhoneAction } = await import('../updateMyPhoneAction');
    session.current = { user: { id: '00000000-0000-0000-0000-000000000000' } };

    expect(await updateMyPhoneAction({ phone: '010-5555-6666', phoneVerificationId: 'not-a-uuid' })).toEqual(
      { ok: false, error: 'INVALID_INPUT' },
    );
  });
});
