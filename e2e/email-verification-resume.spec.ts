import { test, expect, type Page } from 'playwright/test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { hashPassword } from '@/lib/auth/password';
import { db } from '@/lib/db/client';
import { users, workspaces, workspaceMembers, verificationApplications, guestRfpDrafts, outboxEntries } from '@/lib/db/schema';

const password = 'EmailResumeTest123!';
async function seed(status: 'active' | 'pending' = 'active') {
  const id = randomUUID();
  const email = `verify-${id}@example.com`;
  await db.insert(users).values({ id, email, name: '이메일 인증 테스트', passwordHash: await hashPassword(password) });
  const [workspace] = await db.insert(workspaces).values({ type: 'buyer', name: `인증 ${id}`, status }).returning();
  await db.insert(workspaceMembers).values({ userId: id, workspaceId: workspace.id, role: 'admin', approvalStatus: 'approved' });
  const [application] = await db.insert(verificationApplications).values({ workspaceId: workspace.id, orgType: 'buyer', status: status === 'active' ? 'approved' : 'submitted' }).returning();
  await db.insert(guestRfpDrafts).values({ id: randomUUID(), secretHash: 'test-only', userId: id, workspaceId: workspace.id, applicationId: application.id, answers: { version: 1, data: { title: '인증 후 이어 쓸 견적', websiteUrl: 'https://example.com' } } });
  return { id, email };
}
async function login(page: Page, email: string, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
}
async function mail(email: string) {
  let html = '';
  await expect.poll(async () => {
    const [row] = await db.select().from(outboxEntries).where(eq(outboxEntries.toAddr, email));
    html = row?.html ?? '';
    return html;
  }).toContain('/auth/verify?token=');
  return { token: html.match(/token=([^"&]+)["&]/)![1], code: html.match(/letter-spacing:[^>]+>\s*(\d{6})\s*</)![1] };
}
test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${info.workerIndex + 30}` });
});
test('메일 링크가 같은 브라우저의 가입 탭을 재로그인 없이 서버 견적으로 복귀시킨다', async ({ page, context, browser }) => {
  const user = await seed();
  await login(page, user.email);
  await expect(page.getByRole('heading', { name: '이메일을 인증해 주세요' })).toBeVisible();
  const before = await context.storageState();
  const proof = await mail(user.email);
  const emailTab = await context.newPage();
  await emailTab.goto(`/auth/verify?token=${proof.token}`);
  await expect(page).toHaveURL(/\/rfp-create\?resume=guest/, { timeout: 30000 });
  await expect(emailTab.getByRole('heading', { name: '이메일 인증을 마쳤어요' })).toBeVisible();
  expect((await (await context.request.get('/api/auth/session')).json()).user.sessionVersion).toBe(2);
  // A different browser holding the old JWT must remain revoked.
  const stale = await browser.newContext({ storageState: before });
  try {
    const old = await stale.newPage();
    await old.goto('/home');
    await expect(old).toHaveURL(/\/login/);
  } finally { await stale.close(); }
});
test('코드 입력도 재로그인 없이 서버 초안으로 복귀한다', async ({ page, context }) => {
  const user = await seed();
  await login(page, user.email);
  await expect(page.getByLabel('인증 코드 (6자리)')).toBeVisible();
  const proof = await mail(user.email);
  await page.getByLabel('인증 코드 (6자리)').fill(proof.code);
  await expect(page).toHaveURL(/\/rfp-create\?resume=guest/, { timeout: 30000 });
  expect((await (await context.request.get('/api/auth/session')).json()).user.sessionVersion).toBe(2);
});
test('다른 기기의 메일 링크는 한 번 로그인하고 같은 링크에서 인증을 마친다', async ({ page, browser }) => {
  const user = await seed();
  await login(page, user.email);
  await expect(page.getByLabel('인증 코드 (6자리)')).toBeVisible();
  const proof = await mail(user.email);
  const fresh = await browser.newContext();
  try {
    const emailTab = await fresh.newPage();
    await emailTab.goto(`/auth/verify?token=${proof.token}`);
    await expect(emailTab).toHaveURL(/\/login\?next=/);
    await emailTab.locator('input[name="email"]').fill(user.email);
    await emailTab.locator('input[name="password"]').fill(password);
    await emailTab.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(emailTab).toHaveURL(/\/rfp-create\?resume=guest/, { timeout: 30000 });
  } finally { await fresh.close(); }
});
test('미승인 구매사는 인증 후에만 심사 대기에 머문다', async ({ page }) => {
  const user = await seed('pending');
  await login(page, user.email);
  await expect(page.getByLabel('인증 코드 (6자리)')).toBeVisible();
  const proof = await mail(user.email);
  await page.getByLabel('인증 코드 (6자리)').fill(proof.code);
  await expect(page.getByRole('heading', { name: '거의 다 왔어요!' })).toBeVisible();
  await expect(page).toHaveURL(/\/pending-approval$/);
});
