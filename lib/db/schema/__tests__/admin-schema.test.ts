import { describe, it, expect, beforeEach } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import {
  workspaces,
  pgProfiles, verificationApplications,
  adminNotes, riskFlags, adminAuditLogs,
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
