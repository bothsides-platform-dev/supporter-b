import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { users } from '@/lib/db/schema';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getLoginAttemptRepo,
} from '@/lib/server/repositories/factory';
import { LOGIN_LOCK_THRESHOLD } from '@/lib/server/auth/login-rate-limit';

// Spy on the password module so we can assert a bcrypt compare runs even when
// the account is absent (the constant-time / anti-enumeration contract).
const verifyPasswordMock = vi.fn();
vi.mock('@/lib/auth/password', () => ({
  verifyPassword: (...a: unknown[]) => verifyPasswordMock(...a),
  hashPassword: (p: string) => Promise.resolve(`hashed:${p}`),
}));

import { authorizeCredentials } from '../credentials';

let db: PgliteDB;

async function seedUser(email: string, opts: { deletedAt?: Date | null } = {}) {
  await db.insert(users).values({
    email,
    passwordHash: 'stored-hash',
    name: 'Tester',
    deletedAt: opts.deletedAt ?? null,
  });
}

beforeEach(async () => {
  db = await createPgliteDb();
  // DB access now routes through the repo factory — bind it to this pglite db.
  await __useDrizzleWithDbForTest(db);
  verifyPasswordMock.mockReset();
});
afterEach(() => {
  __resetForTest();
  verifyPasswordMock.mockReset();
});

