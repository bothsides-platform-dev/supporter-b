import { describe, expect, it, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { workspaces } from '@/lib/db/schema';
import { DrizzleWorkspaceRepository } from '../workspace';
import {
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedUser,
  seedMembership,
} from './_seed';

// Onboarding-seed support methods (demo PG/buyer + sampleSeededAt gating + backfill).
describe('DrizzleWorkspaceRepository — onboarding seed support', () => {
  let repo: DrizzleWorkspaceRepository;
  let db: PgliteDB;

  beforeEach(async () => {
    db = await createPgliteDb();
    repo = new DrizzleWorkspaceRepository(db);
  });

  describe('createDemo', () => {
    it('inserts an active, isDemo workspace (status active, isDemo true)', async () => {
      const id = randomUUID();
      await repo.createDemo({ id, type: 'pg', name: '샘플페이 X', bizProfileId: null });
      const [row] = await db.select().from(workspaces).where(eq(workspaces.id, id));
      expect(row.type).toBe('pg');
      expect(row.name).toBe('샘플페이 X');
      expect(row.status).toBe('active');
      expect(row.isDemo).toBe(true);
      expect(row.bizProfileId).toBeNull();
    });

    it('carries a bizProfileId when provided', async () => {
      const id = randomUUID();
      // a buyer demo points at a biz profile (must exist due to FK).
      const { seedBizProfile } = await import('./_seed');
      const biz = await seedBizProfile(db);
      await repo.createDemo({ id, type: 'buyer', name: '샘플 쇼핑몰', bizProfileId: biz.id });
      const [row] = await db.select().from(workspaces).where(eq(workspaces.id, id));
      expect(row.type).toBe('buyer');
      expect(row.bizProfileId).toBe(biz.id);
    });
  });

  describe('findDemoByName', () => {
    it('finds a demo workspace by name (and optional type), ignoring non-demo same-name', async () => {
      const demoId = randomUUID();
      await repo.createDemo({ id: demoId, type: 'pg', name: '샘플페이 A', bizProfileId: null });
      // a non-demo ws with the same name must NOT match.
      await seedPgWorkspace(db, '샘플페이 A');

      const found = await repo.findDemoByName('샘플페이 A');
      expect(found?.id).toBe(demoId);

      const missing = await repo.findDemoByName('없는이름');
      expect(missing).toBeUndefined();
    });

    it('filters by type when given', async () => {
      const buyerId = randomUUID();
      await repo.createDemo({ id: buyerId, type: 'buyer', name: '샘플 쇼핑몰', bizProfileId: null });
      const pgId = randomUUID();
      await repo.createDemo({ id: pgId, type: 'pg', name: '샘플 쇼핑몰', bizProfileId: null });

      const found = await repo.findDemoByName('샘플 쇼핑몰', 'buyer');
      expect(found?.id).toBe(buyerId);
    });
  });

  describe('firstMemberUserId', () => {
    it('returns the first member user id, or undefined when none', async () => {
      const ws = await seedPgWorkspace(db, 'WS');
      const u = await seedUser(db);
      await seedMembership(db, ws.id, u.id, 'admin');
      expect(await repo.firstMemberUserId(ws.id)).toBe(u.id);

      const empty = await seedPgWorkspace(db, 'EMPTY');
      expect(await repo.firstMemberUserId(empty.id)).toBeUndefined();
    });
  });

  describe('getSampleSeededState', () => {
    it('returns { sampleSeededAt: null } for a fresh ws and undefined for a missing ws', async () => {
      const ws = await seedBuyerWorkspace(db);
      const state = await repo.getSampleSeededState(ws.id);
      expect(state).toEqual({ sampleSeededAt: null });
      expect(await repo.getSampleSeededState(randomUUID())).toBeUndefined();
    });

    it('reflects a seeded timestamp', async () => {
      const ws = await seedBuyerWorkspace(db);
      const at = new Date();
      await repo.markSampleSeeded(ws.id, at);
      const state = await repo.getSampleSeededState(ws.id);
      expect(state?.sampleSeededAt).not.toBeNull();
    });
  });

  describe('listWsNeedingSample', () => {
    it('lists non-demo workspaces of a type with no sampleSeededAt; excludes demo + already-seeded + other type', async () => {
      const buyer = await seedBuyerWorkspace(db);
      const seeded = await seedBuyerWorkspace(db);
      await repo.markSampleSeeded(seeded.id, new Date());
      const pg = await seedPgWorkspace(db, 'PG');
      const demoId = randomUUID();
      await repo.createDemo({ id: demoId, type: 'buyer', name: '데모', bizProfileId: null });

      const ids = (await repo.listWsNeedingSample('buyer')).map((r) => r.id);
      expect(ids).toContain(buyer.id);
      expect(ids).not.toContain(seeded.id);
      expect(ids).not.toContain(pg.id);
      expect(ids).not.toContain(demoId);
    });
  });

  describe('findAdminMemberUserId', () => {
    it('returns an admin member user id, undefined when only non-admins', async () => {
      const ws = await seedPgWorkspace(db, 'WS');
      const admin = await seedUser(db);
      await seedMembership(db, ws.id, admin.id, 'admin');
      expect(await repo.findAdminMemberUserId(ws.id)).toBe(admin.id);

      const ws2 = await seedPgWorkspace(db, 'WS2');
      const member = await seedUser(db);
      await seedMembership(db, ws2.id, member.id, 'member');
      expect(await repo.findAdminMemberUserId(ws2.id)).toBeUndefined();
    });
  });
});
