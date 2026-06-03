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
