import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { users } from '@/lib/db/schema';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';

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
