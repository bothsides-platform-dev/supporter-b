/**
 * DrizzleWorkspaceRepository — canonical PG 기능 테스트
 *
 * 핵심 불변식:
 *   - listCanonicalPgWorkspaces()는 canonical_pg_key가 있는 PG 워크스페이스만 반환
 *   - is_system_account=true 멤버는 findById hydration 결과에서 제외
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { users, workspaceMembers, workspaces } from '@/lib/db/schema';
import { randomUUID } from 'node:crypto';
import { DrizzleWorkspaceRepository } from '../workspace';
import { seedPgWorkspace, seedBuyerWorkspace, seedUser, seedMembership } from './_seed';

describe('DrizzleWorkspaceRepository.listCanonicalPgWorkspaces', () => {
  let repo: DrizzleWorkspaceRepository;
  let db: Awaited<ReturnType<typeof createPgliteDb>>;

  beforeEach(async () => {
    db = await createPgliteDb();
    repo = new DrizzleWorkspaceRepository(db);
  });

  it('canonical_pg_key가 있는 PG 워크스페이스만 반환', async () => {
    // canonical 워크스페이스 2개
    await db.insert(workspaces).values({
      id: randomUUID(), type: 'pg', name: '토스페이먼츠', status: 'active', canonicalPgKey: 'tosspayments',
    });
    await db.insert(workspaces).values({
      id: randomUUID(), type: 'pg', name: 'KG이니시스', status: 'active', canonicalPgKey: 'kginicis',
    });
    // canonical key 없는 일반 PG 워크스페이스
    await seedPgWorkspace(db, '일반PG사');

    const results = await repo.listCanonicalPgWorkspaces();

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.canonicalPgKey).sort()).toEqual(['kginicis', 'tosspayments']);
  });

  it('buyer 워크스페이스는 canonical_pg_key가 있어도 제외', async () => {
    await db.insert(workspaces).values({
      id: randomUUID(), type: 'buyer', name: '구매사', status: 'active', canonicalPgKey: 'shouldnotappear',
    });
    await db.insert(workspaces).values({
      id: randomUUID(), type: 'pg', name: '토스페이먼츠', status: 'active', canonicalPgKey: 'tosspayments',
    });

    const results = await repo.listCanonicalPgWorkspaces();

    expect(results).toHaveLength(1);
    expect(results[0].canonicalPgKey).toBe('tosspayments');
  });

  it('canonical 워크스페이스가 없으면 빈 배열 반환', async () => {
    await seedPgWorkspace(db, '일반PG사');
    await seedBuyerWorkspace(db);

    const results = await repo.listCanonicalPgWorkspaces();

    expect(results).toHaveLength(0);
  });

  it('반환 shape: id, name, canonicalPgKey 포함', async () => {
    const id = randomUUID();
    await db.insert(workspaces).values({
      id, type: 'pg', name: '나이스페이먼츠', status: 'active', canonicalPgKey: 'nicepayments',
    });

    const [result] = await repo.listCanonicalPgWorkspaces();

    expect(result).toMatchObject({ id, name: '나이스페이먼츠', canonicalPgKey: 'nicepayments' });
  });

  it('hasLogo=false인 canonical 워크스페이스는 hasLogo: false로 반환된다', async () => {
    await db.insert(workspaces).values({
      id: randomUUID(), type: 'pg', name: '토스페이먼츠', status: 'active',
      canonicalPgKey: 'tosspayments', hasLogo: false,
    });

    const [result] = await repo.listCanonicalPgWorkspaces();

    expect(result).toMatchObject({ canonicalPgKey: 'tosspayments', hasLogo: false });
  });

  it('hasLogo=true인 canonical 워크스페이스는 hasLogo: true로 반환된다', async () => {
    await db.insert(workspaces).values({
      id: randomUUID(), type: 'pg', name: 'KG이니시스', status: 'active',
      canonicalPgKey: 'kginicis', hasLogo: true,
    });

    const [result] = await repo.listCanonicalPgWorkspaces();

    expect(result).toMatchObject({ canonicalPgKey: 'kginicis', hasLogo: true });
  });
});

describe('DrizzleWorkspaceRepository — suspended canonical 워크스페이스 제외', () => {
  let repo: DrizzleWorkspaceRepository;
  let db: Awaited<ReturnType<typeof createPgliteDb>>;

  beforeEach(async () => {
    db = await createPgliteDb();
    repo = new DrizzleWorkspaceRepository(db);
  });

  it('status=suspended인 canonical 워크스페이스는 listCanonicalPgWorkspaces에서 제외', async () => {
    await db.insert(workspaces).values({
      id: randomUUID(), type: 'pg', name: '정지된PG사', status: 'suspended', canonicalPgKey: 'suspended-pg',
    });
    await db.insert(workspaces).values({
      id: randomUUID(), type: 'pg', name: '토스페이먼츠', status: 'active', canonicalPgKey: 'tosspayments',
    });

    const results = await repo.listCanonicalPgWorkspaces();

    expect(results).toHaveLength(1);
    expect(results[0].canonicalPgKey).toBe('tosspayments');
  });
});

describe('DrizzleWorkspaceRepository — memberEmails/memberUserIds isSystemAccount 필터', () => {
  let repo: DrizzleWorkspaceRepository;
  let db: Awaited<ReturnType<typeof createPgliteDb>>;

  beforeEach(async () => {
    db = await createPgliteDb();
    repo = new DrizzleWorkspaceRepository(db);
  });

  it('memberEmails: is_system_account=true 마스터 계정 이메일 제외', async () => {
    const ws = await seedPgWorkspace(db, '토스페이먼츠');
    const regular = await seedUser(db, { email: 'sales@toss.im' });
    await seedMembership(db, ws.id, regular.id, 'member');
    const masterId = randomUUID();
    await db.insert(users).values({
      id: masterId, email: 'master@tosspayments.internal', passwordHash: 'x',
      name: '마스터', avatarColor: 'ink', isSystemAccount: true,
    });
    await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: masterId, role: 'admin' });

    const emails = await repo.memberEmails(ws.id);

    expect(emails).toContain('sales@toss.im');
    expect(emails).not.toContain('master@tosspayments.internal');
  });

  it('memberUserIds: is_system_account=true 마스터 계정 userId 제외', async () => {
    const ws = await seedPgWorkspace(db, '나이스');
    const regular = await seedUser(db, { email: 'r@nice.im' });
    await seedMembership(db, ws.id, regular.id, 'member');
    const masterId = randomUUID();
    await db.insert(users).values({
      id: masterId, email: 'master@nice.internal', passwordHash: 'x',
      name: '마스터', avatarColor: 'ink', isSystemAccount: true,
    });
    await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: masterId, role: 'admin' });

    const ids = await repo.memberUserIds(ws.id);

    expect(ids).toContain(regular.id);
    expect(ids).not.toContain(masterId);
  });
});

describe('DrizzleWorkspaceRepository.findById — isSystemAccount 필터', () => {
  let repo: DrizzleWorkspaceRepository;
  let db: Awaited<ReturnType<typeof createPgliteDb>>;

  beforeEach(async () => {
    db = await createPgliteDb();
    repo = new DrizzleWorkspaceRepository(db);
  });

  it('is_system_account=true 멤버는 findById 결과 members에서 제외', async () => {
    const ws = await seedPgWorkspace(db, '토스페이먼츠');
    // 일반 멤버
    const regular = await seedUser(db, { email: 'regular@toss.im' });
    await seedMembership(db, ws.id, regular.id, 'member');
    // 마스터(시스템) 계정 — is_system_account=true
    const masterId = randomUUID();
    await db.insert(users).values({
      id: masterId, email: 'master@tosspayments.internal', passwordHash: 'x',
      name: '토스페이먼츠 마스터', avatarColor: 'ink', isSystemAccount: true,
    });
    await db.insert(workspaceMembers).values({
      workspaceId: ws.id, userId: masterId, role: 'admin',
    });

    const fetched = await repo.findById(ws.id);

    expect(fetched).toBeDefined();
    const memberIds = fetched!.members.map((m) => m.id);
    expect(memberIds).toContain(regular.id);
    expect(memberIds).not.toContain(masterId);
  });

  it('is_system_account=false 일반 멤버는 정상 포함', async () => {
    const ws = await seedPgWorkspace(db, '나이스');
    const u = await seedUser(db, { email: 'u@nice.com' });
    await seedMembership(db, ws.id, u.id, 'member');

    const fetched = await repo.findById(ws.id);

    expect(fetched!.members).toHaveLength(1);
    expect(fetched!.members[0].id).toBe(u.id);
  });
});
