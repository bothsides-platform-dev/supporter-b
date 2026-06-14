import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { createPgliteDb } from '@/lib/db/client-pglite';
import { users } from '@/lib/db/schema';
import { DrizzleUserRepository } from '../user';

async function setup() {
  const db = await createPgliteDb();
  const repo = new DrizzleUserRepository(db);
  return { db, repo };
}

function makeUser(over?: Partial<{ id: string; email: string; name: string }>) {
  return {
    id: over?.id ?? randomUUID(),
    email: over?.email ?? 'kim@toss.im',
    name: over?.name ?? 'Kim',
    avatarColor: 'ink' as const,
    role: 'member' as const,
    status: 'active' as const,
    emailVerified: false,
    joinedAt: new Date().toISOString(),
    passwordHash: 'hash',
  };
}

describe('markEmailVerified', () => {
  it('new users start unverified (emailVerified=false)', async () => {
    const { repo } = await setup();
    await repo.save(makeUser({ email: 'fresh@x.com' }));

    const u = await repo.findByEmail('fresh@x.com');
    expect(u?.emailVerified).toBe(false);
  });

  it('flips emailVerified false→true and stamps emailVerifiedAt', async () => {
    const { db, repo } = await setup();
    await repo.save(makeUser({ email: 'verify@x.com' }));

    await repo.markEmailVerified('verify@x.com');

    const after = await repo.findByEmail('verify@x.com');
    expect(after?.emailVerified).toBe(true);

    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'verify@x.com'));
    expect(row.emailVerifiedAt).not.toBeNull();
  });

  it('is a no-op for an unknown email', async () => {
    const { repo } = await setup();
    // Must not throw when no row matches.
    await repo.markEmailVerified('nobody@x.com');
    expect(await repo.findByEmail('nobody@x.com')).toBeUndefined();
  });
});

describe('getSessionVersion', () => {
  it('returns the sessionVersion for an existing user', async () => {
    const { db, repo } = await setup();
    const id = randomUUID();
    await db.insert(users).values({
      id,
      email: 'sv@x.com',
      passwordHash: 'h',
      name: 'SV',
      sessionVersion: 7,
    });

    expect(await repo.getSessionVersion(id)).toBe(7);
  });

  it('returns undefined for an unknown user', async () => {
    const { repo } = await setup();
    expect(await repo.getSessionVersion(randomUUID())).toBeUndefined();
  });
});

describe('getEmailVerified', () => {
  it('returns false for a fresh user', async () => {
    const { repo } = await setup();
    const id = randomUUID();
    await repo.save(makeUser({ id, email: 'gev@x.com' }));

    expect(await repo.getEmailVerified(id)).toBe(false);
  });

  it('returns true after verification', async () => {
    const { repo } = await setup();
    const id = randomUUID();
    await repo.save(makeUser({ id, email: 'gev2@x.com' }));
    await repo.markEmailVerified('gev2@x.com');

    expect(await repo.getEmailVerified(id)).toBe(true);
  });

  it('returns undefined for an unknown user', async () => {
    const { repo } = await setup();
    expect(await repo.getEmailVerified(randomUUID())).toBeUndefined();
  });
});

describe('findEmailVerifiedByEmail', () => {
  it('returns false for an unverified account', async () => {
    const { repo } = await setup();
    await repo.save(makeUser({ email: 'fev@x.com' }));

    expect(await repo.findEmailVerifiedByEmail('fev@x.com')).toBe(false);
  });

  it('returns true for a verified account', async () => {
    const { repo } = await setup();
    await repo.save(makeUser({ email: 'fev2@x.com' }));
    await repo.markEmailVerified('fev2@x.com');

    expect(await repo.findEmailVerifiedByEmail('fev2@x.com')).toBe(true);
  });

  it('returns undefined when no account exists', async () => {
    const { repo } = await setup();
    expect(await repo.findEmailVerifiedByEmail('nobody@x.com')).toBeUndefined();
  });
});

describe('existsByEmail', () => {
  it('is true for an existing email (verified or not)', async () => {
    const { repo } = await setup();
    await repo.save(makeUser({ email: 'exists@x.com' }));

    expect(await repo.existsByEmail('exists@x.com')).toBe(true);
  });

  it('is false for an unknown email', async () => {
    const { repo } = await setup();
    expect(await repo.existsByEmail('ghost@x.com')).toBe(false);
  });
});

