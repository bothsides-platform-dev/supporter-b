import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { setupServerTestEnv, teardownServerTestEnv } from '@/lib/server/__tests__/_harness';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { adminAuditLogs, bizProfiles, phoneOtps, users, verificationApplications, workspaces } from '@/lib/db/schema';
import { seedUser, seedRfp } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { getWorkspaceService } from '../workspace';
import { signupCompleteAction } from '@/lib/server/actions/auth/signupCompleteAction';
import { hashOtpCode } from '@/lib/server/actions/auth/phoneOtpUtils';
import { TEST_SIGNUP_CONSENT } from '@/lib/auth/__tests__/signup-consent-fixture';
import { __setNtsClientForTest, NtsError } from '@/lib/integrations/nts';
import { randomUUID } from 'node:crypto';
import { getGuestDraftService } from '../guest-drafts';
import { guestRfpDrafts } from '@/lib/db/schema';
import { workspaceMembers } from '@/lib/db/schema';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';
import { resolveShellAccess } from '@/lib/auth/shell-access';

vi.unmock('@/lib/server/buyer-approval/bona-pay');
vi.unmock('@/lib/server/buyer-approval/new-business');

vi.mock('next/headers', () => ({
  headers: async () => ({ get: () => null }),
  cookies: async () => ({ get: () => ({ value: 'guest-secret' }) }),
}));
vi.mock('@/lib/auth/signup-documents', async () => {
  const { TEST_SIGNUP_DOCUMENTS } = await import('@/lib/auth/__tests__/signup-consent-fixture');
  return { getSignupConsentDocuments: () => TEST_SIGNUP_DOCUMENTS };
});
const notice = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/notifications/admin-signup', () => ({ notifyAdminNewSignupAfterCommit: notice }));

