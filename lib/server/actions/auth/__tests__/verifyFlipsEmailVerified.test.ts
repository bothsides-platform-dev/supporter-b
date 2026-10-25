/**
 * 가입 후 인증 토큰은 발급 당시 provisional user에 묶인다. 링크/코드는 같은
 * principal의 인증된 세션에서만 계정을 활성화하고 기존 세션을 폐기한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
import { eq } from 'drizzle-orm';

const renewalFailure = vi.hoisted(() => ({ value: false }));
const sessionRef: { value: unknown | null } = { value: null };
vi.mock('@/auth', () => ({
  auth: () => Promise.resolve(sessionRef.value),
  unstable_update: async (data: unknown) => {
    if (renewalFailure.value) throw new Error('cookie write failed');
    const { makeNodeJwtCallback } = await import('@/lib/auth/master-login');
    const { default: config } = await import('@/auth.config');
    const session = sessionRef.value as { user: { id: string; email: string; sessionVersion?: number } };
    const token = await makeNodeJwtCallback(undefined, config.callbacks.jwt as never)({
      token: { id: session.user.id, email: session.user.email, workspaceId: (session.user as { workspaceId?: string }).workspaceId, sv: session.user.sessionVersion ?? 1 },
      trigger: 'update', session: data,
    });
    sessionRef.value = { user: { ...session.user, sessionVersion: token.sv } };
    return sessionRef.value;
  },
}));

import { outboxEntries, users, verificationApplications, guestRfpDrafts } from '@/lib/db/schema';
import { signupEmailAction } from '../signupEmailAction';
import { sendMyEmailVerificationAction } from '../sendMyEmailVerificationAction';
import { verifyEmailAction } from '../verifyEmailAction';
import { verifyEmailCodeAction } from '../verifyEmailCodeAction';
import { setupActionEnv, teardownActionEnv } from './_setup';
import { seedUser, seedBuyerWorkspace, seedMembership } from '@/lib/server/repositories/drizzle/__tests__/_seed';
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

describe('verification renews only the proving browser session', () => {
  beforeEach(async () => { db = await setupActionEnv(); sessionRef.value = null; renewalFailure.value = false; });
  afterEach(teardownActionEnv);
  it.each(['link', 'code'])('%s activates and replaces the current cookie without reviving other sessions', async (mode) => {
    const user = await seedUser(db, { email: 'renew@example.com' });
    sessionRef.value = { user: { id: user.id, email: user.email, sessionVersion: 1 } };
    await sendMyEmailVerificationAction();
    const html = await emailHtml(user.email);
    const result = mode === 'link'
      ? await verifyEmailAction(tokenFromHtml(html))
      : await verifyEmailCodeAction({ email: user.email, code: codeFromHtml(html) });
    expect(result.ok).toBe(true);
    expect(sessionRef.value).toMatchObject({ user: { id: user.id, sessionVersion: 2 } });
    expect(result).not.toHaveProperty('sessionRenewal');
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.sessionVersion).toBe(2); // other browser JWTs still carry 1
  });
  it.each(['link', 'code'])('%s rejects a revoked session without consuming the email proof', async (mode) => {
    const user = await seedUser(db, { email: 'revoked@example.com' });
    sessionRef.value = { user: { id: user.id, email: user.email, sessionVersion: 1 } };
    await sendMyEmailVerificationAction();
    const html = await emailHtml(user.email);
    await db.update(users).set({ sessionVersion: 2 }).where(eq(users.id, user.id));
    const verify = () => mode === 'link'
      ? verifyEmailAction(tokenFromHtml(html))
      : verifyEmailCodeAction({ email: user.email, code: codeFromHtml(html) });
    expect(await verify()).toEqual({ ok: false, error: 'SESSION_REVOKED' });
    expect(await emailVerifiedOf(user.email)).toBe(false);
    sessionRef.value = { user: { id: user.id, email: user.email, sessionVersion: 2 } };
    expect((await verify()).ok).toBe(true);
    expect(sessionRef.value).toMatchObject({ user: { sessionVersion: 3 } });
  });
});

it('인증이 커밋된 뒤 쿠키 교체에 실패하면 인증 성공과 재로그인 복구를 함께 반환한다', async () => {
  db = await setupActionEnv();
  try {
    const user = await seedUser(db, { email: 'cookie-failed@example.com' });
    sessionRef.value = { user: { id: user.id, email: user.email, sessionVersion: 1 } };
    await sendMyEmailVerificationAction();
    renewalFailure.value = true;
    const result = await verifyEmailAction(tokenFromHtml(await emailHtml(user.email)));
    expect(result).toMatchObject({ ok: true, reauthenticate: true });
    expect(result).not.toHaveProperty('sessionRenewal');
    expect(await emailVerifiedOf(user.email)).toBe(true);
    expect(sessionRef.value).toMatchObject({ user: { sessionVersion: 1 } });
  } finally { renewalFailure.value = false; teardownActionEnv(); }
});

it('인증 응답은 현재 사용자와 워크스페이스에 연결된 서버 견적 복귀 주소를 제공한다', async () => {
  db = await setupActionEnv();
  try {
    const user = await seedUser(db, { email: 'server-draft@example.com' });
    const workspace = await seedBuyerWorkspace(db);
    await seedMembership(db, workspace.id, user.id, 'admin');
    const [application] = await db.insert(verificationApplications).values({ workspaceId: workspace.id, orgType: 'buyer', status: 'approved' }).returning();
    await db.insert(guestRfpDrafts).values({ id: crypto.randomUUID(), secretHash: 'test', userId: user.id, workspaceId: workspace.id, applicationId: application.id, answers: { version: 1, data: { title: '서버 견적' } } });
    sessionRef.value = { user: { id: user.id, email: user.email, sessionVersion: 1, workspaceId: workspace.id, workspaceType: 'buyer' } };
    await sendMyEmailVerificationAction();
    const result = await verifyEmailAction(tokenFromHtml(await emailHtml(user.email)));
    expect(result).toMatchObject({ ok: true, next: '/rfp-create?resume=guest' });
  } finally { teardownActionEnv(); }
});
