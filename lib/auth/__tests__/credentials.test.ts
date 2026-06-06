import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { users } from '@/lib/db/schema';

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
  verifyPasswordMock.mockReset();
});
afterEach(() => {
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

  it('returns null without a compare when fields are missing', async () => {
    const r = await authorizeCredentials(db, { email: '', password: '' });
    expect(r).toBeNull();
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });
});
