import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { rfps } from '@/lib/db/schema';
import { seedUser, seedBuyerWorkspace, seedPgWorkspace, seedRfp } from './_seed';
import { DrizzleSigningContractRepository } from '../signing-contract';
import type { SigningContract, SigningParticipant } from '@/lib/types/signing';

let db: PgliteDB;
beforeEach(async () => {
  db = await createPgliteDb();
});

function makeContract(
  rfpId: string,
  createdBy: string,
  o?: Partial<SigningContract>,
): SigningContract {
  return {
    id: randomUUID(),
    rfpId,
    status: 'sent',
    round: 1,
    createdBy,
    createdAt: new Date().toISOString(),
    ...o,
  };
}

function makeParticipant(
  contractId: string,
  role: 'buyer' | 'pg',
  o?: Partial<SigningParticipant>,
): SigningParticipant {
  return {
    id: randomUUID(),
    contractId,
    name: role === 'buyer' ? '구매담당' : 'PG담당',
    email: `${role}@ex.com`,
    role,
    securityMethod: 'easy_cert',
    status: 'pending',
    ...o,
  };
}

async function setup() {
  const buyer = await seedUser(db);
  const buyerWs = await seedBuyerWorkspace(db);
  const pgWs = await seedPgWorkspace(db, 'pg.io');
  const { id: rfpId } = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyer.id });
  return { buyer, buyerWs, pgWs, rfpId };
}

describe('DrizzleSigningContractRepository', () => {
  it('create → findById returns contract with its participants', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id, { providerRef: 'ct_1', snowsignTemplateId: 'tmpl_1' });
    await repo.create(c, [makeParticipant(c.id, 'buyer'), makeParticipant(c.id, 'pg')]);

    const found = await repo.findById(c.id);
    expect(found?.contract.providerRef).toBe('ct_1');
    expect(found?.contract.snowsignTemplateId).toBe('tmpl_1');
    expect(found?.participants).toHaveLength(2);
    expect(found?.participants.map((p) => p.role).sort()).toEqual(['buyer', 'pg']);
  });

  it('only one ACTIVE contract per RFP (partial unique)', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    await repo.create(makeContract(rfpId, buyer.id, { status: 'sent' }), []);
    await expect(
      repo.create(makeContract(rfpId, buyer.id, { status: 'sent' }), []),
    ).rejects.toBeDefined();
  });

  it('completing frees the RFP for a new round (re-send)', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const first = makeContract(rfpId, buyer.id, { status: 'sent' });
    await repo.create(first, []);
    expect((await repo.findActiveByRfp(rfpId))?.id).toBe(first.id);

    await repo.patchContract(first.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });
    expect(await repo.findActiveByRfp(rfpId)).toBeUndefined();

    const second = makeContract(rfpId, buyer.id, { status: 'sent', round: 2 });
    await repo.create(second, []);
    expect((await repo.findActiveByRfp(rfpId))?.round).toBe(2);
    expect(await repo.findByRfp(rfpId)).toHaveLength(2);
  });

  it('deleting the RFP cascades to contract + participants', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id);
    await repo.create(c, [makeParticipant(c.id, 'buyer')]);
    await db.delete(rfps).where(eq(rfps.id, rfpId));
    expect(await repo.findById(c.id)).toBeUndefined();
  });

  it('findPollable returns sent/in_progress, excludes terminal', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, buyerWs } = await setup();
    const rfpA = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyer.id, code: 'P-2605-0201' });
    const rfpB = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyer.id, code: 'P-2605-0202' });
    const rfpC = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyer.id, code: 'P-2605-0203' });
    await repo.create(makeContract(rfpA.id, buyer.id, { status: 'sent' }), []);
    await repo.create(makeContract(rfpB.id, buyer.id, { status: 'in_progress' }), []);
    await repo.create(
      makeContract(rfpC.id, buyer.id, { status: 'completed', completedAt: new Date().toISOString() }),
      [],
    );

    const pollable = await repo.findPollable(10);
    expect(pollable.map((c) => c.status).sort()).toEqual(['in_progress', 'sent']);
  });

  it('patchParticipant updates status + signedAt', async () => {
    const repo = new DrizzleSigningContractRepository(db);
    const { buyer, rfpId } = await setup();
    const c = makeContract(rfpId, buyer.id);
    const p = makeParticipant(c.id, 'buyer');
    await repo.create(c, [p]);
    const signedAt = new Date();
    await repo.patchParticipant(p.id, { status: 'signed', signedAt: signedAt.toISOString() });
    const found = await repo.findById(c.id);
    expect(found?.participants[0]!.status).toBe('signed');
    expect(found?.participants[0]!.signedAt).toBe(signedAt.toISOString());
  });
});
