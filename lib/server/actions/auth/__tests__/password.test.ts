import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { outboxEntries, users, verificationTokens } from '@/lib/db/schema';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { passwordForgotAction } from '../passwordForgotAction';
import { passwordResetAction } from '../passwordResetAction';
import { setupActionEnv, teardownActionEnv } from './_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { LOGIN_LOCK_THRESHOLD, recordLoginFailure } from '@/lib/server/auth/login-rate-limit';
import { getLoginAttemptRepo } from '@/lib/server/repositories/factory';

const { requestHeaders } = vi.hoisted(() => ({
  requestHeaders: new Headers(),
}));
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(requestHeaders),
}));

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

  // 재발송 버튼의 대기 시간(ResendCountdown 기본 60초)과 서버의 1분 단위 중복 방지가
  // 맞물리는지, 그리고 비로그인 엔드포인트가 메일 폭탄 통로가 되지 않는지를 고정한다.
  describe('재발송과 발송 한도', () => {
    async function resetRows() {
      return db
        .select({ html: outboxEntries.html })
        .from(outboxEntries)
        .where(eq(outboxEntries.event, 'auth.reset'))
        .orderBy(outboxEntries.scheduledAt);
    }

    async function resetTokens() {
      return db
        .select()
        .from(verificationTokens)
        .where(eq(verificationTokens.email, 'kim@example.com'));
    }

    async function forgotAt(iso: string) {
      vi.setSystemTime(new Date(iso));
      return passwordForgotAction({ email: 'kim@example.com' });
    }

    beforeEach(async () => {
      await seedUser('kim@example.com');
      vi.useFakeTimers({ toFake: ['Date'] });
    });
    afterEach(() => {
      vi.useRealTimers();
      requestHeaders.delete('x-forwarded-for');
    });

    it('같은 1분 안에 다시 요청하면 새 메일·토큰을 만들지 않고 첫 링크를 살려 둔다', async () => {
      await forgotAt('2026-05-19T10:00:10Z');
      const firstToken = tokenFromOutbox((await resetRows())[0].html);

      await forgotAt('2026-05-19T10:00:40Z');

      expect(await resetRows()).toHaveLength(1);
      expect(await resetTokens()).toHaveLength(1);
      expect(
        await passwordResetAction({ rawToken: firstToken, password: 'NewPassword2@' }),
      ).toMatchObject({ ok: true });
    });

    it('재발송 대기 60초가 지나 다시 요청하면 새 메일이 나가고 이전 링크는 무효가 된다', async () => {
      await forgotAt('2026-05-19T10:00:30Z');
      await forgotAt('2026-05-19T10:01:30Z');

      const rows = await resetRows();
      expect(rows).toHaveLength(2);
      const [firstToken, secondToken] = rows.map((row) => tokenFromOutbox(row.html));
      expect(
        await passwordResetAction({ rawToken: firstToken, password: 'NewPassword2@' }),
      ).toMatchObject({ ok: false });
      expect(
        await passwordResetAction({ rawToken: secondToken, password: 'NewPassword2@' }),
      ).toMatchObject({ ok: true });
    });

    it('한 이메일에는 최근 1시간 동안 5통까지만 보내고, 그 뒤 요청도 성공처럼 응답한다', async () => {
      for (const minute of ['00', '01', '02', '03', '04']) {
        await forgotAt(`2026-05-19T10:${minute}:00Z`);
      }
      const fifthToken = tokenFromOutbox((await resetRows())[4].html);

      expect(await forgotAt('2026-05-19T10:05:00Z')).toEqual({ ok: true });
      expect(await resetRows()).toHaveLength(5);
      expect(await resetTokens()).toHaveLength(5);
      // 한도에 걸린 요청은 마지막으로 보낸 링크를 무효화하지 않는다.
      expect(
        await passwordResetAction({ rawToken: fifthToken, password: 'NewPassword2@' }),
      ).toMatchObject({ ok: true });
    });

    it('1시간 창은 미끄러진다 — 가장 오래된 발송이 창을 벗어나면 다시 보낸다', async () => {
      for (const minute of ['00', '01', '02', '03', '04']) {
        await forgotAt(`2026-05-19T10:${minute}:00Z`);
      }
      await forgotAt('2026-05-19T11:00:30Z');

      expect(await resetRows()).toHaveLength(6);
    });

    it('IP 요청 한도에 걸려도 결과는 ok:true 이고 메일·토큰을 만들지 않는다', async () => {
      // 새 1분 창에서 시작해 다른 테스트의 호출 수와 섞이지 않게 한다.
      vi.setSystemTime(new Date('2027-01-01T00:00:00Z'));
      requestHeaders.set('x-forwarded-for', '203.0.113.7');
      for (let i = 0; i < 60; i++) {
        expect(await passwordForgotAction({ email: `probe${i}@example.com` })).toEqual({ ok: true });
      }

      expect(await passwordForgotAction({ email: 'kim@example.com' })).toEqual({ ok: true });
      expect(await resetRows()).toHaveLength(0);
      expect(await resetTokens()).toHaveLength(0);
    });
  });
});

describe('passwordResetAction', () => {
  beforeEach(async () => {
    db = await setupActionEnv();
    requestHeaders.delete('x-forwarded-for');
    requestHeaders.delete('x-real-ip');
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

  it('releases stale email and IP locks so reset auto-login still works', async () => {
    await seedUser('locked@example.com');
    await passwordForgotAction({ email: 'locked@example.com' });
    const rows = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'auth.reset'))
      .limit(1);
    const token = tokenFromOutbox(rows[0].html);
    const ip = '203.0.113.77';
    requestHeaders.set('x-forwarded-for', ip);
    const now = new Date();
    for (let i = 0; i < LOGIN_LOCK_THRESHOLD; i++) {
      await recordLoginFailure({ email: 'locked@example.com', ip, now });
    }

    const result = await passwordResetAction({
      rawToken: token,
      password: 'NewPassword2@',
    });

    expect(result.ok).toBe(true);
    const repo = await getLoginAttemptRepo();
    expect(await repo.findByKey('email:locked@example.com')).toBeUndefined();
    expect(await repo.findByKey(`ip:${ip}`)).toBeUndefined();
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
