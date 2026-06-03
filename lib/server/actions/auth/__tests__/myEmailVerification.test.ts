/**
 * @vitest-environment node
 *
 * 현재-유저용 인증 액션 (가입 후 /pending-approval 에서 사용):
 *   - checkMyEmailVerifiedAction: 세션 유저의 emailVerified 반환 (폴링용)
 *   - sendMyEmailVerificationAction: 세션 유저 email 로 인증 메일 발송
 *     (유저가 이미 존재하므로 EMAIL_TAKEN 가드 없음)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

const sessionRef: { value: unknown | null } = { value: null };
vi.mock('@/auth', () => ({ auth: () => Promise.resolve(sessionRef.value) }));

import { verificationTokens, outboxEntries } from '@/lib/db/schema';
import { setupActionEnv, teardownActionEnv } from './_setup';
import { seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { getUserRepo } from '@/lib/server/repositories/factory';
import { checkMyEmailVerifiedAction } from '../checkMyEmailVerifiedAction';
import { sendMyEmailVerificationAction } from '../sendMyEmailVerificationAction';
import { verifyEmailAction } from '../verifyEmailAction';
import type { PgliteDB } from '@/lib/db/client-pglite';

function tokenFromOutbox(html: string): string {
  return decodeURIComponent(html.match(/token=([^"]+)"/)?.[1] ?? '');
}

let db: PgliteDB;
beforeEach(async () => {
  db = await setupActionEnv();
  sessionRef.value = null;
});
afterEach(teardownActionEnv);

describe('checkMyEmailVerifiedAction', () => {
  it('returns verified=false when unauthenticated', async () => {
    expect(await checkMyEmailVerifiedAction()).toEqual({ verified: false });
  });

  it('reflects the session user emailVerified flag', async () => {
    const u = await seedUser(db, { email: 'me@x.com' });
    sessionRef.value = { user: { id: u.id, email: 'me@x.com' } };
    expect((await checkMyEmailVerifiedAction()).verified).toBe(false);

    await (await getUserRepo()).markEmailVerified('me@x.com');
    expect((await checkMyEmailVerifiedAction()).verified).toBe(true);
  });
});

describe('sendMyEmailVerificationAction', () => {
  it('returns ok=false when unauthenticated', async () => {
    const r = await sendMyEmailVerificationAction();
    expect(r.ok).toBe(false);
  });

  it('issues a signup_email token + outbox mail for the current (existing) user', async () => {
    const u = await seedUser(db, { email: 'send@x.com' });
    sessionRef.value = { user: { id: u.id, email: 'send@x.com' } };

    const r = await sendMyEmailVerificationAction();
    expect(r.ok).toBe(true);

    const toks = await db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.email, 'send@x.com'));
    expect(toks.length).toBe(1);
    expect(toks[0].purpose).toBe('signup_email');

    const mail = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'send@x.com'));
    expect(mail.length).toBe(1);
  });
});

describe('sendMyEmailVerificationAction — 재발송 (resend)', () => {
  it('재발송({resend:true})은 같은 15분 버킷에서도 두 번째 인증 메일을 보낸다', async () => {
    const u = await seedUser(db, { email: 'resend@x.com' });
    sessionRef.value = { user: { id: u.id, email: 'resend@x.com' } };

    await sendMyEmailVerificationAction(); // 마운트 자동 발송 (bucket 키)
    await sendMyEmailVerificationAction({ resend: true }); // 명시적 재발송 (unique 키)

    const mail = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'resend@x.com'));
    expect(mail.length).toBe(2);
  });

  it('같은 버킷의 두 번째 자동 발송이 dedup되면 첫 토큰을 만료시키지 않는다 (원인 B 회귀 가드)', async () => {
    const u = await seedUser(db, { email: 'auto@x.com' });
    sessionRef.value = { user: { id: u.id, email: 'auto@x.com' } };

    await sendMyEmailVerificationAction(); // 첫 자동 발송 → 토큰 A + 메일
    await sendMyEmailVerificationAction(); // 같은 버킷 두 번째 → dedup

    // outbox 는 1개 (멱등 유지)
    const mail = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'auto@x.com'));
    expect(mail.length).toBe(1);

    // verification_tokens 도 1개 — dedup 시 두 번째 save 가 skip 되어야 함
    const toks = await db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.email, 'auto@x.com'));
    expect(toks.length).toBe(1);

    // 첫 메일의 링크 토큰이 여전히 유효 (만료되지 않았다는 증거)
    const rawToken = tokenFromOutbox(mail[0].html);
    const r = await verifyEmailAction(rawToken);
    expect(r.ok).toBe(true);
  });
});
