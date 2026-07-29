import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { bids, rfpInvitations, signingContracts } from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { seedUser, seedPgWorkspace, seedBuyerWorkspace, seedRfp } from './_seed';
import { generateToken, hashToken, addMinutes } from '../../../token';
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
    createdBy,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/** 템플릿을 참조하는 bid 1건 + 발송된 signing_contract 1건을 만든다. */
async function seedBidAndContract(
  pgWsId: string,
  userId: string,
  opts: { signingTemplateId: string; snowsignTemplateId: string },
) {
  const buyerWs = await seedBuyerWorkspace(db);
  const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: userId });

  const invitationId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invitationId,
    rfpId: rfp.id,
    pgWsId,
    acceptedByUserId: userId,
    tokenHash: hashToken(generateToken()),
    sentAt: new Date(),
    expiresAt: new Date(addMinutes(new Date(), 7 * 24 * 60)),
    status: 'accepted',
  });

  const bidId = randomUUID();
  await db.insert(bids).values({
    id: bidId,
    rfpId: rfp.id,
    pgWsId,
    invitationId,
    settleCycle: 'D+1',
    settleLimit: '0',
    guaranteeInsurance: '0',
    paymentFees: {},
    submittedBy: userId,
    signingTemplateId: opts.signingTemplateId,
  });

  const contractId = randomUUID();
  await db.insert(signingContracts).values({
    id: contractId,
    rfpId: rfp.id,
    providerRef: 'ct_1',
    snowsignTemplateId: opts.snowsignTemplateId,
    status: 'sent',
    createdBy: userId,
  });

  return { bidId, contractId };
}

describe('DrizzlePgSigningTemplateRepository', () => {
  it('create → findByWorkspace returns it with jsonb mappings intact', async () => {
    const repo = new DrizzlePgSigningTemplateRepository(db);
    const user = await seedUser(db);
    const pgWs = await seedPgWorkspace(db, 'pg.io');
    const tmpl = makeTemplate(pgWs.id, user.id);
    await repo.create(tmpl);

    const found = await repo.findByWorkspace(pgWs.id);
    expect(found).toHaveLength(1);
    expect(found[0]!.snowsignTemplateId).toBe(tmpl.snowsignTemplateId);
    expect(found[0]!.roleMapping).toEqual({ 구매사: 'buyer', PG: 'pg' });
    expect(found[0]!.variableMapping).toEqual({ 수수료율: 'bid.cardFeeRate' });
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

  it('updateName renames only within the owning workspace', async () => {
    const repo = new DrizzlePgSigningTemplateRepository(db);
    const user = await seedUser(db);
    const pgA = await seedPgWorkspace(db, 'a.io');
    const pgB = await seedPgWorkspace(db, 'b.io');
    const tmplA = makeTemplate(pgA.id, user.id);
    await repo.create(tmplA);

    // 타 워크스페이스는 남의 템플릿 이름을 못 바꾼다
    expect(await repo.updateName(tmplA.id, pgB.id, '탈취')).toBe(false);
    expect((await repo.findByIdScoped(tmplA.id, pgA.id))?.name).toBe('표준 가맹계약서');

    expect(await repo.updateName(tmplA.id, pgA.id, '가맹계약서 v3')).toBe(true);
    expect((await repo.findByIdScoped(tmplA.id, pgA.id))?.name).toBe('가맹계약서 v3');
  });

  it('remove deletes only within the owning workspace', async () => {
    const repo = new DrizzlePgSigningTemplateRepository(db);
    const user = await seedUser(db);
    const pgA = await seedPgWorkspace(db, 'a.io');
    const pgB = await seedPgWorkspace(db, 'b.io');
    const tmplA = makeTemplate(pgA.id, user.id);
    await repo.create(tmplA);

    expect(await repo.remove(tmplA.id, pgB.id)).toBe(false);
    expect(await repo.findByIdScoped(tmplA.id, pgA.id)).toBeDefined();

    expect(await repo.remove(tmplA.id, pgA.id)).toBe(true);
    expect(await repo.findByIdScoped(tmplA.id, pgA.id)).toBeUndefined();
  });

  it('remove clears the bid pre-selection but keeps sent-contract history', async () => {
    const repo = new DrizzlePgSigningTemplateRepository(db);
    const user = await seedUser(db);
    const pgWs = await seedPgWorkspace(db, 'pg.io');
    const tmpl = makeTemplate(pgWs.id, user.id, { snowsignTemplateId: 'tmpl_used' });
    await repo.create(tmpl);
    const { bidId, contractId } = await seedBidAndContract(pgWs.id, user.id, {
      signingTemplateId: tmpl.id,
      snowsignTemplateId: 'tmpl_used',
    });

    expect(await repo.remove(tmpl.id, pgWs.id)).toBe(true);

    // 견적의 사전 선택은 풀린다 (ON DELETE SET NULL)
    const [bidRow] = await db.select().from(bids).where(eq(bids.id, bidId));
    expect(bidRow!.signingTemplateId).toBeNull();

    // 이미 보낸 계약의 provider 측 이력은 남는다 (FK 없는 opaque text 사본)
    const [cRow] = await db.select().from(signingContracts).where(eq(signingContracts.id, contractId));
    expect(cRow!.snowsignTemplateId).toBe('tmpl_used');
    expect(cRow!.status).toBe('sent');
  });

  it('a deleted template can be linked again (UNIQUE survives delete)', async () => {
    const repo = new DrizzlePgSigningTemplateRepository(db);
    const user = await seedUser(db);
    const pgWs = await seedPgWorkspace(db, 'pg.io');
    const tmpl = makeTemplate(pgWs.id, user.id, { snowsignTemplateId: 'tmpl_reuse' });
    await repo.create(tmpl);
    await repo.remove(tmpl.id, pgWs.id);

    await repo.create(makeTemplate(pgWs.id, user.id, { snowsignTemplateId: 'tmpl_reuse' }));
    expect(await repo.findByWorkspace(pgWs.id)).toHaveLength(1);
  });
});
