import { describe, it, expect, beforeEach } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { workspaces, rfps, verificationApplications } from '@/lib/db/schema';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { getDashboardStats, getHotlist } from '../dashboard';
import { seedUser, seedBuyerWorkspace } from '@/lib/server/repositories/drizzle/__tests__/_seed';

let db: PgliteDB;
beforeEach(async () => {
  db = await createPgliteDb();
});

describe('getDashboardStats', () => {
  it('pendingReviewCount: 대기 중 워크스페이스 수를 반환한다', async () => {
    // Insert two pending workspaces (status defaults to 'pending' in schema)
    await db.insert(workspaces).values({ type: 'buyer', name: '대기 구매사 1' });
    await db.insert(workspaces).values({ type: 'pg', name: '대기 PG사 1' });

    const stats = await getDashboardStats(db);
    expect(stats.pendingReviewCount).toBe(2);
  });

  it('pendingReviewCount: 활성 워크스페이스는 카운트에 포함하지 않는다', async () => {
    // active workspace — should NOT be counted
    await seedBuyerWorkspace(db, { name: '활성 구매사' });
    // pending workspace — should be counted
    await db.insert(workspaces).values({ type: 'pg', name: '대기 PG사' });

    const stats = await getDashboardStats(db);
    expect(stats.pendingReviewCount).toBe(1);
  });

  it('activeRfpCount: 진행 중(sent) RFP 수를 반환한다', async () => {
    const user = await seedUser(db);
    const ws = await seedBuyerWorkspace(db);

    // Insert one sent RFP and one draft RFP
    await db.insert(rfps).values({
      code: 'P-2605-0001',
      buyerWsId: ws.id,
      title: '진행 중 RFP',
      deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      createdBy: user.id,
      status: 'sent',
    });
    await db.insert(rfps).values({
      code: 'P-2605-0002',
      buyerWsId: ws.id,
      title: '초안 RFP',
      deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      createdBy: user.id,
      status: 'draft',
    });

    const stats = await getDashboardStats(db);
    expect(stats.activeRfpCount).toBe(1);
  });

  it('activeRfpCount: 빈 DB에서 0을 반환한다', async () => {
    const stats = await getDashboardStats(db);
    expect(stats.activeRfpCount).toBe(0);
  });

  it('slaOverdueCount: 24시간 초과된 submitted 심사 수를 반환한다', async () => {
    const ws = await seedBuyerWorkspace(db);

    // submittedAt > 24h ago → overdue
    const overdueTime = new Date(Date.now() - 25 * 3600 * 1000);
    await db.insert(verificationApplications).values({
      workspaceId: ws.id,
      orgType: 'buyer',
      status: 'submitted',
      submittedAt: overdueTime,
    });

    // submittedAt < 24h ago → not overdue
    const recentTime = new Date(Date.now() - 1 * 3600 * 1000);
    await db.insert(verificationApplications).values({
      workspaceId: ws.id,
      orgType: 'buyer',
      status: 'submitted',
      submittedAt: recentTime,
    });

    const stats = await getDashboardStats(db);
    expect(stats.slaOverdueCount).toBe(1);
  });

  it('slaOverdueCount: 이미 approved된 심사는 카운트하지 않는다', async () => {
    const ws = await seedBuyerWorkspace(db);

    const overdueTime = new Date(Date.now() - 25 * 3600 * 1000);
    await db.insert(verificationApplications).values({
      workspaceId: ws.id,
      orgType: 'buyer',
      status: 'approved',
      submittedAt: overdueTime,
    });

    const stats = await getDashboardStats(db);
    expect(stats.slaOverdueCount).toBe(0);
  });
});

describe('getHotlist', () => {
  it('빈 DB에서 빈 배열을 반환한다', async () => {
    const hotlist = await getHotlist(db);
    expect(Array.isArray(hotlist)).toBe(true);
    expect(hotlist).toHaveLength(0);
  });

  it('SLA 초과 심사를 hotlist에 포함한다', async () => {
    const ws = await seedBuyerWorkspace(db, { name: '테스트 구매사' });

    const overdueTime = new Date(Date.now() - 25 * 3600 * 1000);
    await db.insert(verificationApplications).values({
      workspaceId: ws.id,
      orgType: 'buyer',
      status: 'submitted',
      submittedAt: overdueTime,
    });

    const hotlist = await getHotlist(db);
    expect(hotlist.length).toBeGreaterThanOrEqual(1);
    const slaItem = hotlist.find((item) => item.type === 'sla_overdue');
    expect(slaItem).toBeDefined();
    expect(slaItem?.href).toContain('/admin/review');
  });

  it('마감 임박(48h 내) sent RFP를 hotlist에 포함한다', async () => {
    const user = await seedUser(db);
    const ws = await seedBuyerWorkspace(db);

    // deadline within 48h
    const soonDeadline = new Date(Date.now() + 24 * 3600 * 1000);
    await db.insert(rfps).values({
      code: 'P-2605-0010',
      buyerWsId: ws.id,
      title: '임박 마감 RFP',
      deadline: soonDeadline,
      createdBy: user.id,
      status: 'sent',
    });

    const hotlist = await getHotlist(db);
    const deadlineItem = hotlist.find((item) => item.type === 'deadline_approaching');
    expect(deadlineItem).toBeDefined();
    expect(deadlineItem?.entityId).toBeDefined();
    expect(deadlineItem?.href).toContain('/admin/rfps/');
  });

  it('마감이 지난 RFP는 hotlist에 포함하지 않는다', async () => {
    const user = await seedUser(db);
    const ws = await seedBuyerWorkspace(db);

    // deadline already past
    const pastDeadline = new Date(Date.now() - 1 * 3600 * 1000);
    await db.insert(rfps).values({
      code: 'P-2605-0011',
      buyerWsId: ws.id,
      title: '만료된 RFP',
      deadline: pastDeadline,
      createdBy: user.id,
      status: 'sent',
    });

    const hotlist = await getHotlist(db);
    const deadlineItem = hotlist.find((item) => item.type === 'deadline_approaching');
    expect(deadlineItem).toBeUndefined();
  });

  it('반환된 HotlistItem은 필수 필드를 모두 갖는다', async () => {
    const ws = await seedBuyerWorkspace(db, { name: '심사 워크스페이스' });
    const overdueTime = new Date(Date.now() - 25 * 3600 * 1000);
    await db.insert(verificationApplications).values({
      workspaceId: ws.id,
      orgType: 'buyer',
      status: 'submitted',
      submittedAt: overdueTime,
    });

    const hotlist = await getHotlist(db);
    expect(hotlist.length).toBeGreaterThanOrEqual(1);
    for (const item of hotlist) {
      expect(item).toHaveProperty('type');
      expect(item).toHaveProperty('label');
      expect(item).toHaveProperty('subLabel');
      expect(item).toHaveProperty('entityId');
      expect(item).toHaveProperty('href');
    }
  });
});
