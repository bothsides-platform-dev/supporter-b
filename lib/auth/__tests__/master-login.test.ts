import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { users, workspaces } from '@/lib/db/schema';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import { allowSignIn, resolveMasterUser, makeNodeJwtCallback } from '@/lib/auth/master-login';
import authConfig from '@/auth.config';

const ORIGINAL = process.env.MASTER_ACCOUNT_EMAILS;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.MASTER_ACCOUNT_EMAILS;
  else process.env.MASTER_ACCOUNT_EMAILS = ORIGINAL;
});

describe('allowSignIn (default-deny for Google)', () => {
  beforeEach(() => {
    process.env.MASTER_ACCOUNT_EMAILS = 'help@support-b.com,ops@support-b.com';
  });

  it('google + 이메일 검증 + allowlist → 허용', () => {
    expect(allowSignIn({ provider: 'google', emailVerified: true, email: 'ops@support-b.com' })).toBe(true);
  });

  it('google + allowlist지만 이메일 미검증 → 거부', () => {
    expect(allowSignIn({ provider: 'google', emailVerified: false, email: 'ops@support-b.com' })).toBe(false);
  });

  it('google + 검증됐지만 allowlist 아님 → 거부', () => {
    expect(allowSignIn({ provider: 'google', emailVerified: true, email: 'intruder@gmail.com' })).toBe(false);
  });

  it('google이 아닌 provider(credentials)는 항상 허용 (allowlist 무관)', () => {
    expect(allowSignIn({ provider: 'credentials', emailVerified: false, email: 'someone@buyer.com' })).toBe(true);
  });
});

describe('resolveMasterUser (auto-provision + workspace resolution)', () => {
  let db: PgliteDB;
  beforeEach(async () => {
    db = await createPgliteDb();
    // DB access now routes through the repo factory — bind it to this pglite db.
    await __useDrizzleWithDbForTest(db);
  });
  afterEach(() => {
    __resetForTest();
  });

  async function seedActiveWorkspace(type: 'buyer' | 'pg', createdAt: Date, name = '워크스페이스') {
    const id = randomUUID();
    await db.insert(workspaces).values({ id, type, name, status: 'active', createdAt });
    return id;
  }

  it('최초 로그인 시 마스터 users 행을 자동 생성한다 (이메일 정규화·emailVerified·name)', async () => {
    const r = await resolveMasterUser(db, 'OPS@Supporter-B.com', '운영자');

    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('ops@support-b.com');
    expect(rows[0].emailVerified).toBe(true);
    expect(rows[0].name).toBe('운영자');
    expect(rows[0].passwordHash.length).toBeGreaterThan(0);
    // 멤버 목록 비표시 + 시스템 계정 의도와 일치 (workspace.ts의 isSystemAccount 필터).
    expect(rows[0].isSystemAccount).toBe(true);
    expect(r.id).toBe(rows[0].id);
    expect(r.email).toBe('ops@support-b.com');
  });

  it('재로그인 시 기존 행을 재사용한다 (중복 생성 없음)', async () => {
    const first = await resolveMasterUser(db, 'ops@support-b.com', '운영자');
    const second = await resolveMasterUser(db, 'ops@support-b.com', '운영자');

    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(second.id).toBe(first.id);
  });

  it('가장 먼저 생성된 active 워크스페이스로 진입한다 (role admin)', async () => {
    const older = await seedActiveWorkspace('buyer', new Date('2026-01-01T00:00:00Z'), '먼저');
    await seedActiveWorkspace('pg', new Date('2026-02-01T00:00:00Z'), '나중');

    const r = await resolveMasterUser(db, 'ops@support-b.com', '운영자');

    expect(r.workspaceId).toBe(older);
    expect(r.workspaceType).toBe('buyer');
    expect(r.role).toBe('admin');
  });

  it('lastActiveWorkspaceId가 active면 그곳으로 진입한다', async () => {
    await seedActiveWorkspace('buyer', new Date('2026-01-01T00:00:00Z'), '먼저');
    const remembered = await seedActiveWorkspace('pg', new Date('2026-02-01T00:00:00Z'), '기억된');
    // 마스터 행을 먼저 만들고 lastActiveWorkspaceId 설정
    const created = await resolveMasterUser(db, 'ops@support-b.com', '운영자');
    await db.update(users).set({ lastActiveWorkspaceId: remembered }).where(eq(users.id, created.id));

    const r = await resolveMasterUser(db, 'ops@support-b.com', '운영자');

    expect(r.workspaceId).toBe(remembered);
    expect(r.workspaceType).toBe('pg');
  });

  it('active 워크스페이스가 없으면 workspaceId는 undefined', async () => {
    const r = await resolveMasterUser(db, 'ops@support-b.com', '운영자');
    expect(r.workspaceId).toBeUndefined();
    expect(r.role).toBeUndefined();
  });
});

describe('makeNodeJwtCallback (Google → provisioned master token)', () => {
  let db: PgliteDB;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sharedJwt = authConfig.callbacks!.jwt as (params: any) => Promise<any>;

  beforeEach(async () => {
    db = await createPgliteDb();
    // DB access now routes through the repo factory — bind it to this pglite db.
    await __useDrizzleWithDbForTest(db);
    process.env.MASTER_ACCOUNT_EMAILS = 'help@support-b.com';
  });
  afterEach(() => {
    __resetForTest();
  });

  it('google 로그인 시 마스터 행을 프로비저닝하고 토큰에 우리 DB id·isMaster를 스탬프한다', async () => {
    const wsId = randomUUID();
    await db.insert(workspaces).values({ id: wsId, type: 'buyer', name: 'WS', status: 'active' });
    const jwt = makeNodeJwtCallback(db, sharedJwt);

    const token = await jwt({
      token: {},
      user: { id: 'google-sub-123', email: 'help@support-b.com', name: '운영팀' },
      account: { provider: 'google' },
      profile: { email: 'help@support-b.com', email_verified: true, name: '운영팀' },
    });

    const [row] = await db.select().from(users);
    expect(row.email).toBe('help@support-b.com');
    expect(token.id).toBe(row.id); // google sub이 아니라 우리 DB id
    expect(token.id).not.toBe('google-sub-123');
    expect(token.isMaster).toBe(true);
    expect(token.workspaceId).toBe(wsId);
    expect(token.role).toBe('admin');
  });

  it('google이 아닌(credentials) 호출은 그대로 위임한다 (프로비저닝 없음)', async () => {
    const jwt = makeNodeJwtCallback(db, sharedJwt);

    const token = await jwt({
      token: {},
      user: { id: 'u-normal', email: 'buyer@example.com', sessionVersion: 1 },
    });

    const rows = await db.select().from(users);
    expect(rows).toHaveLength(0); // 프로비저닝 안 함
    expect(token.id).toBe('u-normal');
    expect(token.isMaster).toBe(false);
  });
});
