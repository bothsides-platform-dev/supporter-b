import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createPgliteDb } from '@/lib/db/client-pglite';
import {
  workspaces,
  pgProfiles, verificationApplications,
  adminNotes, riskFlags, adminAuditLogs, adminUsers, adminPasskeys,
} from '@/lib/db/schema';
import type { PgliteDB } from '@/lib/db/client-pglite';

let db: PgliteDB;
beforeEach(async () => { db = await createPgliteDb(); });

describe('workspaces.status', () => {
  it('defaults to pending on insert', async () => {
    const [ws] = await db.insert(workspaces).values({
      type: 'pg',
      name: '테스트PG',
    }).returning();
    expect(ws.status).toBe('pending');
  });

  it('allows active and suspended values', async () => {
    const [ws] = await db.insert(workspaces).values({
      type: 'buyer',
      name: '테스트구매사',
      status: 'active',
    }).returning();
    expect(ws.status).toBe('active');
  });

  it('allows suspended value', async () => {
    const [ws] = await db.insert(workspaces).values({
      type: 'buyer',
      name: '테스트정지',
      status: 'suspended',
    }).returning();
    expect(ws.status).toBe('suspended');
  });
});

describe('admin tables', () => {
  it('verificationApplications defaults status to submitted', async () => {
    const [ws] = await db.insert(workspaces).values({ type: 'buyer', name: 'B' }).returning();
    const [app] = await db
      .insert(verificationApplications)
      .values({ workspaceId: ws.id, orgType: 'buyer' })
      .returning();
    expect(app.status).toBe('submitted');
    expect(app.reviewedBy).toBeNull();
  });

  it('adminAuditLogs inserts and retrieves', async () => {
    const [ws] = await db.insert(workspaces).values({ type: 'pg', name: 'P' }).returning();
    await db.insert(adminAuditLogs).values({
      actor: 'admin',
      action: 'workspace.approve',
      entityType: 'workspace',
      entityId: ws.id,
      payloadJson: { after: { status: 'active' } },
    });
    const logs = await db.select().from(adminAuditLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('workspace.approve');
  });

  it('pgProfiles inserts with nullable fields', async () => {
    const [ws] = await db.insert(workspaces).values({ type: 'pg', name: 'PG1' }).returning();
    const [profile] = await db
      .insert(pgProfiles)
      .values({ workspaceId: ws.id })
      .returning();
    expect(profile.workspaceId).toBe(ws.id);
    expect(profile.bizNo).toBeNull();
  });

  it('adminNotes and riskFlags insert correctly', async () => {
    const [ws] = await db.insert(workspaces).values({ type: 'buyer', name: 'B2' }).returning();
    const [note] = await db
      .insert(adminNotes)
      .values({ entityType: 'workspace', entityId: ws.id, body: '검토 완료', createdBy: 'admin' })
      .returning();
    expect(note.body).toBe('검토 완료');

    const [flag] = await db
      .insert(riskFlags)
      .values({ entityType: 'workspace', entityId: ws.id, flagType: 'duplicate', severity: 'warning' })
      .returning();
    expect(flag.severity).toBe('warning');
    expect(flag.resolvedAt).toBeNull();
  });
});

describe('admin_users (operator-console allowlist + TOTP)', () => {
  it('inserts an allowlisted email with 2FA not yet enrolled', async () => {
    const [row] = await db.insert(adminUsers).values({ email: 'ops@example.com', createdBy: 'migration:env' }).returning();
    expect(row.id).toBeTruthy();
    expect(row.totpSecretEnc).toBeNull();
    expect(row.totpEnabledAt).toBeNull();
    expect(row.totpLastUsedStep).toBeNull();
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it('stores a TOTP step beyond 32-bit range', async () => {
    const [row] = await db.insert(adminUsers).values({ email: 'step@example.com', totpLastUsedStep: 2 ** 33 }).returning();
    expect(row.totpLastUsedStep).toBe(2 ** 33);
  });

  it('rejects non-lowercase emails', async () => {
    await expect(db.insert(adminUsers).values({ email: 'Ops@Example.com' })).rejects.toThrow();
  });

  it('rejects duplicate emails', async () => {
    await db.insert(adminUsers).values({ email: 'dup@example.com' });
    await expect(db.insert(adminUsers).values({ email: 'dup@example.com' })).rejects.toThrow();
  });
});

describe('admin_passkeys (operator-console WebAuthn second factor)', () => {
  const passkey = (adminUserId: string, credentialId: string) => ({
    adminUserId, credentialId, publicKey: 'pk', backupEligible: true, backedUp: false,
    aaguid: '00000000-0000-0000-0000-000000000000', label: '회사 맥북',
  });

  it('stores a credential with a zero counter and no use yet', async () => {
    const [admin] = await db.insert(adminUsers).values({ email: 'passkey@example.com' }).returning();
    const [row] = await db
      .insert(adminPasskeys)
      .values({ ...passkey(admin.id, 'cred-1'), transports: ['internal', 'hybrid'] })
      .returning();
    expect(row.signCount).toBe(0);
    expect(row.transports).toEqual(['internal', 'hybrid']);
    expect(row.lastUsedAt).toBeNull();
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it('stores a signature counter beyond 32-bit signed range', async () => {
    const [admin] = await db.insert(adminUsers).values({ email: 'counter@example.com' }).returning();
    const [row] = await db
      .insert(adminPasskeys)
      .values({ ...passkey(admin.id, 'cred-counter'), signCount: 2 ** 32 - 1 })
      .returning();
    expect(row.signCount).toBe(2 ** 32 - 1);
  });

  it('rejects a credential id that is already registered, even for another admin', async () => {
    const [first] = await db.insert(adminUsers).values({ email: 'first@example.com' }).returning();
    const [second] = await db.insert(adminUsers).values({ email: 'second@example.com' }).returning();
    await db.insert(adminPasskeys).values(passkey(first.id, 'cred-dup'));
    await expect(db.insert(adminPasskeys).values(passkey(second.id, 'cred-dup'))).rejects.toThrow();
  });

  it('is removed together with its admin', async () => {
    const [admin] = await db.insert(adminUsers).values({ email: 'gone@example.com' }).returning();
    await db.insert(adminPasskeys).values(passkey(admin.id, 'cred-gone'));
    await db.delete(adminUsers).where(eq(adminUsers.id, admin.id));
    expect(await db.select().from(adminPasskeys)).toHaveLength(0);
  });
});