describe('findIdByEmailCI', () => {
  it('matches case-insensitively and returns the id', async () => {
    const { repo } = await setup();
    const id = randomUUID();
    await repo.save(makeUser({ id, email: 'mixed@x.com' }));

    expect(await repo.findIdByEmailCI('MIXED@X.com')).toBe(id);
  });

  it('returns undefined when no account matches', async () => {
    const { repo } = await setup();
    expect(await repo.findIdByEmailCI('nobody@x.com')).toBeUndefined();
  });
});

describe('markEmailVerifiedById', () => {
  it('flips emailVerified false→true by id and stamps emailVerifiedAt', async () => {
    const { db, repo } = await setup();
    const id = randomUUID();
    await repo.save(makeUser({ id, email: 'mevb@x.com' }));

    await repo.markEmailVerifiedById(id);

    expect(await repo.getEmailVerified(id)).toBe(true);
    const [row] = await db.select().from(users).where(eq(users.id, id));
    expect(row.emailVerifiedAt).not.toBeNull();
  });

  it('is a no-op for an unknown id', async () => {
    const { repo } = await setup();
    await repo.markEmailVerifiedById(randomUUID());
    // No throw is the assertion.
    expect(true).toBe(true);
  });
});

describe('setLastActiveWorkspace', () => {
  it('persists lastActiveWorkspaceId for a user', async () => {
    const { db, repo } = await setup();
    const id = randomUUID();
    await repo.save(makeUser({ id, email: 'law@x.com' }));
    const wsId = randomUUID();

    await repo.setLastActiveWorkspace(id, wsId);

    const [row] = await db.select().from(users).where(eq(users.id, id));
    expect(row.lastActiveWorkspaceId).toBe(wsId);
  });
});

describe('findAuthRowByEmail', () => {
  it('returns the raw auth projection incl. deletedAt + lastActiveWorkspaceId', async () => {
    const { repo } = await setup();
    const id = randomUUID();
    const wsId = randomUUID();
    await repo.save(makeUser({ id, email: 'auth@x.com' }));
    await repo.setLastActiveWorkspace(id, wsId);
    await repo.markEmailVerified('auth@x.com');

    const row = await repo.findAuthRowByEmail('auth@x.com');
    expect(row).toEqual({
      id,
      email: 'auth@x.com',
      passwordHash: 'hash',
      emailVerified: true,
      deletedAt: null,
      lastActiveWorkspaceId: wsId,
    });
  });

  it('surfaces a non-null deletedAt for a soft-deleted account', async () => {
    const { db, repo } = await setup();
    const id = randomUUID();
    const when = new Date('2026-01-01T00:00:00Z');
    await db.insert(users).values({
      id,
      email: 'gone@x.com',
      passwordHash: 'h',
      name: 'Gone',
      deletedAt: when,
    });

    const row = await repo.findAuthRowByEmail('gone@x.com');
    expect(row?.deletedAt?.getTime()).toBe(when.getTime());
  });

  it('returns undefined for an unknown email', async () => {
    const { repo } = await setup();
    expect(await repo.findAuthRowByEmail('nobody@x.com')).toBeUndefined();
  });
});

describe('provisionMaster', () => {
  it('creates a verified, system-account row when absent and returns its id', async () => {
    const { db, repo } = await setup();
    const id = await repo.provisionMaster({ email: 'master@x.com', name: 'Master' });

    const [row] = await db.select().from(users).where(eq(users.id, id));
    expect(row.email).toBe('master@x.com');
    expect(row.name).toBe('Master');
    expect(row.emailVerified).toBe(true);
    expect(row.emailVerifiedAt).not.toBeNull();
    expect(row.isSystemAccount).toBe(true);
    expect(row.passwordHash).toBeTruthy();
  });

  it('returns the existing id when the email is already provisioned', async () => {
    const { repo } = await setup();
    const id = randomUUID();
    await repo.save(makeUser({ id, email: 'master2@x.com' }));

    expect(await repo.provisionMaster({ email: 'master2@x.com', name: 'M2' })).toBe(id);
  });
});
