import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';

import { createPgliteDb } from '@/lib/db/client-pglite';
import {
  workspaces,
  workspaceMembers,
  bizProfiles,
  columns,
  guestRfpDrafts,
  guestRfpFiles,
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
    avatarUpdatedAt: null,
    role: 'member' as const,
    status: 'active' as const,
    emailVerified: false,
    joinedAt: new Date().toISOString(),
    passwordHash: 'h',
  };
}

describe('purgeUnverifiedSignup', () => {
  it('locks the user row before deciding that an account is safe to purge', () => {
    const source = readFileSync(
      new URL('../_purgeUnverifiedSignup.ts', import.meta.url),
      'utf8',
    );
    const eligibilityRead = source.slice(
      source.indexOf('const [u]'),
      source.indexOf("if (!u) return 'clear'"),
    );
    expect(eligibilityRead).toContain(".for('update')");
  });

  it('locks workspace rows before deciding they are safe to purge', () => {
    const source = readFileSync(
      new URL('../_purgeUnverifiedSignup.ts', import.meta.url),
      'utf8',
    );
    const eligibilityRead = source.slice(
      source.indexOf('const wsRows'),
      source.indexOf('// Guard: any non-pending membership'),
    );
    expect(eligibilityRead).toContain(".for('update')");
  });

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

  it('retires a bound guest draft instead of letting it pin attacker credentials', async () => {
    const { db, repo } = await setup();
    const email = 'guest-bound@x.com';
    const attacker = makeUser(email);
    await repo.save(attacker);
    const { workspaceId, applicationId } = await createWorkspaceInTx(db, {
      userId: attacker.id,
      type: 'buyer',
      name: 'Attacker workspace',
      bizProfile: BIZ,
    });
    const draftId = randomUUID();
    const fileId = randomUUID();
    const clientId = randomUUID();
    await db.insert(guestRfpDrafts).values({
      id: draftId,
      secretHash: 'attacker-proof',
      answers: { version: 1, data: { title: 'attacker content' } },
      fileIds: [clientId],
      userId: attacker.id,
      workspaceId,
      applicationId,
      expiresAt: null,
    });
    await db.insert(guestRfpFiles).values({
      id: fileId,
      draftId,
      clientId,
      name: 'attacker.pdf',
      size: 4,
      mime: 'application/pdf',
      status: 'ready',
    });

    expect(await purgeUnverifiedSignup(db, email)).toBe('clear');

    expect(await repo.findByEmail(email)).toBeUndefined();
    const [retiredDraft] = await db
      .select()
      .from(guestRfpDrafts)
      .where(eq(guestRfpDrafts.id, draftId));
    expect(retiredDraft).toMatchObject({
      userId: null,
      workspaceId: null,
      applicationId: null,
      answers: { version: 1, data: {} },
      fileIds: [],
      memberAttachmentIds: [],
    });
    expect(retiredDraft.deletedAt).toBeInstanceOf(Date);
    expect(
      (await db.select().from(guestRfpFiles).where(eq(guestRfpFiles.id, fileId)))[0]
        .status,
    ).toBe('deleting');

    const replacement = { ...makeUser(email), id: randomUUID() };
    await repo.save(replacement);
    expect((await repo.findByEmail(email))?.id).toBe(replacement.id);
  });

  it('removes an abandoned unverified PG signup', async () => {
    const { db, repo } = await setup();
    const u = makeUser('pg-abandon@x.com');
    await repo.save(u);
    const { workspaceId } = await createWorkspaceInTx(db, { userId: u.id, type: 'pg', name: 'PG' });

    await purgeUnverifiedSignup(db, 'pg-abandon@x.com');

    expect(await repo.findByEmail('pg-abandon@x.com')).toBeUndefined();
    expect(
      (await db.select().from(workspaces).where(eq(workspaces.id, workspaceId))).length,
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

// postgres-js 트랜잭션은 콜백이 unique violation 을 try/catch 로 잡아도 콜백 종료 후
// 다시 던진다(node_modules/postgres scope: `if (uncaughtError) throw uncaughtError`).
// 따라서 INSERT 충돌을 잡아 EMAIL_TAKEN 으로 바꾸는 패턴은 prod 에서 크래시한다.
// 대신 purge 가 "이미 존재해 INSERT 가 불가하다"(blocked)를 INSERT *전에* 알려,
// 호출자가 트랜잭션을 오염시키기 전에 EMAIL_TAKEN 을 반환하게 한다.
describe('purgeUnverifiedSignup → clear|blocked status (INSERT 선검사)', () => {
  it("returns 'clear' for an unknown email (safe to insert)", async () => {
    const { db } = await setup();
    expect(await purgeUnverifiedSignup(db, 'nobody@x.com')).toBe('clear');
  });

  it("returns 'clear' after purging an abandoned unverified signup", async () => {
    const { db, repo } = await setup();
    const u = makeUser('abandon2@x.com');
    await repo.save(u);
    await createWorkspaceInTx(db, { userId: u.id, type: 'buyer', name: 'WS', bizProfile: BIZ });

    expect(await purgeUnverifiedSignup(db, 'abandon2@x.com')).toBe('clear');
  });

  it("returns 'blocked' for a VERIFIED user (email taken)", async () => {
    const { db, repo } = await setup();
    const u = makeUser('verified2@x.com');
    await repo.save(u);
    await repo.markEmailVerified('verified2@x.com');

    expect(await purgeUnverifiedSignup(db, 'verified2@x.com')).toBe('blocked');
  });

  it("returns 'blocked' for an unverified member of an ACTIVE workspace", async () => {
    const { db, repo } = await setup();
    const u = makeUser('invitee2@x.com');
    await repo.save(u);
    const { workspaceId } = await createWorkspaceInTx(db, { userId: u.id, type: 'pg', name: 'WS' });
    await db.update(workspaces).set({ status: 'active' }).where(eq(workspaces.id, workspaceId));

    expect(await purgeUnverifiedSignup(db, 'invitee2@x.com')).toBe('blocked');
  });
});
