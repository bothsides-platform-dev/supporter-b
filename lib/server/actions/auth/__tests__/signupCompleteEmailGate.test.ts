/**
 * signupCompleteAction — EMAIL_NOT_VERIFIED gate.
 *
 * 이메일 인증을 흐름 맨 끝으로 옮기면서 기존의 암묵적 라우팅 게이트가 사라진다.
 * signupCompleteAction 이 서버에서 직접 "email 에 consumedAt 이 있는
 * signup_email 토큰이 존재하는가" 를 확인해야 한다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { phoneOtps, users } from '@/lib/db/schema';
import { signupEmailAction } from '../signupEmailAction';
import { verifyEmailAction } from '../verifyEmailAction';
import { signupCompleteAction } from '../signupCompleteAction';
import { hashOtpCode } from '../phoneOtpUtils';
import { setupActionEnv, teardownActionEnv } from './_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { eq } from 'drizzle-orm';
import { outboxEntries } from '@/lib/db/schema';

const DEFAULT_PHONE = '01099900001';
const VALID_BIZ_NO = '1248100998'; // 삼성전자

function tokenFromHtml(html: string): string {
  return decodeURIComponent(html.match(/token=([^"]+)"/)?.[1] ?? '');
}

let db: PgliteDB;

async function seedVerifiedOtp(phone = DEFAULT_PHONE) {
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

const BUYER_BIZ = { bizNo: VALID_BIZ_NO, taxType: 'general' as const, status: 'active' as const };

describe('signupCompleteAction — creates unverified user (no email gate)', () => {
  beforeEach(async () => {
    db = await setupActionEnv();
  });
  afterEach(teardownActionEnv);

  it('creates the user with emailVerified=false WITHOUT any prior email verification', async () => {
    const phoneId = await seedVerifiedOtp();

    const r = await signupCompleteAction({
      email: 'fresh@example.com',
      name: '신규',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: phoneId,
      wsKind: 'buyer',
      wsName: '(주)신규',
      bizProfile: BUYER_BIZ,
    });

    expect(r.ok).toBe(true);
    const [row] = await db
      .select({ emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.email, 'fresh@example.com'))
      .limit(1);
    expect(row.emailVerified).toBe(false);
  });

  it('re-registration: an unverified existing email is overwritten and succeeds', async () => {
    const first = await signupCompleteAction({
      email: 'redo@example.com',
      name: '첫번째',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: await seedVerifiedOtp(),
      wsKind: 'buyer',
      wsName: '(주)첫',
      bizProfile: BUYER_BIZ,
    });
    expect(first.ok).toBe(true);

    const second = await signupCompleteAction({
      email: 'redo@example.com',
      name: '두번째',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: await seedVerifiedOtp(),
      wsKind: 'buyer',
      wsName: '(주)둘',
      bizProfile: BUYER_BIZ,
    });
    expect(second.ok).toBe(true);

    const rows = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.email, 'redo@example.com'));
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('두번째');
  });

  it('re-registration: a VERIFIED existing email returns EMAIL_TAKEN', async () => {
    const first = await signupCompleteAction({
      email: 'taken@example.com',
      name: '주인',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: await seedVerifiedOtp(),
      wsKind: 'buyer',
      wsName: '(주)주인',
      bizProfile: BUYER_BIZ,
    });
    expect(first.ok).toBe(true);
    await db.update(users).set({ emailVerified: true }).where(eq(users.email, 'taken@example.com'));

    const second = await signupCompleteAction({
      email: 'taken@example.com',
      name: '침입',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: await seedVerifiedOtp(),
      wsKind: 'buyer',
      wsName: '(주)침입',
      bizProfile: BUYER_BIZ,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe('EMAIL_TAKEN');
  });
});

describe('signupCompleteAction — pg branch without serviceScope', () => {
  let phoneId: string;

  beforeEach(async () => {
    db = await setupActionEnv();
    phoneId = await seedVerifiedOtp();
    // pg 이메일 인증도 미리 완료
    await signupEmailAction({ email: 'pg-new@toss.im', workspaceType: 'pg' });
    const [row] = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'pg-new@toss.im'))
      .limit(1);
    const rawToken = tokenFromHtml(row.html);
    await verifyEmailAction(rawToken);
  });
  afterEach(teardownActionEnv);

  it('creates PG workspace without serviceScope (paymentMethods/volumeRange 제거)', async () => {
    const r = await signupCompleteAction({
      email: 'pg-new@toss.im',
      name: 'PG 영업',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: phoneId,
      wsKind: 'pg',
      wsName: 'PG 새 사무소',
      pgProfile: {
        bizNo: VALID_BIZ_NO,
        // serviceScope 없음 — 제거된 필드
      },
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.redirectTo).toBe('/inbox');
  });

  it('passing serviceScope is rejected as unknown field (.strict)', async () => {
    const r = await signupCompleteAction({
      email: 'pg-new@toss.im',
      name: 'PG 영업',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: phoneId,
      wsKind: 'pg',
      wsName: 'PG 새 사무소',
      pgProfile: {
        bizNo: VALID_BIZ_NO,
        serviceScope: { paymentMethods: ['카드'], industries: [], volumeRange: '1억 미만', integrationTypes: [] },
      } as never,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });
});
