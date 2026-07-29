// createWorkspaceInTx (shared with signup) + createWorkspaceAction (in-app,
// logged-in user). Both create a workspace, make the user an admin member, and
// set users.lastActiveWorkspaceId so the new ws is the active one.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

import { type PgliteDB } from '@/lib/db/client-pglite';
import { setupWorkspaceActionEnv, teardownWorkspaceActionEnv } from './_setup';
import { seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import {
  users,
  workspaces,
  workspaceMembers,
  bizProfiles,
  columns,
  verificationApplications,
  rfps,
  bids,
  rfpInvitations,
} from '@/lib/db/schema';

const sessionRef: { value: { user: { id: string; isMaster?: boolean } } | null } = { value: null };
vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('UNAUTHENTICATED')),
}));

// Spy on the new-signup admin notifier — assert the action fires it post-create
// without actually sending email. Lazy closure so the factory eval doesn't
// touch notifyMock before init (same pattern as the session mock above).
const notifyMock = vi.fn();
vi.mock('@/lib/server/notifications/admin-signup', () => ({
  notifyAdminNewSignupAfterCommit: (...args: unknown[]) => notifyMock(...args),
}));

import { createWorkspaceInTx } from '../_createWorkspace';
import { createWorkspaceAction } from '../createWorkspaceAction';
import { NtsError, __setNtsClientForTest } from '@/lib/integrations/nts';
import { getRiskFlagRepo } from '@/lib/server/repositories/factory';

let db: PgliteDB;
beforeEach(async () => {
  db = await setupWorkspaceActionEnv();
  sessionRef.value = null;
});
afterEach(() => {
  teardownWorkspaceActionEnv();
});

describe('createWorkspaceInTx', () => {
  it('pg: creates workspace + admin membership + sets lastActiveWorkspaceId', async () => {
    const u = await seedUser(db);
    const { workspaceId } = await createWorkspaceInTx(db, {
      userId: u.id,
      type: 'pg',
      name: 'NewPG',
    });

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    expect(ws).toMatchObject({ type: 'pg', name: 'NewPG' });

    const [m] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, u.id),
        ),
      );
    expect(m.role).toBe('admin');

    const [usr] = await db.select().from(users).where(eq(users.id, u.id));
    expect(usr.lastActiveWorkspaceId).toBe(workspaceId);
  });

  it('returns the verification application id it inserted (for the admin review link)', async () => {
    const u = await seedUser(db);
    const { workspaceId, applicationId } = await createWorkspaceInTx(db, {
      userId: u.id,
      type: 'pg',
      name: 'NewPG',
    });

    expect(applicationId).toBeTruthy();
    const [app] = await db
      .select()
      .from(verificationApplications)
      .where(eq(verificationApplications.workspaceId, workspaceId));
    expect(app.id).toBe(applicationId);
  });

  it('buyer with bizProfile: creates and links the biz profile', async () => {
    const u = await seedUser(db);
    const { workspaceId } = await createWorkspaceInTx(db, {
      userId: u.id,
      type: 'buyer',
      name: 'BuyerCo',
      bizProfile: {
        bizNo: '1112223334',
        taxType: 'general',
        status: 'active',
        grade: 'general',
        gradeSource: 'user_confirmed',
      },
    });

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    expect(ws.type).toBe('buyer');
    expect(ws.bizProfileId).toBeTruthy();
    const [biz] = await db
      .select()
      .from(bizProfiles)
      .where(eq(bizProfiles.id, ws.bizProfileId as string));
    expect(biz.bizNo).toBe('1112223334');
  });

  it('seeds default kanban columns: buyer gets pipeline-only board (BUYER_KANBAN_ORDER columns)', async () => {
    const u = await seedUser(db);
    const { workspaceId } = await createWorkspaceInTx(db, {
      userId: u.id,
      type: 'buyer',
      name: 'BuyerCo',
      bizProfile: {
        bizNo: '2223334445',
        taxType: 'general',
        status: 'active',
        grade: 'general',
        gradeSource: 'user_confirmed',
      },
    });

    const cols = await db.select().from(columns).where(eq(columns.workspaceId, workspaceId));
    expect(cols.every((c) => c.kind === 'pipeline')).toBe(true);
    expect(cols.filter((c) => c.kind === 'pipeline')).toHaveLength(2);
  });

  it('seeds default kanban columns: pg gets only the pipeline board', async () => {
    const u = await seedUser(db);
    const { workspaceId } = await createWorkspaceInTx(db, {
      userId: u.id,
      type: 'pg',
      name: 'NewPG',
    });

    const cols = await db.select().from(columns).where(eq(columns.workspaceId, workspaceId));
    expect(cols.filter((c) => c.kind === 'pipeline')).toHaveLength(4);
  });

  it('buyer: creates zero RFPs/bids/invitations — onboarding sample is a client-side fixture, not a DB seed', async () => {
    const u = await seedUser(db);
    const { workspaceId } = await createWorkspaceInTx(db, { userId: u.id, type: 'buyer', name: 'BuyerCo' });

    expect(await db.select().from(rfps).where(eq(rfps.buyerWsId, workspaceId))).toHaveLength(0);
    expect(await db.select().from(bids)).toHaveLength(0);
    expect(await db.select().from(rfpInvitations)).toHaveLength(0);
    expect(await db.select().from(workspaces).where(eq(workspaces.type, 'buyer'))).toHaveLength(1);
  });

  it('pg: creates zero RFPs/bids/invitations and no demo counterpart workspace', async () => {
    const u = await seedUser(db);
    const { workspaceId } = await createWorkspaceInTx(db, { userId: u.id, type: 'pg', name: 'NewPG' });

    expect(await db.select().from(rfps)).toHaveLength(0);
    expect(await db.select().from(bids)).toHaveLength(0);
    expect(await db.select().from(rfpInvitations).where(eq(rfpInvitations.pgWsId, workspaceId))).toHaveLength(0);
    // only the one PG workspace exists — no shared demo buyer workspace got created
    expect(await db.select().from(workspaces)).toHaveLength(1);
  });
});

