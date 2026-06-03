/**
 * 새 흐름: verifyEmailAction / verifyEmailCodeAction 는 토큰을 소비할 뿐 아니라
 * (이미 생성돼 있는) 유저의 users.emailVerified 플래그를 true 로 전환한다.
 * 인증은 가입 게이트가 아니라 가입-후 서버 플래그 전환이다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { outboxEntries, users } from '@/lib/db/schema';
import { signupEmailAction } from '../signupEmailAction';
import { verifyEmailAction } from '../verifyEmailAction';
import { verifyEmailCodeAction } from '../verifyEmailCodeAction';
import { setupActionEnv, teardownActionEnv } from './_setup';
import { seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import type { PgliteDB } from '@/lib/db/client-pglite';

let db: PgliteDB;

function tokenFromHtml(html: string): string {
  return decodeURIComponent(html.match(/token=([^"]+)"/)?.[1] ?? '');
}
function codeFromHtml(html: string): string {
  return html.match(/letter-spacing:[^>]+>\s*(\d{6})\s*</)?.[1] ?? '';
}

async function emailHtml(to: string): Promise<string> {
  const [row] = await db
    .select({ html: outboxEntries.html })
    .from(outboxEntries)
    .where(eq(outboxEntries.toAddr, to))
    .limit(1);
  return row.html;
}

async function emailVerifiedOf(email: string): Promise<boolean> {
  const [row] = await db
    .select({ emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return row.emailVerified;
}

describe('verify actions flip users.emailVerified', () => {
  beforeEach(async () => {
    db = await setupActionEnv();
  });
  afterEach(teardownActionEnv);

  it('link path: verifyEmailAction sets the user emailVerified=true', async () => {
    // Token issued before the user row exists (signupEmailAction EMAIL_TAKEN
    // guard), then the user is created unverified, then the link is consumed.
    await signupEmailAction({ email: 'link@example.com', workspaceType: 'buyer' });
    await seedUser(db, { email: 'link@example.com' });
    expect(await emailVerifiedOf('link@example.com')).toBe(false);

    const rawToken = tokenFromHtml(await emailHtml('link@example.com'));
    const r = await verifyEmailAction(rawToken);
    expect(r.ok).toBe(true);

    expect(await emailVerifiedOf('link@example.com')).toBe(true);
  });

  it('code path: verifyEmailCodeAction sets the user emailVerified=true', async () => {
    await signupEmailAction({ email: 'code@example.com', workspaceType: 'buyer' });
    await seedUser(db, { email: 'code@example.com' });
    expect(await emailVerifiedOf('code@example.com')).toBe(false);

    const code = codeFromHtml(await emailHtml('code@example.com'));
    const r = await verifyEmailCodeAction({ email: 'code@example.com', code });
    expect(r.ok).toBe(true);

    expect(await emailVerifiedOf('code@example.com')).toBe(true);
  });
});
