/**
 * DrizzleAuditLogRepository — 사용자 행위 감사 로그 (C5).
 *
 * 계약:
 * - insert는 누가(actorUserId)/어디서(actorWorkspaceId)/무엇을(action)을 기록
 * - listForWorkspace는 해당 워크스페이스 로그만, 최신순, 행위자 이름 join 포함
 * - 커서 페이지네이션은 (createdAt, id) 복합 커서 — 동일 타임스탬프에서도
 *   누락/중복 없이 전체를 순회할 수 있어야 한다 (감사 로그는 빠지면 안 됨)
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { DrizzleAuditLogRepository } from '../audit-log';
import { seedUser, seedBuyerWorkspace } from './_seed';

let db: PgliteDB;
let repo: DrizzleAuditLogRepository;
let actorId: string;
let wsId: string;

beforeEach(async () => {
  db = await createPgliteDb();
  repo = new DrizzleAuditLogRepository(db);
  const actor = await seedUser(db, { name: '김감사' });
  actorId = actor.id;
  const ws = await seedBuyerWorkspace(db);
  wsId = ws.id;
});

describe('DrizzleAuditLogRepository', () => {
  it('insert 후 워크스페이스 목록에서 행위자 이름과 함께 조회된다', async () => {
    await repo.insert({
      actorUserId: actorId,
      actorWorkspaceId: wsId,
      action: 'rfp.award',
      entityType: 'rfp',
      entityId: 'P-2605-0042',
      metadata: { bidId: 'b-1' },
    });

    const rows = await repo.listForWorkspace(wsId, { limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorUserId: actorId,
      actorWorkspaceId: wsId,
      action: 'rfp.award',
      entityType: 'rfp',
      entityId: 'P-2605-0042',
      metadata: { bidId: 'b-1' },
      actorName: '김감사',
    });
    expect(rows[0].id).toBeTruthy();
    expect(rows[0].createdAt).toBeTruthy();
  });

  it('actor 이메일이 MASTER_ACCOUNT_EMAILS면 viaMaster=true, 아니면 false (운영자 행위 식별)', async () => {
    const ORIGINAL = process.env.MASTER_ACCOUNT_EMAILS;
    process.env.MASTER_ACCOUNT_EMAILS = 'ops@support-b.com';
    try {
      const master = await seedUser(db, { email: 'ops@support-b.com', name: '운영팀' });
      await repo.insert({ actorUserId: master.id, actorWorkspaceId: wsId, action: 'rfp.award' });
      await repo.insert({ actorUserId: actorId, actorWorkspaceId: wsId, action: 'rfp.cancel' });

      const rows = await repo.listForWorkspace(wsId, { limit: 10 });
      const masterRow = rows.find((r) => r.actorUserId === master.id)!;
      const normalRow = rows.find((r) => r.actorUserId === actorId)!;
      expect(masterRow.viaMaster).toBe(true);
      expect(normalRow.viaMaster).toBe(false);
      // 행위자 이메일은 클라이언트로 새지 않는다 (boolean만 노출).
      expect((masterRow as Record<string, unknown>).actorEmail).toBeUndefined();
    } finally {
      if (ORIGINAL === undefined) delete process.env.MASTER_ACCOUNT_EMAILS;
      else process.env.MASTER_ACCOUNT_EMAILS = ORIGINAL;
    }
  });

  it('다른 워크스페이스의 로그는 보이지 않는다', async () => {
    const otherWs = await seedBuyerWorkspace(db);
    await repo.insert({
      actorUserId: actorId,
      actorWorkspaceId: otherWs.id,
      action: 'rfp.create',
    });

    expect(await repo.listForWorkspace(wsId, { limit: 10 })).toHaveLength(0);
  });

  it('워크스페이스 무관 로그(actorWorkspaceId null — auth 이벤트)는 목록에 섞이지 않는다', async () => {
    await repo.insert({
      actorUserId: actorId,
      actorWorkspaceId: null,
      action: 'auth.password_reset',
    });

    expect(await repo.listForWorkspace(wsId, { limit: 10 })).toHaveLength(0);
  });

  it('limit + (createdAt,id) 커서로 누락·중복 없이 전체를 최신순으로 순회한다', async () => {
    for (let i = 0; i < 5; i++) {
      await repo.insert({
        actorUserId: actorId,
        actorWorkspaceId: wsId,
        action: `rfp.create`,
        entityId: `P-2605-000${i}`,
      });
    }

    const all = await repo.listForWorkspace(wsId, { limit: 10 });
    expect(all).toHaveLength(5);

    const paged: string[] = [];
    let before: { createdAt: string; id: string } | undefined;
    for (;;) {
      const page = await repo.listForWorkspace(wsId, { limit: 2, before });
      if (page.length === 0) break;
      paged.push(...page.map((r) => r.id));
      const last = page[page.length - 1];
      before = { createdAt: last.createdAt, id: last.id };
    }

    expect(paged).toEqual(all.map((r) => r.id));
  });

  it('tx 핸들을 받으면 트랜잭션 안에서 기록한다 (롤백 시 함께 사라짐)', async () => {
    await db
      .transaction(async (tx) => {
        await repo.insert(
          { actorUserId: actorId, actorWorkspaceId: wsId, action: 'bid.submit' },
          tx,
        );
        throw new Error('rollback');
      })
      .catch(() => {});

    expect(await repo.listForWorkspace(wsId, { limit: 10 })).toHaveLength(0);
  });
});
