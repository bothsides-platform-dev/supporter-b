import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { workspaces, verificationApplications, adminAuditLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { PgliteDB } from '@/lib/db/client-pglite';

vi.mock('@/lib/auth/admin-session', () => ({
  requireAdminSession: () => Promise.resolve({ adminId: 'admin' }),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

let db: PgliteDB;
let wsId: string;
let appId: string;

beforeEach(async () => {
  db = await createPgliteDb();
  const [ws] = await db.insert(workspaces).values({ type: 'buyer', name: '심사대기구매사', status: 'pending' }).returning();
  wsId = ws.id;
  const [app] = await db.insert(verificationApplications).values({
    workspaceId: ws.id,
    orgType: 'buyer',
    status: 'submitted',
  }).returning();
  appId = app.id;
});

describe('approveWorkspaceAction', () => {
  it('workspace.status를 active로 변경한다', async () => {
    const { approveWorkspaceAction } = await import('../approveWorkspaceAction');
    await approveWorkspaceAction(db, wsId);
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, wsId));
    expect(ws.status).toBe('active');
    expect(ws.reviewedAt).not.toBeNull();
  });

  it('verification_application.status를 approved로 변경한다', async () => {
    const { approveWorkspaceAction } = await import('../approveWorkspaceAction');
    await approveWorkspaceAction(db, wsId);
    const [app] = await db.select().from(verificationApplications).where(eq(verificationApplications.id, appId));
    expect(app.status).toBe('approved');
    expect(app.reviewedBy).toBe('admin');
  });

  it('admin_audit_log에 workspace.approve 이벤트를 기록한다', async () => {
    const { approveWorkspaceAction } = await import('../approveWorkspaceAction');
    await approveWorkspaceAction(db, wsId);
    const logs = await db.select().from(adminAuditLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('workspace.approve');
    expect(logs[0].entityId).toBe(wsId);
  });
});

describe('rejectWorkspaceAction', () => {
  it('reason 없이 호출 시 REASON_REQUIRED 반환', async () => {
    const { rejectWorkspaceAction } = await import('../rejectWorkspaceAction');
    const result = await rejectWorkspaceAction(db, wsId, '');
    expect(result).toEqual({ ok: false, error: 'REASON_REQUIRED' });
  });

  it('reason 있으면 application을 rejected로', async () => {
    const { rejectWorkspaceAction } = await import('../rejectWorkspaceAction');
    await rejectWorkspaceAction(db, wsId, '서류 미비');
    const [app] = await db.select().from(verificationApplications).where(eq(verificationApplications.id, appId));
    expect(app.status).toBe('rejected');
    expect(app.reason).toBe('서류 미비');
  });

  it('admin_audit_log에 workspace.reject 이벤트 기록', async () => {
    const { rejectWorkspaceAction } = await import('../rejectWorkspaceAction');
    await rejectWorkspaceAction(db, wsId, '서류 미비');
    const logs = await db.select().from(adminAuditLogs);
    expect(logs[0].action).toBe('workspace.reject');
  });
});

describe('requestMoreInfoAction', () => {
  it('reason 없이 호출 시 REASON_REQUIRED 반환', async () => {
    const { requestMoreInfoAction } = await import('../requestMoreInfoAction');
    const result = await requestMoreInfoAction(db, wsId, '');
    expect(result).toEqual({ ok: false, error: 'REASON_REQUIRED' });
  });

  it('reason 있으면 application을 needs_more_info로', async () => {
    const { requestMoreInfoAction } = await import('../requestMoreInfoAction');
    await requestMoreInfoAction(db, wsId, '추가 서류 필요');
    const [app] = await db.select().from(verificationApplications).where(eq(verificationApplications.id, appId));
    expect(app.status).toBe('needs_more_info');
    expect(app.reason).toBe('추가 서류 필요');
  });
});
