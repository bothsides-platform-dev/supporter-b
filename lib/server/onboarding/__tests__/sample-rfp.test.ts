import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { __resetForTest, __useDrizzleWithDbForTest } from '@/lib/server/repositories/factory';
import { workspaces, workspaceMembers, users, rfps, bids, rfpInvitations, rfpAllowedPg } from '@/lib/db/schema';
import { seedBuyerWorkspace, seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { ensureDemoPgs, DEMO_PG_NAMES, seedSampleRfpInTx } from '../sample-rfp';

let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});

describe('ensureDemoPgs', () => {
  it('creates 3 demo PG workspaces + demo users, idempotently', async () => {
    const first = await db.transaction((tx) => ensureDemoPgs(tx));
    expect(first).toHaveLength(3);
    expect(first.map((d) => d.name)).toEqual([...DEMO_PG_NAMES]);

    const second = await db.transaction((tx) => ensureDemoPgs(tx));
    // same workspace ids returned (no duplicates created)
    expect(second.map((d) => d.wsId).sort()).toEqual(first.map((d) => d.wsId).sort());

    const demoWs = await db.select().from(workspaces).where(eq(workspaces.isDemo, true));
    expect(demoWs).toHaveLength(3);
    const sys = await db.select().from(users).where(eq(users.isSystemAccount, true));
    expect(sys).toHaveLength(3);
    // 데모 계정은 절대 인증되지 않아야 한다 — 사용 불가 passwordHash
    expect(sys.every((u) => u.passwordHash === '!')).toBe(true);
    // each demo ws has an admin membership
    for (const d of first) {
      const [m] = await db
        .select()
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, d.wsId), eq(workspaceMembers.userId, d.userId)));
      expect(m.role).toBe('admin');
    }
  });
});

describe('seedSampleRfpInTx', () => {
  it('seeds 1 sample RFP (sent, boardVisible=false) + 3 submitted bids + invites + allowlist, sets sampleSeededAt', async () => {
    const u = await seedUser(db);
    const ws = await seedBuyerWorkspace(db);
    const r = await db.transaction((tx) =>
      seedSampleRfpInTx(tx, { buyerWsId: ws.id, buyerUserId: u.id }),
    );
    expect(r.seeded).toBe(true);

    const [rfp] = await db.select().from(rfps).where(eq(rfps.id, r.rfpId!));
    expect(rfp.isSample).toBe(true);
    expect(rfp.status).toBe('sent');
    expect(rfp.boardVisible).toBe(false);
    expect(rfp.buyerWsId).toBe(ws.id);

    const bidRows = await db.select().from(bids).where(eq(bids.rfpId, r.rfpId!));
    expect(bidRows).toHaveLength(3);
    expect(bidRows.every((b) => b.status === 'submitted')).toBe(true);

    const invRows = await db.select().from(rfpInvitations).where(eq(rfpInvitations.rfpId, r.rfpId!));
    expect(invRows).toHaveLength(3);
    expect(invRows.every((iv) => iv.status === 'accepted')).toBe(true);

    const allow = await db.select().from(rfpAllowedPg).where(eq(rfpAllowedPg.rfpId, r.rfpId!));
    expect(allow).toHaveLength(3);

    const [w] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
    expect(w.sampleSeededAt).not.toBeNull();
  });

  it('is idempotent — second call is a no-op when sampleSeededAt is set', async () => {
    const u = await seedUser(db);
    const ws = await seedBuyerWorkspace(db);
    await db.transaction((tx) => seedSampleRfpInTx(tx, { buyerWsId: ws.id, buyerUserId: u.id }));
    const second = await db.transaction((tx) =>
      seedSampleRfpInTx(tx, { buyerWsId: ws.id, buyerUserId: u.id }),
    );
    expect(second.seeded).toBe(false);
    const all = await db.select().from(rfps).where(eq(rfps.buyerWsId, ws.id));
    expect(all).toHaveLength(1);
  });
});
