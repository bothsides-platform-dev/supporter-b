import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { workspaces, verificationApplications, adminAuditLogs, adminNotes, outboxEntries, workspaceMembers, users, bizProfiles } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { PgliteDB } from '@/lib/db/client-pglite';

vi.mock('@/lib/auth/admin-session', () => ({
  requireAdminSession: () => Promise.resolve({ adminId: 'admin' }),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));
vi.mock('@/lib/server/outbox/templates/workspaceApproved', () => ({
  renderWorkspaceApproved: async () => '<p>approved</p>',
}));
vi.mock('@/lib/server/outbox/templates/workspaceRejected', () => ({
  renderWorkspaceRejected: async () => '<p>rejected</p>',
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
    await approveWorkspaceAction(db, wsId, 'sme1');
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, wsId));
    expect(ws.status).toBe('active');
    expect(ws.reviewedAt).not.toBeNull();
  });

  it('verification_application.status를 approved로 변경한다', async () => {
    const { approveWorkspaceAction } = await import('../approveWorkspaceAction');
    await approveWorkspaceAction(db, wsId, 'sme1');
    const [app] = await db.select().from(verificationApplications).where(eq(verificationApplications.id, appId));
    expect(app.status).toBe('approved');
    expect(app.reviewedBy).toBe('admin');
  });

  it('admin_audit_log에 workspace.approve 이벤트와 grade를 기록한다', async () => {
    const { approveWorkspaceAction } = await import('../approveWorkspaceAction');
    await approveWorkspaceAction(db, wsId, 'sme2');
    const logs = await db.select().from(adminAuditLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('workspace.approve');
    expect(logs[0].entityId).toBe(wsId);
    expect((logs[0].payloadJson as Record<string, unknown>).grade).toBe('sme2');
  });

  it('buyer 승인 시 새 biz_profiles 행이 admin_confirmed gradeSource로 생성된다', async () => {
    // 사전에 biz_profile 없음 — grade-only INSERT로 CHECK 충족
    const { approveWorkspaceAction } = await import('../approveWorkspaceAction');
    await approveWorkspaceAction(db, wsId, 'small');

    const rows = await db.select().from(bizProfiles);
    expect(rows).toHaveLength(1);
    expect(rows[0].grade).toBe('small');
    expect(rows[0].gradeSource).toBe('admin_confirmed');
    expect(rows[0].gradeConfirmedBy).toBeNull();

    // workspaces.bizProfileId가 새 행을 가리킨다
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, wsId));
    expect(ws.bizProfileId).toBe(rows[0].id);
  });

  it('buyer 승인 시 기존 biz_profiles의 bizNo/taxType/status가 새 행에 복사된다', async () => {
    // 기존 biz_profile 행 삽입
    const [bp] = await db.insert(bizProfiles).values({
      bizNo: '1248100998',
      taxType: 'general',
      status: 'active',
      gradeSource: 'unset',
    }).returning();
    await db.update(workspaces).set({ bizProfileId: bp.id }).where(eq(workspaces.id, wsId));

    const { approveWorkspaceAction } = await import('../approveWorkspaceAction');
    await approveWorkspaceAction(db, wsId, 'general');

    const rows = await db.select().from(bizProfiles);
    // 기존 행 + 새 행 = 2
    expect(rows).toHaveLength(2);
    const newRow = rows.find((r) => r.gradeSource === 'admin_confirmed')!;
    expect(newRow.bizNo).toBe('1248100998');
    expect(newRow.taxType).toBe('general');
    expect(newRow.status).toBe('active');
    expect(newRow.grade).toBe('general');
  });

  it('buyer 승인 시 grade 없으면 GRADE_REQUIRED 에러', async () => {
    const { approveWorkspaceAction } = await import('../approveWorkspaceAction');
    await expect(approveWorkspaceAction(db, wsId, undefined)).rejects.toThrow('GRADE_REQUIRED');
  });

  it('pg 워크스페이스는 grade 없이도 승인 가능', async () => {
    // pg 타입 워크스페이스 생성
    const [pgWs] = await db.insert(workspaces).values({ type: 'pg', name: 'PG사테스트', status: 'pending' }).returning();
    await db.insert(verificationApplications).values({
      workspaceId: pgWs.id,
      orgType: 'pg',
      status: 'submitted',
    });
    const { approveWorkspaceAction } = await import('../approveWorkspaceAction');
    await approveWorkspaceAction(db, pgWs.id, undefined);
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, pgWs.id));
    expect(ws.status).toBe('active');
  });

  it('admin 멤버가 있으면 workspace.approved outbox 행을 enqueue한다', async () => {
    const [user] = await db.insert(users).values({
      email: 'applicant@example.com',
      passwordHash: 'hash',
      name: '신청자',
    }).returning();
    await db.insert(workspaceMembers).values({
      workspaceId: wsId,
      userId: user.id,
      role: 'admin',
    });

    const { approveWorkspaceAction } = await import('../approveWorkspaceAction');
    await approveWorkspaceAction(db, wsId, 'sme1');

    const rows = await db.select().from(outboxEntries);
    expect(rows).toHaveLength(1);
    expect(rows[0].event).toBe('workspace.approved');
    expect(rows[0].toAddr).toBe('applicant@example.com');
    expect(rows[0].subject).toContain('승인');
    expect(rows[0].dedupeKey).toBe(`workspace-approved:${wsId}`);
  });

  it('admin 멤버가 없으면 outbox 행을 생성하지 않는다', async () => {
    // beforeEach에서 user/member 시드 없음 → 기존 동작 보호
    const { approveWorkspaceAction } = await import('../approveWorkspaceAction');
    await approveWorkspaceAction(db, wsId, 'sme1');

    const rows = await db.select().from(outboxEntries);
    expect(rows).toHaveLength(0);
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

  it('admin 멤버가 있으면 workspace.rejected outbox 행을 enqueue한다', async () => {
    const [user] = await db.insert(users).values({
      email: 'applicant@example.com',
      passwordHash: 'hash',
      name: '신청자',
    }).returning();
    await db.insert(workspaceMembers).values({
      workspaceId: wsId,
      userId: user.id,
      role: 'admin',
    });

    const { rejectWorkspaceAction } = await import('../rejectWorkspaceAction');
    await rejectWorkspaceAction(db, wsId, '서류 미비');

    const rows = await db.select().from(outboxEntries);
    expect(rows).toHaveLength(1);
    expect(rows[0].event).toBe('workspace.rejected');
    expect(rows[0].toAddr).toBe('applicant@example.com');
    expect(rows[0].subject).toContain('보완');
    expect(rows[0].dedupeKey).toBe(`workspace-rejected:${wsId}`);
  });

  it('admin 멤버 없으면 outbox 행을 생성하지 않는다', async () => {
    const { rejectWorkspaceAction } = await import('../rejectWorkspaceAction');
    await rejectWorkspaceAction(db, wsId, '서류 미비');
    const rows = await db.select().from(outboxEntries);
    expect(rows).toHaveLength(0);
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
    expect(ws.reviewedAt).not.toBeNull();
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
    expect(ws.reviewedAt).not.toBeNull();
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