describe('authorizeCredentials', () => {
  it('admits only the configured number of direct callback guesses before bcrypt is blocked', async () => {
    verifyPasswordMock.mockResolvedValue(false);
    const request = new Request('https://support-b.com/api/auth/callback/credentials', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });

    for (let i = 0; i < LOGIN_LOCK_THRESHOLD; i++) {
      await authorizeCredentials(db, { email: 'brute@example.com', password: `wrong-${i}` }, request);
    }
    expect(verifyPasswordMock).toHaveBeenCalledTimes(LOGIN_LOCK_THRESHOLD);

    await authorizeCredentials(db, { email: 'brute@example.com', password: 'blocked-before-bcrypt' }, request);
    expect(verifyPasswordMock).toHaveBeenCalledTimes(LOGIN_LOCK_THRESHOLD);

    const repo = await getLoginAttemptRepo();
    expect((await repo.findByKey('email:brute@example.com'))?.lockedUntil).toBeInstanceOf(Date);
    expect((await repo.findByKey('ip:203.0.113.10'))?.lockedUntil).toBeInstanceOf(Date);
  });

  it('shares the callback IP bucket across emails to stop password spraying', async () => {
    verifyPasswordMock.mockResolvedValue(false);
    const request = new Request('https://support-b.com/api/auth/callback/credentials', {
      headers: { 'x-forwarded-for': '198.51.100.7' },
    });

    for (let i = 0; i < LOGIN_LOCK_THRESHOLD; i++) {
      await authorizeCredentials(db, { email: `victim-${i}@example.com`, password: 'wrong' }, request);
    }
    await authorizeCredentials(db, { email: 'next-victim@example.com', password: 'blocked-before-bcrypt' }, request);

    expect(verifyPasswordMock).toHaveBeenCalledTimes(LOGIN_LOCK_THRESHOLD);
  });

  it('clears the shared email and IP reservations after a legitimate login', async () => {
    verifyPasswordMock.mockResolvedValue(false);
    const request = new Request('https://support-b.com/api/auth/callback/credentials', {
      headers: { 'x-forwarded-for': '192.0.2.44' },
    });

    await authorizeCredentials(db, { email: 'real@example.com', password: 'wrong' }, request);
    const repo = await getLoginAttemptRepo();
    expect(await repo.findByKey('email:real@example.com')).toBeDefined();
    expect(await repo.findByKey('ip:192.0.2.44')).toBeDefined();

    await seedUser('real@example.com');
    verifyPasswordMock.mockResolvedValue(true);
    const user = await authorizeCredentials(db, { email: 'real@example.com', password: 'correct' }, request);

    expect(user?.email).toBe('real@example.com');
    expect(await repo.findByKey('email:real@example.com')).toBeUndefined();
    expect(await repo.findByKey('ip:192.0.2.44')).toBeUndefined();
  });

  it('rolls back admission when password verification fails unexpectedly', async () => {
    verifyPasswordMock.mockRejectedValue(new Error('bcrypt unavailable'));
    const request = new Request('https://support-b.com/api/auth/callback/credentials', {
      headers: { 'x-forwarded-for': '192.0.2.88' },
    });

    await expect(authorizeCredentials(db, { email: 'failure@example.com', password: 'not-checked' }, request)).rejects.toThrow('bcrypt unavailable');

    const repo = await getLoginAttemptRepo();
    expect((await repo.findByKey('email:failure@example.com'))?.count ?? 0).toBe(0);
    expect((await repo.findByKey('ip:192.0.2.88'))?.count ?? 0).toBe(0);
  });

  it('returns null AND still runs a password compare for an unknown email (no timing leak)', async () => {
    verifyPasswordMock.mockResolvedValue(false);
    const r = await authorizeCredentials(db, {
      email: 'ghost@example.com',
      password: 'whatever',
    });
    expect(r).toBeNull();
    // The dummy compare must have run so absent accounts cost the same as a
    // wrong password on a real account.
    expect(verifyPasswordMock).toHaveBeenCalledTimes(1);
  });

  it('returns the user identity on correct credentials', async () => {
    await seedUser('real@example.com');
    verifyPasswordMock.mockResolvedValue(true);
    const r = await authorizeCredentials(db, {
      email: 'Real@Example.com',
      password: 'correct',
    });
    expect(r).not.toBeNull();
    expect(r!.email).toBe('real@example.com');
    expect(r!.id).toBeTruthy();
  });

  it('returns null on a wrong password for an existing user', async () => {
    await seedUser('real@example.com');
    verifyPasswordMock.mockResolvedValue(false);
    const r = await authorizeCredentials(db, {
      email: 'real@example.com',
      password: 'wrong',
    });
    expect(r).toBeNull();
  });

  it('blocks a deleted account even with the correct password', async () => {
    await seedUser('gone@example.com', { deletedAt: new Date() });
    verifyPasswordMock.mockResolvedValue(true);
    const r = await authorizeCredentials(db, {
      email: 'gone@example.com',
      password: 'correct',
    });
    expect(r).toBeNull();
  });

  it('마스터/운영자 이메일은 비밀번호가 맞아도 로그인 불가 (Google 강제) — 단, compare는 수행', async () => {
    const ORIGINAL = process.env.MASTER_ACCOUNT_EMAILS;
    process.env.MASTER_ACCOUNT_EMAILS = 'help@support-b.com';
    try {
      await seedUser('help@support-b.com');
      verifyPasswordMock.mockResolvedValue(true); // 올바른 비밀번호여도
      const r = await authorizeCredentials(db, {
        email: 'help@support-b.com',
        password: 'correct',
      });
      expect(r).toBeNull();
      // 타이밍 보존: 거부 전에 compare가 한 번은 돌아야 한다 (열거 방지 계약)
      expect(verifyPasswordMock).toHaveBeenCalledTimes(1);
    } finally {
      if (ORIGINAL === undefined) delete process.env.MASTER_ACCOUNT_EMAILS;
      else process.env.MASTER_ACCOUNT_EMAILS = ORIGINAL;
    }
  });

  it('returns null without a compare when fields are missing', async () => {
    const r = await authorizeCredentials(db, { email: '', password: '' });
    expect(r).toBeNull();
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });

  it('rejects non-string and oversized callback fields before persistence or bcrypt', async () => {
    const request = new Request('https://support-b.com/api/auth/callback/credentials', {
      headers: { 'x-forwarded-for': '203.0.113.55' },
    });

    await expect(authorizeCredentials(db, { email: { toString: () => 'object@example.com' }, password: 'wrong' }, request)).resolves.toBeNull();
    await expect(authorizeCredentials(db, { email: `${'a'.repeat(310)}@example.com`, password: 'wrong' }, request)).resolves.toBeNull();
    await expect(authorizeCredentials(db, { email: 'bounded@example.com', password: 'x'.repeat(201) }, request)).resolves.toBeNull();

    expect(verifyPasswordMock).not.toHaveBeenCalled();
    const repo = await getLoginAttemptRepo();
    expect(await repo.findByKey('ip:203.0.113.55')).toBeUndefined();
  });

  // The `sv` JWT claim is stamped from this value at login — without it the
  // server-side revocation check (lib/auth/session-version.ts) has nothing to
  // compare against.
  it('returns the current sessionVersion so the jwt callback can stamp `sv`', async () => {
    await seedUser('versioned@example.com');
    const { eq } = await import('drizzle-orm');
    await db
      .update(users)
      .set({ sessionVersion: 5 })
      .where(eq(users.email, 'versioned@example.com'));
    verifyPasswordMock.mockResolvedValue(true);
    const r = await authorizeCredentials(db, {
      email: 'versioned@example.com',
      password: 'correct',
    });
    expect(r!.sessionVersion).toBe(5);
  });
});
