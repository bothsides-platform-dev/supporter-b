import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { outboxEntries, users, verificationTokens } from '@/lib/db/schema';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { passwordForgotAction } from '../passwordForgotAction';
import { passwordResetAction } from '../passwordResetAction';
import { setupActionEnv, teardownActionEnv } from './_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

let db: PgliteDB;

async function seedUser(email: string, plainPassword = 'OldPassword1!'): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email,
    passwordHash: await hashPassword(plainPassword),
    name: 'tester',
    avatarColor: 'ink',
  });
  return id;
}

function tokenFromOutbox(html: string): string {
  return decodeURIComponent(html.match(/token=([^"]+)"/)?.[1] ?? '');
}

describe('passwordForgotAction', () => {
  beforeEach(async () => {
    db = await setupActionEnv();
  });
  afterEach(teardownActionEnv);

  it('always returns ok:true even when the email does not exist', async () => {
    const r = await passwordForgotAction({ email: 'unknown@nope.com' });
    expect(r).toEqual({ ok: true });

    // No outbox row, no verification token issued — silent.
    const out = await db.select().from(outboxEntries);
    expect(out).toHaveLength(0);
  });

  it('마스터/운영자 이메일은 재설정 토큰을 발급하지 않는다 (env로만 관리, ok:true 위장)', async () => {
    const ORIGINAL = process.env.MASTER_ACCOUNT_EMAILS;
    process.env.MASTER_ACCOUNT_EMAILS = 'help@support-b.com';
    try {
      await seedUser('help@support-b.com');
      const r = await passwordForgotAction({ email: 'help@support-b.com' });
      expect(r).toEqual({ ok: true });
      const out = await db.select().from(outboxEntries);
      expect(out).toHaveLength(0);
      const tokens = await db.select().from(verificationTokens);
      expect(tokens).toHaveLength(0);
    } finally {
      if (ORIGINAL === undefined) delete process.env.MASTER_ACCOUNT_EMAILS;
      else process.env.MASTER_ACCOUNT_EMAILS = ORIGINAL;
    }
  });

  it('issues a token + outbox row when the email matches a real user', async () => {
    await seedUser('kim@example.com');
    const r = await passwordForgotAction({ email: 'Kim@example.com' });
    expect(r.ok).toBe(true);

    const out = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'kim@example.com'));
    expect(out).toHaveLength(1);
    expect(out[0].event).toBe('auth.reset');
  });

  it('두 번째 forgot 가 같은 15분 버킷이면 이전 토큰을 burn 하지 않는다 (UX 함정 회귀 가드)', async () => {
    await seedUser('kim@example.com');

    await passwordForgotAction({ email: 'kim@example.com' });
    const rows1 = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'auth.reset'))
      .limit(1);
    const firstToken = tokenFromOutbox(rows1[0].html);

    // 같은 버킷 내 두 번째 호출 — outbox dedupe 가 enqueue 를 막아야 함
    await passwordForgotAction({ email: 'kim@example.com' });

    // outbox row 는 여전히 1개
    const outboxRows = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'auth.reset'));
    expect(outboxRows).toHaveLength(1);

    // verification_tokens 도 1개여야 함 — 두 번째 save 가 skip 되었어야
    const tokenRows = await db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.email, 'kim@example.com'));
    expect(tokenRows).toHaveLength(1);

    // 첫 토큰으로 reset 이 성공해야 함 (burn 되지 않았다는 증거)
    const r = await passwordResetAction({
      rawToken: firstToken,
      password: 'NewPassword2@',
    });
    expect(r.ok).toBe(true);
  });

  it('두 번째 forgot 가 다른 15분 버킷이면 이전 토큰이 무효화된다', async () => {
    await seedUser('kim@example.com');

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-05-19T10:00:00Z'));
      await passwordForgotAction({ email: 'kim@example.com' });
      const rows1 = await db
        .select({ html: outboxEntries.html, scheduledAt: outboxEntries.scheduledAt })
        .from(outboxEntries)
        .where(eq(outboxEntries.event, 'auth.reset'))
        .orderBy(outboxEntries.scheduledAt);
      expect(rows1).toHaveLength(1);
      const firstToken = tokenFromOutbox(rows1[0].html);

      // 20분 뒤 → 다른 15분 버킷
      vi.setSystemTime(new Date('2026-05-19T10:20:00Z'));
      await passwordForgotAction({ email: 'kim@example.com' });

      // outbox 에 두 번째 row 가 추가
      const outboxRows = await db
        .select()
        .from(outboxEntries)
        .where(eq(outboxEntries.event, 'auth.reset'));
      expect(outboxRows).toHaveLength(2);

      // 첫 토큰은 이제 거부되어야 함 (invalidatePending 으로 burn)
      const r = await passwordResetAction({
        rawToken: firstToken,
        password: 'NewPassword2@',
      });
      expect(r.ok).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('passwordResetAction', () => {
  beforeEach(async () => {
    db = await setupActionEnv();
  });
  afterEach(teardownActionEnv);

  it('updates the password hash on success', async () => {
    const userId = await seedUser('kim@example.com');
    await passwordForgotAction({ email: 'kim@example.com' });

    const rows = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'auth.reset'))
      .limit(1);
    const token = tokenFromOutbox(rows[0].html);

    const r = await passwordResetAction({
      rawToken: token,
      password: 'NewPassword2@',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.email).toBe('kim@example.com');
    expect(r.password).toBe('NewPassword2@');

    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(await verifyPassword('NewPassword2@', u.passwordHash)).toBe(true);
    expect(await verifyPassword('OldPassword1!', u.passwordHash)).toBe(false);
  });

  it('rejects a reused token', async () => {
    await seedUser('kim@example.com');
    await passwordForgotAction({ email: 'kim@example.com' });
    const rows = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'auth.reset'))
      .limit(1);
    const token = tokenFromOutbox(rows[0].html);

    const first = await passwordResetAction({
      rawToken: token,
      password: 'NewPassword2@',
    });
    expect(first.ok).toBe(true);
    const second = await passwordResetAction({
      rawToken: token,
      password: 'AnotherPass3#',
    });
    expect(second.ok).toBe(false);
  });

  it('rejects an unknown token', async () => {
    const r = await passwordResetAction({
      rawToken: 'nope-not-real',
      password: 'NewPassword2@',
    });
    expect(r.ok).toBe(false);
  });

  it('rejects a weak new password with WEAK_PASSWORD (rules apply server-side too)', async () => {
    await seedUser('kim@example.com');
    await passwordForgotAction({ email: 'kim@example.com' });
    const rows = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'auth.reset'))
      .limit(1);
    const token = tokenFromOutbox(rows[0].html);

    // 10+ chars but missing digit/special — passes legacy min(10) check but
    // must be blocked by the shared policy schema.
    const r = await passwordResetAction({
      rawToken: token,
      password: 'aaaaaaaaaa',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('WEAK_PASSWORD');
  });
});
