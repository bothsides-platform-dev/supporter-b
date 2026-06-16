import { describe, expect, it, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { users, rfps, rfpInvitations } from '@/lib/db/schema';
import { DrizzleUserRepository } from '../user';
import { DrizzleRfpRepository } from '../rfp';
import { DrizzleInvitationRepository } from '../invitation';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedUser,
} from './_seed';

// Repo methods added for the onboarding seeders (sample-rfp / sample-pg-rfp).
let db: PgliteDB;
beforeEach(async () => {
  db = await createPgliteDb();
});

describe('UserRepo.createSystemAccount', () => {
  it('inserts a non-login demo/system account (passwordHash "!", isSystemAccount, emailVerified)', async () => {
    const repo = new DrizzleUserRepository(db);
    const id = randomUUID();
    await repo.createSystemAccount({ id, email: 'demo-pg-a@sample.invalid', name: '샘플페이 A' });
    const [row] = await db.select().from(users).where(eq(users.id, id));
    expect(row.email).toBe('demo-pg-a@sample.invalid');
    expect(row.name).toBe('샘플페이 A');
    // 데모 계정은 절대 인증되지 않아야 한다 — 사용 불가 passwordHash
    expect(row.passwordHash).toBe('!');
    expect(row.isSystemAccount).toBe(true);
    expect(row.emailVerified).toBe(true);
  });
});

describe('RfpRepo.insertNew with isSample', () => {
  it('persists isSample=true when requested (default false otherwise)', async () => {
    const repo = new DrizzleRfpRepository(db);
    const u = await seedUser(db);
    const ws = await seedBuyerWorkspace(db);

    const sampleId = randomUUID();
    await repo.insertNew({
      id: sampleId,
      code: 'P-2605-9001',
      buyerWsId: ws.id,
      bizProfileId: null,
      title: '샘플',
      memo: '',
      websiteUrl: null,
      mainProducts: null,
      annualPgVolume: null,
      currentFeeRate: null,
      currentSettlementLimit: null,
      currentGuaranteeInsurance: null,
      currentSettlementCycle: null,
      deliveryServicePeriod: null,
      boardVisible: false,
      currentFeeVisibleToPg: true,
      contractType: null,
      currentSolution: null,
      currentSolutionDetail: null,
      deadline: new Date(Date.now() + 86_400_000),
      status: 'sent',
      requiredPaymentMethods: ['card'],
      customPaymentMethods: [],
      createdBy: u.id,
      sentAt: new Date(),
      isSample: true,
    });
    const [sample] = await db.select().from(rfps).where(eq(rfps.id, sampleId));
    expect(sample.isSample).toBe(true);

    const plainId = randomUUID();
    await repo.insertNew({
      id: plainId,
      code: 'P-2605-9002',
      buyerWsId: ws.id,
      bizProfileId: null,
      title: '일반',
      memo: '',
      websiteUrl: null,
      mainProducts: null,
      annualPgVolume: null,
      currentFeeRate: null,
      currentSettlementLimit: null,
      currentGuaranteeInsurance: null,
      currentSettlementCycle: null,
      deliveryServicePeriod: null,
      boardVisible: true,
      currentFeeVisibleToPg: true,
      contractType: null,
      currentSolution: null,
      currentSolutionDetail: null,
      deadline: new Date(Date.now() + 86_400_000),
      status: 'draft',
      requiredPaymentMethods: [],
      customPaymentMethods: [],
      createdBy: u.id,
      sentAt: null,
    });
    const [plain] = await db.select().from(rfps).where(eq(rfps.id, plainId));
    expect(plain.isSample).toBe(false);
  });
});

describe('RfpRepo.deleteById', () => {
  it('hard-deletes the RFP row by id', async () => {
    const repo = new DrizzleRfpRepository(db);
    const u = await seedUser(db);
    const ws = await seedBuyerWorkspace(db);
    const id = randomUUID();
    await repo.insertNew({
      id,
      code: 'P-2605-9003',
      buyerWsId: ws.id,
      bizProfileId: null,
      title: 'del',
      memo: '',
      websiteUrl: null,
      mainProducts: null,
      annualPgVolume: null,
      currentFeeRate: null,
      currentSettlementLimit: null,
      currentGuaranteeInsurance: null,
      currentSettlementCycle: null,
      deliveryServicePeriod: null,
      boardVisible: true,
      currentFeeVisibleToPg: true,
      contractType: null,
      currentSolution: null,
      currentSolutionDetail: null,
      deadline: new Date(Date.now() + 86_400_000),
      status: 'draft',
      requiredPaymentMethods: [],
      customPaymentMethods: [],
      createdBy: u.id,
      sentAt: null,
    });
    await repo.deleteById(id);
    expect(await db.select().from(rfps).where(eq(rfps.id, id))).toHaveLength(0);
  });
});

describe('InvitationRepo.insertAccepted', () => {
  it('inserts an accepted invitation with the given (raw) tokenHash + acceptedByUserId', async () => {
    const invRepo = new DrizzleInvitationRepository(db);
    const rfpRepo = new DrizzleRfpRepository(db);
    const u = await seedUser(db);
    const ws = await seedBuyerWorkspace(db);
    const pg = await seedPgWorkspace(db, 'PG');
    const rfpId = randomUUID();
    await rfpRepo.insertNew({
      id: rfpId,
      code: 'P-2605-9004',
      buyerWsId: ws.id,
      bizProfileId: null,
      title: 'inv',
      memo: '',
      websiteUrl: null,
      mainProducts: null,
      annualPgVolume: null,
      currentFeeRate: null,
      currentSettlementLimit: null,
      currentGuaranteeInsurance: null,
      currentSettlementCycle: null,
      deliveryServicePeriod: null,
      boardVisible: false,
      currentFeeVisibleToPg: true,
      contractType: null,
      currentSolution: null,
      currentSolutionDetail: null,
      deadline: new Date(Date.now() + 86_400_000),
      status: 'sent',
      requiredPaymentMethods: [],
      customPaymentMethods: [],
      createdBy: u.id,
      sentAt: new Date(),
    });

    const invId = randomUUID();
    const tokenHash = randomUUID();
    const now = new Date();
    const expiresAt = new Date(Date.now() + 86_400_000);
    await invRepo.insertAccepted({
      id: invId,
      rfpId,
      pgWsId: pg.id,
      acceptedByUserId: u.id,
      tokenHash,
      sentAt: now,
      expiresAt,
    });
    const [row] = await db.select().from(rfpInvitations).where(eq(rfpInvitations.id, invId));
    expect(row.status).toBe('accepted');
    expect(row.pgWsId).toBe(pg.id);
    expect(row.acceptedByUserId).toBe(u.id);
    expect(row.tokenHash).toBe(tokenHash);
  });
});

// suppress unused import lint for the shared helper bundle.
void seedBizProfile;
