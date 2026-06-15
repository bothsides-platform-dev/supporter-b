// DrizzleVerificationApplicationRepository — admin-review application row
// created when a workspace is provisioned (mirrors the insert in
// _createWorkspace.ts). status defaults to 'submitted' at the DB level.
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { verificationApplications } from '@/lib/db/schema';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzleVerificationApplicationRepository } from '../verification-application';
import { seedBuyerWorkspace, seedPgWorkspace } from './_seed';

async function setup() {
  const db = await createPgliteDb();
  return { db, repo: new DrizzleVerificationApplicationRepository(db) };
}

describe('DrizzleVerificationApplicationRepository', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('create() inserts a buyer application row with default status', async () => {
    const ws = await seedBuyerWorkspace(ctx.db);
    const id = randomUUID();
    await ctx.repo.create({ id, workspaceId: ws.id, orgType: 'buyer' });

    const [row] = await ctx.db
      .select()
      .from(verificationApplications)
      .where(eq(verificationApplications.id, id));
    expect(row.id).toBe(id);
    expect(row.workspaceId).toBe(ws.id);
    expect(row.orgType).toBe('buyer');
    expect(row.status).toBe('submitted');
    expect(row.reviewedAt).toBeNull();
    expect(row.submittedAt).toBeInstanceOf(Date);
  });

  it('create() inserts a pg application row', async () => {
    const ws = await seedPgWorkspace(ctx.db, 'pg.im');
    const id = randomUUID();
    await ctx.repo.create({ id, workspaceId: ws.id, orgType: 'pg' });

    const [row] = await ctx.db
      .select()
      .from(verificationApplications)
      .where(eq(verificationApplications.id, id));
    expect(row.orgType).toBe('pg');
    expect(row.workspaceId).toBe(ws.id);
  });
});
