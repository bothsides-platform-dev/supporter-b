import { describe, it, expect, beforeEach } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { DrizzleWorkspaceRepository } from '../workspace';
import { seedUser, seedBuyerWorkspace, seedMembership } from './_seed';
import { users } from '@/lib/db/schema';
import { randomUUID } from 'node:crypto';

let db: PgliteDB;
beforeEach(async () => {
  db = await createPgliteDb();
});

describe('DrizzleWorkspaceRepository.teamRoster', () => {
  it('워크스페이스 멤버를 {userId,name,joinedAt} 로 반환(시스템 계정 제외)', async () => {
    const repo = new DrizzleWorkspaceRepository(db);
    const ws = await seedBuyerWorkspace(db);
    const a = await seedUser(db, { name: '김민수' });
    const b = await seedUser(db, { name: '이영희' });
    await seedMembership(db, ws.id, a.id, 'admin', { joinedAt: new Date('2026-03-14T00:00:00Z') });
    await seedMembership(db, ws.id, b.id, 'member', { joinedAt: new Date('2026-04-01T00:00:00Z') });

    // 시스템 계정은 제외되어야 한다.
    const sysId = randomUUID();
    await db.insert(users).values({
      id: sysId, email: `sys-${sysId.slice(0, 8)}@example.com`,
      passwordHash: 'x', name: '시스템', avatarColor: 'ink', isSystemAccount: true,
    });
    await seedMembership(db, ws.id, sysId, 'member');

    const roster = await repo.teamRoster(ws.id);
    const byName = Object.fromEntries(roster.map((r) => [r.name, r]));
    expect(roster).toHaveLength(2);
    expect(byName['김민수'].userId).toBe(a.id);
    expect(byName['김민수'].joinedAt).toBe('2026-03-14T00:00:00.000Z');
    expect(byName['이영희']).toBeTruthy();
    expect(roster.some((r) => r.name === '시스템')).toBe(false);
  });

  it('승인 대기(pending_approval) 멤버는 로스터에서 제외 — approved 만, master 는 계속 숨김', async () => {
    const repo = new DrizzleWorkspaceRepository(db);
    const ws = await seedBuyerWorkspace(db);
    const approved = await seedUser(db, { name: '승인멤버' });
    const pending = await seedUser(db, { name: '대기멤버' });
    const master = await seedUser(db, { name: '운영자', isSystemAccount: true });
    await seedMembership(db, ws.id, approved.id, 'admin');
    await seedMembership(db, ws.id, pending.id, 'member', { approvalStatus: 'pending_approval' });
    await seedMembership(db, ws.id, master.id, 'member');

    const roster = await repo.teamRoster(ws.id);
    const ids = roster.map((r) => r.userId);
    expect(ids).toContain(approved.id);
    expect(ids).not.toContain(pending.id); // 멘션 피커에 노출되면 알림은 못 받는 불일치 발생
    expect(ids).not.toContain(master.id); // 표시용 surface 는 계속 isSystemAccount 로 숨김
  });
});
