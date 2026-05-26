import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { workspaces, verificationApplications, adminAuditLogs, adminNotes } from '@/lib/db/schema';
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

  it('admin_audit_log에 workspace.needs_more_info 이벤트 기록', async () => {
    const { requestMoreInfoAction } = await import('../requestMoreInfoAction');
    await requestMoreInfoAction(db, wsId, '추가 서류 필요');
    const logs = await db.select().from(adminAuditLogs);
    expect(logs[0].action).toBe('workspace.needs_more_info');
  });
});

describe('suspendWorkspaceAction', () => {
  it('reason 없으면 REASON_REQUIRED 반환', async () => {
    const { suspendWorkspaceAction } = await import('../suspendWorkspaceAction');
    const result = await suspendWorkspaceAction(db, wsId, '');
    expect(result).toEqual({ ok: false, error: 'REASON_REQUIRED' });
  });

  it('workspace.status를 suspended로 변경하고 statusReason 저장', async () => {
    await db.update(workspaces).set({ status: 'active' }).where(eq(workspaces.id, wsId));
    const { suspendWorkspaceAction } = await import('../suspendWorkspaceAction');
    await suspendWorkspaceAction(db, wsId, '약관 위반');
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, wsId));
    expect(ws.status).toBe('suspended');
    expect(ws.statusReason).toBe('약관 위반');
  });

  it('admin_audit_log에 workspace.suspend 이벤트 기록', async () => {
    await db.update(workspaces).set({ status: 'active' }).where(eq(workspaces.id, wsId));
    const { suspendWorkspaceAction } = await import('../suspendWorkspaceAction');
    await suspendWorkspaceAction(db, wsId, '약관 위반');
    const logs = await db.select().from(adminAuditLogs);
    expect(logs.some(l => l.action === 'workspace.suspend')).toBe(true);
  });
});

describe('unsuspendWorkspaceAction', () => {
  it('workspace.status를 active로 변경하고 statusReason 초기화', async () => {
    await db.update(workspaces).set({ status: 'suspended', statusReason: '약관 위반' }).where(eq(workspaces.id, wsId));
    const { unsuspendWorkspaceAction } = await import('../unsuspendWorkspaceAction');
    await unsuspendWorkspaceAction(db, wsId);
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, wsId));
    expect(ws.status).toBe('active');
    expect(ws.statusReason).toBeNull();
  });

  it('admin_audit_log에 workspace.unsuspend 이벤트 기록', async () => {
    await db.update(workspaces).set({ status: 'suspended' }).where(eq(workspaces.id, wsId));
    const { unsuspendWorkspaceAction } = await import('../unsuspendWorkspaceAction');
    await unsuspendWorkspaceAction(db, wsId);
    const logs = await db.select().from(adminAuditLogs);
    expect(logs.some(l => l.action === 'workspace.unsuspend')).toBe(true);
  });
});

describe('createAdminNoteAction', () => {
  it('body 없으면 BODY_REQUIRED 반환', async () => {
    const { createAdminNoteAction } = await import('../createAdminNoteAction');
    const result = await createAdminNoteAction(db, 'workspace', wsId, '');
    expect(result).toEqual({ ok: false, error: 'BODY_REQUIRED' });
  });

  it('adminNotes에 메모 저장', async () => {
    const { createAdminNoteAction } = await import('../createAdminNoteAction');
    await createAdminNoteAction(db, 'workspace', wsId, '중요 메모');
    const notes = await db.select().from(adminNotes).where(eq(adminNotes.entityId, wsId));
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toBe('중요 메모');
    expect(notes[0].createdBy).toBe('admin');
  });

  it('admin_audit_log에 note.create 이벤트 기록', async () => {
    const { createAdminNoteAction } = await import('../createAdminNoteAction');
    await createAdminNoteAction(db, 'workspace', wsId, '중요 메모');
    const logs = await db.select().from(adminAuditLogs);
    expect(logs.some(l => l.action === 'note.create')).toBe(true);
  });
});
