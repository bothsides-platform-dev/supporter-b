/**
 * signupCompleteAction — EMAIL_NOT_VERIFIED gate.
 *
 * 이메일 인증을 흐름 맨 끝으로 옮기면서 기존의 암묵적 라우팅 게이트가 사라진다.
 * signupCompleteAction 이 서버에서 직접 "email 에 consumedAt 이 있는
 * signup_email 토큰이 존재하는가" 를 확인해야 한다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { phoneOtps } from '@/lib/db/schema';
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

describe('signupCompleteAction — EMAIL_NOT_VERIFIED gate', () => {
  beforeEach(async () => {
    db = await setupActionEnv();
  });
  afterEach(teardownActionEnv);

  it('returns EMAIL_NOT_VERIFIED when no consumed signup_email token exists', async () => {
    const phoneId = await seedVerifiedOtp();
    // signupEmailAction 발급만 하고 verifyEmailAction 호출 안 함 → consumed 없음
    await signupEmailAction({ email: 'unverified@example.com', workspaceType: 'buyer' });

    const r = await signupCompleteAction({
      email: 'unverified@example.com',
      name: '미인증',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: phoneId,
      wsKind: 'buyer',
      wsName: '(주)미인증',
      bizProfile: { bizNo: VALID_BIZ_NO, taxType: 'general', status: 'active' },
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('EMAIL_NOT_VERIFIED');
  });

  it('returns EMAIL_NOT_VERIFIED when email token was never issued', async () => {
    const phoneId = await seedVerifiedOtp();

    const r = await signupCompleteAction({
      email: 'noemail@example.com',
      name: '없음',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: phoneId,
      wsKind: 'buyer',
      wsName: '(주)없음',
      bizProfile: { bizNo: VALID_BIZ_NO, taxType: 'general', status: 'active' },
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('EMAIL_NOT_VERIFIED');
  });

  it('succeeds when a consumed signup_email token exists (link click path)', async () => {
    const phoneId = await seedVerifiedOtp();

    await signupEmailAction({ email: 'verified@example.com', workspaceType: 'buyer' });
    const [row] = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'verified@example.com'))
      .limit(1);
    const rawToken = tokenFromHtml(row.html);
    await verifyEmailAction(rawToken);

    const r = await signupCompleteAction({
      email: 'verified@example.com',
      name: '인증됨',
      password: 'Password123!',
      phone: DEFAULT_PHONE,
      phoneVerificationId: phoneId,
      wsKind: 'buyer',
      wsName: '(주)인증',
      bizProfile: { bizNo: VALID_BIZ_NO, taxType: 'general', status: 'active' },
    });

    expect(r.ok).toBe(true);
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
