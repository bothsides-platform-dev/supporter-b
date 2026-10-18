/**
 * 가입 후 인증 토큰은 발급 당시 provisional user에 묶인다. 링크/코드는 같은
 * principal의 인증된 세션에서만 계정을 활성화하고 기존 세션을 폐기한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
import { eq } from 'drizzle-orm';

const sessionRef: { value: unknown | null } = { value: null };
vi.mock('@/auth', () => ({ auth: () => Promise.resolve(sessionRef.value) }));

import { outboxEntries, users } from '@/lib/db/schema';
import { signupEmailAction } from '../signupEmailAction';
import { sendMyEmailVerificationAction } from '../sendMyEmailVerificationAction';
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
    sessionRef.value = null;
  });
  afterEach(teardownActionEnv);

  it('link path: verifyEmailAction sets the user emailVerified=true', async () => {
    const user = await seedUser(db, { email: 'link@example.com' });
    sessionRef.value = { user: { id: user.id, email: 'link@example.com' } };
    await sendMyEmailVerificationAction();
    expect(await emailVerifiedOf('link@example.com')).toBe(false);

    const rawToken = tokenFromHtml(await emailHtml('link@example.com'));
    const r = await verifyEmailAction(rawToken);
    expect(r.ok).toBe(true);

    expect(await emailVerifiedOf('link@example.com')).toBe(true);
  });

  it('code path: verifyEmailCodeAction sets the user emailVerified=true', async () => {
    const user = await seedUser(db, { email: 'code@example.com' });
    sessionRef.value = { user: { id: user.id, email: 'code@example.com' } };
    await sendMyEmailVerificationAction();
    expect(await emailVerifiedOf('code@example.com')).toBe(false);

    const code = codeFromHtml(await emailHtml('code@example.com'));
    sessionRef.value = null;
    expect(
      await verifyEmailCodeAction({ email: 'code@example.com', code }),
    ).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
    expect(await emailVerifiedOf('code@example.com')).toBe(false);

    sessionRef.value = { user: { id: user.id, email: 'code@example.com' } };
    const r = await verifyEmailCodeAction({ email: 'code@example.com', code });
    expect(r.ok).toBe(true);

    const [activated] = await db
      .select({
        emailVerified: users.emailVerified,
        sessionVersion: users.sessionVersion,
      })
      .from(users)
      .where(eq(users.id, user.id));
    expect(activated).toEqual({ emailVerified: true, sessionVersion: 2 });
  });

  it('does not let a victim link activate attacker-created credentials, but the bound provisional user can activate and revokes old sessions', async () => {
    const attackerCreated = await seedUser(db, { email: 'victim@example.com' });
    sessionRef.value = {
      user: { id: attackerCreated.id, email: 'victim@example.com' },
    };
    expect(await sendMyEmailVerificationAction()).toEqual({ ok: true });

    const rawToken = tokenFromHtml(await emailHtml('victim@example.com'));
    sessionRef.value = null;

    expect(await verifyEmailAction(rawToken)).toEqual({
      ok: false,
      error: 'UNAUTHENTICATED',
    });
    expect(await emailVerifiedOf('victim@example.com')).toBe(false);

    sessionRef.value = {
      user: { id: attackerCreated.id, email: 'victim@example.com' },
    };
    expect((await verifyEmailAction(rawToken)).ok).toBe(true);

    const [activated] = await db
      .select({
        emailVerified: users.emailVerified,
        sessionVersion: users.sessionVersion,
      })
      .from(users)
      .where(eq(users.id, attackerCreated.id));
    expect(activated).toEqual({ emailVerified: true, sessionVersion: 2 });
  });

  it('does not let an authenticated different user consume a bound verification token', async () => {
    const provisional = await seedUser(db, { email: 'bound@example.com' });
    const other = await seedUser(db, { email: 'other@example.com' });
    sessionRef.value = {
      user: { id: provisional.id, email: 'bound@example.com' },
    };
    expect(await sendMyEmailVerificationAction()).toEqual({ ok: true });
    const rawToken = tokenFromHtml(await emailHtml('bound@example.com'));

    sessionRef.value = { user: { id: other.id, email: 'other@example.com' } };
    expect(await verifyEmailAction(rawToken)).toEqual({
      ok: false,
      error: 'TOKEN_PRINCIPAL_MISMATCH',
    });
    expect(await emailVerifiedOf('bound@example.com')).toBe(false);

    sessionRef.value = {
      user: { id: provisional.id, email: 'bound@example.com' },
    };
    expect((await verifyEmailAction(rawToken)).ok).toBe(true);
    expect(await emailVerifiedOf('bound@example.com')).toBe(true);
  });

  it('does not activate a later-created user with an unbound pre-signup token', async () => {
    await signupEmailAction({
      email: 'preissued@example.com',
      workspaceType: 'buyer',
    });
    await seedUser(db, { email: 'preissued@example.com' });

    const rawToken = tokenFromHtml(await emailHtml('preissued@example.com'));
    expect((await verifyEmailAction(rawToken)).ok).toBe(true);
    expect(await emailVerifiedOf('preissued@example.com')).toBe(false);
  });
});
