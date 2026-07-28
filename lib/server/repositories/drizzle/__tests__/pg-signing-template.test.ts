import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { seedUser, seedPgWorkspace } from './_seed';
import { DrizzlePgSigningTemplateRepository } from '../pg-signing-template';
import type { PgSigningTemplate } from '@/lib/types/signing';

let db: PgliteDB;
beforeEach(async () => {
  db = await createPgliteDb();
});

function makeTemplate(
  workspaceId: string,
  createdBy: string,
  overrides?: Partial<PgSigningTemplate>,
): PgSigningTemplate {
  return {
    id: randomUUID(),
    workspaceId,
    snowsignTemplateId: `tmpl_${randomUUID().slice(0, 8)}`,
    name: '표준 가맹계약서',
    roleMapping: { 구매사: 'buyer', PG: 'pg' },
    variableMapping: { 수수료율: 'bid.cardFeeRate' },
    isDefault: false,
    createdBy,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('DrizzlePgSigningTemplateRepository', () => {
  it('create → findByWorkspace returns it with jsonb mappings intact', async () => {
    const repo = new DrizzlePgSigningTemplateRepository(db);
    const user = await seedUser(db);
    const pgWs = await seedPgWorkspace(db, 'pg.io');
    const tmpl = makeTemplate(pgWs.id, user.id, { isDefault: true });
    await repo.create(tmpl);

    const found = await repo.findByWorkspace(pgWs.id);
    expect(found).toHaveLength(1);
    expect(found[0]!.snowsignTemplateId).toBe(tmpl.snowsignTemplateId);
    expect(found[0]!.roleMapping).toEqual({ 구매사: 'buyer', PG: 'pg' });
    expect(found[0]!.variableMapping).toEqual({ 수수료율: 'bid.cardFeeRate' });
    expect(found[0]!.isDefault).toBe(true);
  });

  it('findByWorkspace / findByIdScoped are org-scoped (other PG cannot see)', async () => {
    const repo = new DrizzlePgSigningTemplateRepository(db);
    const user = await seedUser(db);
    const pgA = await seedPgWorkspace(db, 'a.io');
    const pgB = await seedPgWorkspace(db, 'b.io');
    const tmplA = makeTemplate(pgA.id, user.id);
    await repo.create(tmplA);

    // B's listing is empty
    expect(await repo.findByWorkspace(pgB.id)).toHaveLength(0);
    // B cannot fetch A's template by id (org-scoping)
    expect(await repo.findByIdScoped(tmplA.id, pgB.id)).toBeUndefined();
    // A can
    expect((await repo.findByIdScoped(tmplA.id, pgA.id))?.id).toBe(tmplA.id);
  });

  it('findBySnowsignTemplateId finds the owner across workspaces (cross-tenant link guard)', async () => {
    const repo = new DrizzlePgSigningTemplateRepository(db);
    const user = await seedUser(db);
    const pgA = await seedPgWorkspace(db, 'a.io');
    const tmplA = makeTemplate(pgA.id, user.id, { snowsignTemplateId: 'tmpl_shared' });
    await repo.create(tmplA);

    const owner = await repo.findBySnowsignTemplateId('tmpl_shared');
    expect(owner?.workspaceId).toBe(pgA.id);
    expect(await repo.findBySnowsignTemplateId('tmpl_unlinked')).toBeUndefined();
  });

  it('findDefaultByWorkspace returns the default template', async () => {
    const repo = new DrizzlePgSigningTemplateRepository(db);
    const user = await seedUser(db);
    const pgWs = await seedPgWorkspace(db, 'pg.io');
    await repo.create(makeTemplate(pgWs.id, user.id, { isDefault: false }));
    const def = makeTemplate(pgWs.id, user.id, { isDefault: true });
    await repo.create(def);

    expect((await repo.findDefaultByWorkspace(pgWs.id))?.id).toBe(def.id);
  });
});
