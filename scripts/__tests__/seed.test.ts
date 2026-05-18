// Step 12 seed verification — runs runSeed() against an in-process pglite db
// and asserts row counts across all 13 tables match the documented contract.
import { describe, expect, it, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { runSeed, type SeedResult } from '../seed';

async function count(db: PgliteDB, table: string): Promise<number> {
  const rows = await db.execute(sql.raw(`SELECT count(*)::int AS c FROM ${table}`));
  // pglite execute returns { rows: [...] }; postgres-js returns the array directly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arr: any[] = Array.isArray(rows) ? rows : (rows as any).rows ?? [];
  return Number(arr[0]?.c ?? 0);
}

describe('scripts/seed.ts', () => {
  let db: PgliteDB;
  let result: SeedResult;

  beforeAll(async () => {
    db = await createPgliteDb();
    result = await runSeed(db);
  });

  it('returns the documented summary counts', () => {
    expect(result.workspaces).toBe(4);
    expect(result.users).toBe(4);
    expect(result.members).toBe(4);
    expect(result.bizProfiles).toBe(2);
    expect(result.rfps).toBe(3);
    expect(result.invitations).toBe(4);
    expect(result.bids).toBe(2);
    expect(result.contracts).toBe(0);
    expect(result.notifications).toBe(0);
    expect(result.outbox).toBe(0);
    expect(result.attachments).toBe(0);
    expect(result.verificationTokens).toBe(0);
    expect(result.rfpCounters).toBe(2);
    expect(result.loginCredentials).toHaveLength(4);
  });

  it('inserts 4 workspaces (1 buyer + 3 PG)', async () => {
    expect(await count(db, 'workspaces')).toBe(4);
    const buyer = await db.execute(
      sql`SELECT count(*)::int AS c FROM workspaces WHERE type = 'buyer'`,
    );
    const pg = await db.execute(
      sql`SELECT count(*)::int AS c FROM workspaces WHERE type = 'pg'`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buyerRows: any[] = Array.isArray(buyer) ? buyer : (buyer as any).rows ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pgRows: any[] = Array.isArray(pg) ? pg : (pg as any).rows ?? [];
    expect(buyerRows[0].c).toBe(1);
    expect(pgRows[0].c).toBe(3);
  });

  it('inserts 4 users + 4 workspace_members', async () => {
    expect(await count(db, 'users')).toBe(4);
    expect(await count(db, 'workspace_members')).toBe(4);
  });

  it('inserts 2 biz_profiles (buyer + RFP snapshot)', async () => {
    expect(await count(db, 'biz_profiles')).toBe(2);
  });

  it('inserts 3 RFPs (2 sent + 1 draft)', async () => {
    expect(await count(db, 'rfps')).toBe(3);
    const sent = await db.execute(
      sql`SELECT count(*)::int AS c FROM rfps WHERE status = 'sent'`,
    );
    const draft = await db.execute(
      sql`SELECT count(*)::int AS c FROM rfps WHERE status = 'draft'`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sentRows: any[] = Array.isArray(sent) ? sent : (sent as any).rows ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const draftRows: any[] = Array.isArray(draft) ? draft : (draft as any).rows ?? [];
    expect(sentRows[0].c).toBe(2);
    expect(draftRows[0].c).toBe(1);
  });

  it('inserts 4 invitations (3 accepted: toss/inicis on P-2604, toss on P-2605-0002; kakao pending)', async () => {
    expect(await count(db, 'rfp_invitations')).toBe(4);
    const accepted = await db.execute(
      sql`SELECT count(*)::int AS c FROM rfp_invitations WHERE status = 'accepted'`,
    );
    const pending = await db.execute(
      sql`SELECT count(*)::int AS c FROM rfp_invitations WHERE status = 'pending'`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acceptedRows: any[] = Array.isArray(accepted) ? accepted : (accepted as any).rows ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pendingRows: any[] = Array.isArray(pending) ? pending : (pending as any).rows ?? [];
    expect(acceptedRows[0].c).toBe(3);
    expect(pendingRows[0].c).toBe(1);
  });

  it('inserts 2 bids (toss + inicis submitted, kakao did not bid)', async () => {
    expect(await count(db, 'bids')).toBe(2);
  });

  it('leaves contracts/notifications/outbox/attachments/verification_tokens empty', async () => {
    expect(await count(db, 'contracts')).toBe(0);
    expect(await count(db, 'notifications')).toBe(0);
    expect(await count(db, 'outbox_entries')).toBe(0);
    expect(await count(db, 'attachments')).toBe(0);
    expect(await count(db, 'verification_tokens')).toBe(0);
  });

  it('inserts rfp_counters with 2604=1 and 2605=2', async () => {
    const rows = await db.execute(
      sql`SELECT year_month, last_seq FROM rfp_counters ORDER BY year_month`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr: any[] = Array.isArray(rows) ? rows : (rows as any).rows ?? [];
    expect(arr).toHaveLength(2);
    const byMonth = Object.fromEntries(arr.map((r) => [r.year_month, r.last_seq]));
    expect(byMonth['2604']).toBe(1);
    expect(byMonth['2605']).toBe(2);
  });

  it('is idempotent — re-running TRUNCATEs and re-inserts the same counts', async () => {
    const before = await count(db, 'workspaces');
    expect(before).toBe(4);
    const second = await runSeed(db);
    expect(second.workspaces).toBe(4);
    expect(await count(db, 'workspaces')).toBe(4);
    expect(await count(db, 'users')).toBe(4);
    expect(await count(db, 'rfp_invitations')).toBe(4);
  });
});