describe('createWorkspaceAction', () => {
  it('logged-in user: creates a workspace with the user as admin', async () => {
    const u = await seedUser(db);
    sessionRef.value = { user: { id: u.id } };

    const r = await createWorkspaceAction({ type: 'pg', name: 'MyPG' });

    expect(r.ok).toBe(true);
    if (r.ok) {
      const [m] = await db
        .select()
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, r.workspaceId));
      expect(m).toMatchObject({ userId: u.id, role: 'admin' });
    }
  });

  it('notifies admin with an /admin/review link after a successful create', async () => {
    notifyMock.mockClear();
    const u = await seedUser(db);
    sessionRef.value = { user: { id: u.id } };

    const r = await createWorkspaceAction({ type: 'pg', name: 'MyPG' });

    expect(r.ok).toBe(true);
    expect(notifyMock).toHaveBeenCalledTimes(1);
    const arg = notifyMock.mock.calls[0][0] as {
      workspaceName: string;
      orgType: string;
      reviewUrl: string;
    };
    expect(arg.workspaceName).toBe('MyPG');
    expect(arg.orgType).toBe('pg');
    expect(arg.reviewUrl).toContain('/admin/review/');
  });

  it('ADMIN_ORIGIN 설정 시 reviewUrl 이 해당 origin 으로 시작한다', async () => {
    const saved = process.env.ADMIN_ORIGIN;
    process.env.ADMIN_ORIGIN = 'https://admin.support-b.com';
    notifyMock.mockClear();
    try {
      const u = await seedUser(db);
      sessionRef.value = { user: { id: u.id } };
      const r = await createWorkspaceAction({ type: 'pg', name: 'AdminPG' });
      expect(r.ok).toBe(true);
      const arg = notifyMock.mock.calls[0][0] as { reviewUrl: string };
      expect(arg.reviewUrl).toMatch(/^https:\/\/admin\.support-b\.com\/admin\/review\//);
    } finally {
      if (saved === undefined) delete process.env.ADMIN_ORIGIN;
      else process.env.ADMIN_ORIGIN = saved;
    }
  });

  it('unauthenticated → UNAUTHENTICATED', async () => {
    sessionRef.value = null;
    const r = await createWorkspaceAction({ type: 'pg', name: 'X' });
    expect(r).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
  });

  it('empty name → INVALID_INPUT', async () => {
    const u = await seedUser(db);
    sessionRef.value = { user: { id: u.id } };
    const r = await createWorkspaceAction({ type: 'pg', name: '' });
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });

  it('마스터 계정은 워크스페이스를 생성할 수 없다 → FORBIDDEN (멤버십 오염 방지)', async () => {
    const u = await seedUser(db);
    sessionRef.value = { user: { id: u.id, isMaster: true } };

    const r = await createWorkspaceAction({ type: 'pg', name: 'MasterWS' });

    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
    const members = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, u.id));
    expect(members).toHaveLength(0);
  });

  // 인앱 워크스페이스 생성(/workspace/new)도 가입과 같은 폼(BuyerWorkspaceForm)을
  // 쓰므로 같은 서버 재판정을 탄다. 여기 테스트가 없으면 저하·거부·플래그가 전부
  // 검증되지 않은 채로 나간다.
  describe('사업자번호 서버 재판정', () => {
    const VALID_BIZ_NO = '1248100998'; // 체크섬 유효

    afterEach(() => {
      __setNtsClientForTest(undefined);
    });

    it('클라이언트가 보낸 taxType 대신 서버 조회 결과를 저장한다', async () => {
      const u = await seedUser(db);
      sessionRef.value = { user: { id: u.id } };
      __setNtsClientForTest({
        lookup: async () => ({ valid: true, taxType: 'exempt', status: 'active' }),
      });

      const r = await createWorkspaceAction({
        type: 'buyer',
        name: 'MyBuyer',
        bizProfile: { bizNo: VALID_BIZ_NO, taxType: 'general', status: 'active' },
      });

      expect(r.ok).toBe(true);
      const [profile] = await db.select().from(bizProfiles);
      expect(profile.taxType).toBe('exempt');
    });

    it('국세청이 폐업으로 응답하면 거부한다', async () => {
      const u = await seedUser(db);
      sessionRef.value = { user: { id: u.id } };
      __setNtsClientForTest({
        lookup: async () => ({ valid: true, taxType: 'general', status: 'closed' }),
      });

      const r = await createWorkspaceAction({
        type: 'buyer',
        name: 'ClosedBuyer',
        bizProfile: { bizNo: VALID_BIZ_NO, taxType: 'general', status: 'active' },
      });

      expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
      expect(await db.select().from(workspaces)).toHaveLength(0);
    });

    it('국세청 장애면 미검증으로 통과시키고 risk flag 를 남긴다', async () => {
      const u = await seedUser(db);
      sessionRef.value = { user: { id: u.id } };
      __setNtsClientForTest({
        lookup: async () => {
          throw new NtsError('NTS_UPSTREAM_DOWN');
        },
      });

      const r = await createWorkspaceAction({
        type: 'buyer',
        name: 'DegradedBuyer',
        bizProfile: { bizNo: VALID_BIZ_NO, taxType: 'general', status: 'active' },
      });

      expect(r.ok).toBe(true);
      if (!r.ok) return;

      const [profile] = await db.select().from(bizProfiles);
      expect(profile.taxType).toBeNull();
      expect(profile.status).toBeNull();

      const [ws] = await db.select().from(workspaces);
      expect(ws.status).toBe('pending'); // 승인 게이트가 최종 방어선

      const flags = await (await getRiskFlagRepo()).findByEntity('workspace', r.workspaceId);
      expect(flags.map((f: { flagType: string }) => f.flagType)).toContain('biz_unverified');
    });

    // 심사 메일 배지는 risk flag 렌더링(별도 레포)이 붙기 전까지 운영자에게
    // 도달이 보장된 유일한 채널이다 — 배선이 끊기면 아무도 모른다.
    it('미검증 사실을 심사 알림에 전달한다', async () => {
      const u = await seedUser(db);
      sessionRef.value = { user: { id: u.id } };
      notifyMock.mockClear();
      __setNtsClientForTest({
        lookup: async () => {
          throw new NtsError('NTS_UPSTREAM_DOWN');
        },
      });

      await createWorkspaceAction({
        type: 'buyer',
        name: 'NotifyBuyer',
        bizProfile: { bizNo: VALID_BIZ_NO, taxType: 'general', status: 'active' },
      });

      expect(notifyMock).toHaveBeenCalledWith(
        expect.objectContaining({ bizVerified: false }),
      );
    });
  });
});
