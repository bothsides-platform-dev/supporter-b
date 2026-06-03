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
import type { PgliteDB } from '@/lib/db/client-pglite';

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
