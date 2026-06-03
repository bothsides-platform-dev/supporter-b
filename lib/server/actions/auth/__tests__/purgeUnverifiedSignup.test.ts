import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { createPgliteDb } from '@/lib/db/client-pglite';
import {
  workspaces,
  workspaceMembers,
  bizProfiles,
  columns,
  verificationApplications,
  verificationTokens,
} from '@/lib/db/schema';
import { DrizzleUserRepository } from '@/lib/server/repositories/drizzle/user';
import { createWorkspaceInTx } from '@/lib/server/actions/workspace/_createWorkspace';
import { purgeUnverifiedSignup } from '../_purgeUnverifiedSignup';

const BIZ = { bizNo: '1234567890', taxType: 'general' as const, status: 'active' as const };

async function setup() {
  const db = await createPgliteDb();
  const repo = new DrizzleUserRepository(db);
  return { db, repo };
}

function makeUser(email: string) {
  return {
    id: randomUUID(),
    email,
    name: 'U',
    avatarColor: 'ink' as const,
    role: 'member' as const,
    status: 'active' as const,
    emailVerified: false,
    joinedAt: new Date().toISOString(),
    passwordHash: 'h',
  };
}

describe('purgeUnverifiedSignup', () => {
  it('removes an abandoned unverified signup (user + pending ws + deps + tokens)', async () => {
    const { db, repo } = await setup();
    const u = makeUser('abandon@x.com');
    await repo.save(u);
    const { workspaceId, applicationId } = await createWorkspaceInTx(db, {
      userId: u.id,
      type: 'buyer',
      name: 'WS',
      bizProfile: BIZ,
    });
    await db.insert(verificationTokens).values({
      id: randomUUID(),
      purpose: 'signup_email',
      email: 'abandon@x.com',
      tokenHash: 'tok',
      expiresAt: new Date(Date.now() + 60_000),
    });

    await purgeUnverifiedSignup(db, 'abandon@x.com');

    expect(await repo.findByEmail('abandon@x.com')).toBeUndefined();
    expect(
      (await db.select().from(workspaces).where(eq(workspaces.id, workspaceId))).length,
    ).toBe(0);
    expect(
      (await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, u.id))).length,
    ).toBe(0);
    expect(
      (await db.select().from(verificationApplications).where(eq(verificationApplications.id, applicationId))).length,
    ).toBe(0);
    expect(
      (await db.select().from(columns).where(eq(columns.workspaceId, workspaceId))).length,
    ).toBe(0);
    expect((await db.select().from(bizProfiles)).length).toBe(0);
    expect(
      (await db.select().from(verificationTokens).where(eq(verificationTokens.email, 'abandon@x.com'))).length,
    ).toBe(0);
  });

  it('leaves a VERIFIED user untouched', async () => {
    const { db, repo } = await setup();
    const u = makeUser('verified@x.com');
    await repo.save(u);
    await createWorkspaceInTx(db, { userId: u.id, type: 'buyer', name: 'WS', bizProfile: BIZ });
    await repo.markEmailVerified('verified@x.com');

    await purgeUnverifiedSignup(db, 'verified@x.com');

    expect(await repo.findByEmail('verified@x.com')).toBeDefined();
  });

  it('leaves an unverified user who is a member of an ACTIVE workspace untouched', async () => {
    const { db, repo } = await setup();
    const u = makeUser('invitee@x.com');
    await repo.save(u);
    const { workspaceId } = await createWorkspaceInTx(db, { userId: u.id, type: 'pg', name: 'WS' });
    await db.update(workspaces).set({ status: 'active' }).where(eq(workspaces.id, workspaceId));

    await purgeUnverifiedSignup(db, 'invitee@x.com');

    expect(await repo.findByEmail('invitee@x.com')).toBeDefined();
    expect(
      (await db.select().from(workspaces).where(eq(workspaces.id, workspaceId))).length,
    ).toBe(1);
  });

  it('is a no-op for an unknown email', async () => {
    const { db } = await setup();
    await purgeUnverifiedSignup(db, 'nobody@x.com');
  });
});