// Synthetic response based on the public page's field names; NOT a measured sole case.
const response = {
  RESULT_CODE: '0000', BIZ_REG_NO: '1248100998', CORP_LEVEL: '영세',
  IS_DEFAULT_LEVEL: 'N', FROMDT: '2026-07-01',
};
let db: PgliteDB;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  db = await setupServerTestEnv();
  vi.stubEnv('BUYER_SOLE_AUTO_APPROVAL_ENABLED', undefined);
  vi.stubEnv('APICK_API_KEY', '');
  fetchMock = vi.fn(async () => Response.json(response));
  vi.stubGlobal('fetch', fetchMock);
  notice.mockClear();
  __setNtsClientForTest({ lookup: async () => ({ valid: true, status: 'active', taxType: 'general' }) });
});
afterEach(() => { teardownServerTestEnv(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function create(overrides: Record<string, unknown> = {}) {
  const user = await seedUser(db);
  return (await getWorkspaceService()).createWorkspace({
    userId: user.id, type: 'buyer', name: '자동 승인 검증',
    bizVerified: true,
    bizProfile: { bizNo: '124-81-00998', status: 'active', taxType: 'general' },
    ...overrides,
  }, { userId: user.id, workspaceId: '' });
}

it('stores active workspace, sole API grade, approved application and evidence together', async () => {
  const result = await create();
  expect(result.ok).toBe(true);
  const [workspace] = await db.select().from(workspaces);
  expect(workspace.status).toBe('active');
  expect(await db.select().from(bizProfiles)).toEqual([expect.objectContaining({
    id: workspace.bizProfileId, bizNo: '1248100998', grade: 'sole',
    gradeSource: 'api_confirmed', gradeConfirmedBy: null, gradeConfirmedAt: expect.any(Date),
  })]);
  const [application] = await db.select().from(verificationApplications);
  expect(application).toMatchObject({ status: 'approved', reviewedBy: 'system:bona-pay', reviewedAt: expect.any(Date) });
  expect(await db.select().from(adminAuditLogs)).toEqual([expect.objectContaining({
    actor: 'system:bona-pay', action: 'workspace.auto_approve', entityType: 'verification_application', entityId: application.id,
    payloadJson: expect.objectContaining({ after: expect.objectContaining({
      provider: 'bona-pay', bizNo: '1248100998', outcome: 'sole_confirmed',
      effectiveDate: '2026-07-01', checkedAt: expect.any(String), applicationId: application.id,
    }) }),
  })]);
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://payweb.bona-pay.com/receipt/getGrade.info');
  expect(options.body?.toString()).toBe('bizRegNo=1248100998');
});

it.each([
  { CORP_LEVEL: '일반' }, { IS_DEFAULT_LEVEL: 'Y' }, { RESULT_CODE: '9999' },
  { BIZ_REG_NO: '0000000000' }, { FROMDT: '2026-02-30' }, { FROMDT: '2099-01-01' },
  { CORP_LEVEL: '미지 등급' }, { IS_DEFAULT_LEVEL: undefined }, { FROMDT: undefined },
  { RESULT_CODE: undefined }, { BIZ_REG_NO: undefined },
])('keeps manual review for unconfirmed response %j', async (patch) => {
  fetchMock.mockResolvedValue(Response.json({ ...response, ...patch }));
  await create();
  expect((await db.select().from(workspaces))[0].status).toBe('pending');
  expect((await db.select().from(verificationApplications))[0].status).toBe('submitted');
  expect(await db.select().from(adminAuditLogs)).toHaveLength(0);
});

it.each([false, undefined])('does not use unverified NTS input (%s) as approval evidence', async (bizVerified) => {
  await create({ bizVerified, bizProfile: { bizNo: '1248100998', status: 'active', taxType: 'simple', grade: 'sole', gradeSource: 'user_confirmed' } });
  expect((await db.select().from(workspaces))[0].status).toBe('pending');
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([undefined, 'false', ''])('confirms sole buyers without an enablement flag (%s)', async (flag) => {
  vi.stubEnv('BUYER_SOLE_AUTO_APPROVAL_ENABLED', flag);
  await create();
  expect((await db.select().from(workspaces))[0].status).toBe('active');
  expect((await db.select().from(verificationApplications))[0].status).toBe('approved');
  expect(fetchMock).toHaveBeenCalledOnce();
});

it('never auto approves PG workspaces', async () => {
  await create({ type: 'pg' });
  expect((await db.select().from(workspaces))[0].status).toBe('pending');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('lookup failure leaves signup available without retry', async () => {
  fetchMock.mockRejectedValue(new Error('offline'));
  await create();
  expect((await db.select().from(workspaces))[0].status).toBe('pending');
  expect(fetchMock).toHaveBeenCalledOnce();
});

it('audit failure rolls back profile, workspace and application', async () => {
  await db.execute(sql`ALTER TABLE admin_audit_logs ADD CONSTRAINT reject_auto_approval CHECK (action <> 'workspace.auto_approve')`);
  try {
    await expect(create()).rejects.toThrow();
    expect(await db.select().from(bizProfiles)).toHaveLength(0);
    expect(await db.select().from(workspaces)).toHaveLength(0);
    expect(await db.select().from(verificationApplications)).toHaveLength(0);
  } finally {
    await db.execute(sql`ALTER TABLE admin_audit_logs DROP CONSTRAINT reject_auto_approval`);
  }
});

async function signup(guestDraftId?: string, extra: Record<string, unknown> = {}) {
  const [proof] = await db.insert(phoneOtps).values({
    phone: '01012345678', purpose: 'signup', codeHash: hashOtpCode('123456'),
    expiresAt: new Date(Date.now() + 300_000), verifiedAt: new Date(), proofExpiresAt: new Date(Date.now() + 300_000),
  }).returning();
  return signupCompleteAction({
    email: 'auto@example.com', name: '테스트', password: 'Password123!', phone: proof.phone,
    phoneVerificationId: proof.id, wsKind: 'buyer', wsName: '구매사',
    bizProfile: { bizNo: '1248100998', grade: 'sole', gradeSource: 'user_confirmed', status: 'active' },
    consent: TEST_SIGNUP_CONSENT,
    guestDraftId,
    ...extra,
  });
}

it('signup auto approves but preserves email verification and sends completed notice', async () => {
  expect((await signup()).ok).toBe(true);
  const [user] = await db.select().from(users).where(eq(users.email, 'auto@example.com'));
  expect(user.emailVerified).toBe(false);
  expect((await db.select().from(workspaces))[0].status).toBe('active');
  expect(notice).toHaveBeenCalledWith(expect.objectContaining({ autoApproved: true }));
  const memberships = await (await getWorkspaceRepo()).listForUser(user.id);
  const session = { user: { id: user.id, workspaceId: memberships[0].id, workspaceType: 'buyer' as const } };
  expect(resolveShellAccess(session, memberships, undefined, false)).toEqual({ kind: 'redirect', to: '/pending-approval' });
  expect(resolveShellAccess(session, memberships, undefined, true).kind).toBe('render');
});

it('forged client sole grade and active status cannot bypass NTS outage', async () => {
  __setNtsClientForTest({ lookup: async () => { throw new NtsError('NTS_UPSTREAM_DOWN'); } });
  expect((await signup()).ok).toBe(true);
  expect((await db.select().from(workspaces))[0].status).toBe('pending');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('a client sole grade does not override a non-sole server result', async () => {
  fetchMock.mockResolvedValue(Response.json({ ...response, CORP_LEVEL: '일반' }));
  expect((await signup()).ok).toBe(true);
  expect((await db.select().from(workspaces))[0].status).toBe('pending');
});

it.each([
  { autoApproved: true },
  { autoApproval: { ...response } },
  { bizProfile: { bizNo: '1248100998', grade: 'sole', gradeSource: 'api_confirmed' } },
])('rejects client-supplied approval authority %j', async (extra) => {
  expect(await signup(undefined, extra)).toEqual({ ok: false, error: 'INVALID_INPUT' });
  expect(await db.select().from(workspaces)).toHaveLength(0);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('binds the saved guest quote to the automatically approved account and preserves its notice', async () => {
  const id = randomUUID();
  await (await getGuestDraftService()).savePublic(
    { id, revision: 0, answers: { title: '이어 쓸 견적' }, files: [] }, 'guest-secret',
  );
  expect((await signup(id)).ok).toBe(true);
  const [draft] = await db.select().from(guestRfpDrafts);
  const [workspace] = await db.select().from(workspaces);
  expect(workspace.status).toBe('active');
  expect(draft.workspaceId).toBe(workspace.id);
  expect(draft.userId).toBeTruthy();
  expect(notice).toHaveBeenCalledWith(expect.objectContaining({
    autoApproved: true, guestDraft: expect.objectContaining({ answers: expect.objectContaining({ title: '이어 쓸 견적' }) }),
  }));
});

it('only newly created workspaces use the latest grade result', async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ ...response, CORP_LEVEL: '일반' }));
  await create();
  await create();
  fetchMock.mockResolvedValueOnce(Response.json({ ...response, IS_DEFAULT_LEVEL: 'Y' }));
  await create();
  expect((await db.select().from(workspaces)).map(row => row.status).sort()).toEqual(['active', 'pending', 'pending']);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it('starts the external lookup before opening the creation transaction', async () => {
  fetchMock.mockImplementation(async () => {
    expect(await db.select().from(workspaces)).toHaveLength(0);
    expect(await db.select().from(bizProfiles)).toHaveLength(0);
    return Response.json(response);
  });
  await create();
  expect((await db.select().from(workspaces))[0].status).toBe('active');
});

it('an abandoned automatic approval does not pin an unverified password principal', async () => {
  expect((await signup()).ok).toBe(true);
  const [firstUser] = await db.select().from(users);
  expect((await signup(undefined, { password: 'Replacement123!' })).ok).toBe(true);
  const allUsers = await db.select().from(users);
  expect(allUsers).toHaveLength(1);
  expect(allUsers[0].id).not.toBe(firstUser.id);
  expect(allUsers[0].passwordHash).not.toBe(firstUser.passwordHash);
  expect(await db.select().from(workspaces)).toHaveLength(1);
  expect(await db.select().from(verificationApplications)).toHaveLength(1);
});

it('automatic approval does not allow re-registration to delete a shared active workspace', async () => {
  await signup();
  const [workspace] = await db.select().from(workspaces);
  const colleague = await seedUser(db);
  await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: colleague.id, role: 'member' });
  expect(await signup()).toEqual({ ok: false, error: 'EMAIL_TAKEN' });
  expect((await db.select().from(workspaces))[0].id).toBe(workspace.id);
});

it('re-registration preserves a workspace with an existing quote', async () => {
  await signup();
  const [workspace] = await db.select().from(workspaces);
  const [user] = await db.select().from(users);
  await seedRfp(db, { buyerWsId: workspace.id, createdBy: user.id });
  expect(await signup()).toEqual({ ok: false, error: 'EMAIL_TAKEN' });
  expect((await db.select().from(workspaces))[0].id).toBe(workspace.id);
});

it('re-registration preserves a subsequently manually confirmed workspace', async () => {
  await signup();
  await db.update(bizProfiles).set({ gradeSource: 'admin_confirmed' });
  expect(await signup()).toEqual({ ok: false, error: 'EMAIL_TAKEN' });
});

it('exact guest replay preserves recovery, while a new signup retires the abandoned guest owner', async () => {
  const id = randomUUID();
  await (await getGuestDraftService()).savePublic(
    { id, revision: 0, answers: { title: '기존 초안' }, files: [] }, 'guest-secret',
  );
  await signup(id);
  const [firstUser] = await db.select().from(users);
  expect(await signup(id)).toEqual({ ok: false, error: 'EMAIL_TAKEN' });
  expect((await db.select().from(users))[0].id).toBe(firstUser.id);
  expect((await signup()).ok).toBe(true);
  expect((await db.select().from(users))[0].id).not.toBe(firstUser.id);
  expect((await db.select().from(guestRfpDrafts))[0].userId).toBeNull();
});

function useNewBusiness() {
  vi.stubEnv('APICK_API_KEY', 'test-apick');
  vi.stubEnv('NTS_SERVICE_KEY', 'test-nts');
  const openingDate = new Date().toISOString().slice(0, 10);
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    if (url.includes('bona-pay')) return Response.json({ ...response, IS_DEFAULT_LEVEL: 'Y' });
    if (url.includes('apick')) return Response.json({ api: { success: true }, data: {
      success: 1, 사업자등록번호: '1248100998', 상세정보확보: 'Y', 대표명: '검증 대표', 설립일: openingDate,
    } });
    const requested = JSON.parse(init.body as string).businesses[0];
    return Response.json({ status_code: 'OK', data: [{ b_no: '1248100998', valid: '01', request_param: requested, status: { b_no: '1248100998', b_stt_cd: '01' } }] });
  });
  return openingDate;
}

it('persists the new-business exception separately from confirmed merchant grade and audits its opening date', async () => {
  const openingDate = useNewBusiness();
  expect((await create()).ok).toBe(true);
  expect((await db.select().from(workspaces))[0].status).toBe('active');
  expect((await db.select().from(bizProfiles))[0]).toMatchObject({ grade: 'sole', gradeSource: 'new_business_exception' });
  expect((await db.select().from(verificationApplications))[0]).toMatchObject({ status: 'approved', reviewedBy: 'system:apick' });
  const [audit] = await db.select().from(adminAuditLogs);
  expect(audit).toMatchObject({ actor: 'system:apick', payloadJson: { after: {
    provider: 'apick', outcome: 'new_business_confirmed', openingDate, verifiedBy: 'nts_validate', gradeSource: 'new_business_exception',
  } } });
  expect(JSON.stringify(audit)).not.toContain('검증 대표');
  expect(JSON.stringify(audit)).not.toContain('test-apick');
});

it('new-business approval permits replacement of abandoned unverified credentials', async () => {
  useNewBusiness();
  expect((await signup()).ok).toBe(true);
  const [first] = await db.select().from(users);
  expect((await signup(undefined, { password: 'Replacement123!' })).ok).toBe(true);
  const remaining = await db.select().from(users);
  expect(remaining).toHaveLength(1);
  expect(remaining[0].id).not.toBe(first.id);
});

it('new-business approval preserves shared workspaces on re-registration', async () => {
  useNewBusiness();
  await signup();
  const [workspace] = await db.select().from(workspaces);
  const colleague = await seedUser(db);
  await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: colleague.id, role: 'member' });
  expect(await signup()).toEqual({ ok: false, error: 'EMAIL_TAKEN' });
});

it('new-business audit failure rolls back automatic signup', async () => {
  useNewBusiness();
  await db.execute(sql`ALTER TABLE admin_audit_logs ADD CONSTRAINT reject_new_approval CHECK (actor <> 'system:apick')`);
  try {
    await expect(create()).rejects.toThrow();
    expect(await db.select().from(workspaces)).toHaveLength(0);
  } finally {
    await db.execute(sql`ALTER TABLE admin_audit_logs DROP CONSTRAINT reject_new_approval`);
  }
});
