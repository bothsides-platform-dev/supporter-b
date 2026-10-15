import { test, expect, type Page } from 'playwright/test';
import { randomUUID, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  pgRecommendationGroups,
  pgMatchingPolicies,
  workspaces,
  rfps,
  rfpMatchingRequests,
  guestRfpEvents,
  guestRfpDrafts,
  guestRfpFiles,
  attachments,
  users,
  phoneOtps,
} from '@/lib/db/schema';
const draftKey = 'support-b-guest-rfp-v1';
let groupId: string;
let industry: string;
test.beforeAll(async () => {
  groupId = randomUUID();
  industry = `공개 견적 테스트 ${groupId.slice(0, 8)}`;
  const [pg] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.name, '서포터 B 페이'));
  await db
    .insert(pgRecommendationGroups)
    .values({ id: groupId, name: industry });
  await db
    .insert(pgMatchingPolicies)
    .values({
      groupId,
      policy: {
        risk: 'gray',
        candidates: [
          {
            pgWorkspaceId: pg.id,
            reason: '판매 정보 확인',
            feesByTier: { sole: 0, sme1: 1, sme2: 1.5, sme3: 2, general: 3 },
            feeNote: '카드 결제·부가세 별도, 최종 심사 후 확정',
          },
        ],
      },
    });
});
test.afterAll(async () => {
  await db
    .delete(pgRecommendationGroups)
    .where(eq(pgRecommendationGroups.id, groupId));
});
async function fillQuote(page: Page, title: string, renewal = false) {
  await page.goto('/quote-start');
  await expect(
    page.getByRole('heading', { name: '어떤 홈페이지에서 판매하나요?' }),
  ).toBeVisible();
  await page.getByLabel('사업 운영 홈페이지').fill('example.com');
  await page.getByLabel('사업 운영 홈페이지').press('Enter');
  const next = () =>
    page.getByRole('button', { name: '다음', exact: true }).click();
  await next();
  await page.getByRole('searchbox', { name: '업종 검색' }).fill(industry);
  await page.getByRole('radio', { name: industry, exact: true }).check();
  await next();
  await page.getByLabel('주요 판매 상품').fill('의류');
  await next();
  await page.getByRole('button', { name: '지금은 건너뛰어요', exact: true }).click();
  await page.getByRole('radio', { name: '아니요', exact: true }).check();
  await next();
  await page.getByRole('radio', { name: '10만원 미만', exact: true }).check();
  await next();
  await page.getByRole('checkbox', { name: '해당 없음', exact: true }).check();
  await next();
  await next();
  await page.getByRole('button', { name: renewal ? '갱신 계약' : '신규 계약', exact: true }).click();
  await next();
  if (renewal) {
    await page.getByLabel('PG 회사명 직접 입력').fill('기존 외부 결제회사');
    await page.getByRole('button', { name: '추가해요' }).click();
    await next();
  }
  await page.getByRole('button', { name: '카드', exact: true }).click();
  await next();
  if (renewal) {
    await page.getByLabel('전년도 연간 PG 총 거래액', { exact: true }).fill('1000000000'); await next();
    await page.getByLabel('현재 카드 수수료', { exact: true }).fill('2.1'); await next();
    await page.getByLabel('현재 월 정산한도', { exact: true }).fill('100000000'); await next();
    await page.getByLabel('현재 보증보험', { exact: true }).fill('30000000'); await next();
    await page.getByLabel('현재 정산주기', { exact: true }).fill('3'); await next();
  }
  await page.getByLabel('제목', { exact: true }).fill(title);
  await next();
  await page.getByLabel('견적 요청 세부 내용').fill('공개 작성 메모');
  await next();
}
async function completeAndLogin(page: Page) {
  await page
    .getByRole('button', { name: '작성 마치기', exact: true })
    .click();
  await page.getByRole('link', { name: '로그인하고 이어 쓸게요' }).click();
  await page.locator('input[name="email"]').fill('yeonseong.dev@gmail.com');
  await page.locator('input[name="password"]').fill('password123');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.waitForURL(/\/rfp-create\?resume=guest/);
}
test('public keyboard journey, refresh, login and explicit final request', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  const title = `공개 견적 ${randomUUID()}`;
  await fillQuote(page, title, true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: '함께 보낼 자료가 있나요?' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('quote-mobile.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: info.outputPath('quote-desktop.png'),
    fullPage: true,
  });
  const draftId = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).id,
    draftKey,
  );
  await completeAndLogin(page);
  expect(
    await db.select().from(rfps).where(eq(rfps.title, title)),
  ).toHaveLength(0);
  await page
    .getByRole('button', { name: '로그인 전 초안을 이어 써요' })
    .click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByRole('radio', { name: /서포터 B 페이/ })).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole('radio', { name: /서포터 B 페이/ }).check();
  // The calendar loads independently of PG recommendations; submission requires it.
  await expect(page.getByRole('button', { name: '5영업일', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('button', { name: '상담 요청하기', exact: true })
    .click();
  await page.waitForURL(/\/rfp\/P-/);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), draftKey),
  ).toBeNull();
  const [created] = await db.select().from(rfps).where(eq(rfps.title, title));
  expect(created.memo).toBe('공개 작성 메모');
  const [matching] = await db.select().from(rfpMatchingRequests).where(eq(rfpMatchingRequests.rfpId, created.id));
  expect(matching.currentPgs).toEqual([{ pgWorkspaceId: null, name: '기존 외부 결제회사' }]);
  const events = await db
    .select()
    .from(guestRfpEvents)
    .where(eq(guestRfpEvents.draftId, draftId));
  expect(events.map((e) => e.event).sort()).toEqual(['completed', 'started']);
});
test('attachment bytes survive refresh and login, failed upload remains retryable', async ({
  page,
}) => {
  test.setTimeout(150000);
  await fillQuote(page, '첨부 복원 확인');
  const bytes = '%PDF-1.4\n original local file';
  await page
    .getByLabel('견적 요청 첨부 파일', { exact: true })
    .setInputFiles({
      name: 'original.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(bytes),
    });
  await expect(page.getByText('파일을 저장하는 중이에요…')).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('original.pdf', { exact: true })).toBeVisible();
  await completeAndLogin(page);
  let calls = 0;
  const fileId = randomUUID();
  await page.route('**/api/files/presign', (route) => {
    calls++;
    return route.fulfill(
      calls === 1
        ? { status: 500, json: { error: 'test failure' } }
        : {
            json: {
              id: fileId,
              uploadUrl: new URL('/test-file-upload', page.url()).href,
            },
          },
    );
  });
  const received = { value: null as Buffer | null };
  await page.route('**/test-file-upload', (route) => {
    received.value = route.request().postDataBuffer();
    return route.fulfill({ status: 200, body: '' });
  });
  await page.route(`**/api/files/${fileId}/complete`, (route) =>
    route.fulfill({
      json: {
        id: fileId,
        name: 'original.pdf',
        size: Buffer.byteLength(bytes),
        mimeType: 'application/pdf',
      },
    }),
  );
  await page
    .getByRole('button', { name: '로그인 전 초안을 이어 써요' })
    .click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'original.pdf 업로드' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: '로그인 전 초안을 이어 써요' })
    .click();
  await expect(
    page.getByRole('button', { name: '다음', exact: true }),
  ).toBeVisible();
  expect(received.value?.toString()).toBe(bytes);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).files.length,
      draftKey,
    ),
  ).toBe(1);
});
test('storage quota failure remains visible', async ({ page }) => {
  await page.goto('/quote-start');
  await page.getByLabel('사업 운영 홈페이지').waitFor();
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'support-b-guest-rfp-v1')
        throw new DOMException('quota', 'QuotaExceededError');
      set.call(this, key, value);
    };
  });
  await page.getByLabel('사업 운영 홈페이지').fill('example.com');
  await expect(
    page.getByRole('alert').filter({ hasText: '저장 공간' }),
  ).toBeVisible();
});

for (const renewal of [false, true]) test(`signup and cross-device recovery after 24h approval (${renewal ? 'renewal' : 'new'})`, async ({ page, browser }) => {
  test.setTimeout(150000);
  const email = `guest-${randomUUID()}@example.test`;
  const workspaceName = `공개 가입 ${randomUUID().slice(0, 8)}`;
  const phone = `010${Date.now().toString().slice(-8)}`;
  await fillQuote(page, `가입 후 이어 쓰기 ${email}`, renewal);
  const fileId = randomUUID();
  const bytes = Buffer.from('%PDF-1.7 guest upload');
  await page.getByLabel('견적 요청 첨부 파일', { exact: true }).setInputFiles({ name: 'server-copy.pdf', mimeType: 'application/pdf', buffer: bytes });
  // R2 transport is replaced; the real draft API, signup and DB ownership stay live.
  await page.route('**/api/guest-rfp/drafts', async route => {
    const body = route.request().postDataJSON();
    if (body.op === 'file') {
      await db.insert(guestRfpFiles).values({ id: fileId, draftId: body.id, ...body.file });
      await route.fulfill({ json: { id: fileId, uploadUrl: new URL('/guest-upload-test', page.url()).href } });
    } else if (body.op === 'complete') {
      await db.update(guestRfpFiles).set({ status: 'ready' }).where(eq(guestRfpFiles.id, fileId));
      await route.fulfill({ json: { ok: true } });
    } else await route.continue();
  });
  await page.route('**/guest-upload-test', async route => { expect(route.request().postDataBuffer()).toEqual(bytes); await route.fulfill({ status: 200 }); });
  const before = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).data,
    draftKey,
  );
  await page
    .getByRole('button', { name: '작성 마치기', exact: true })
    .click();
  await page.getByRole('button', { name: '가입하고 이어 쓸게요' }).click();
  await page.getByLabel('이메일', { exact: true }).fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill('Password123!');
  await page.getByLabel('비밀번호 확인', { exact: true }).fill('Password123!');
  await page.getByRole('checkbox', { name: /이용약관 동의/ }).check();
  await page.getByRole('checkbox', { name: /개인정보 처리방침 동의/ }).check();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByPlaceholder('(주)샘플테크').fill(workspaceName);
  await page.getByLabel('사업자 등록번호', { exact: true }).fill('2208162517');
  await page.getByRole('button', { name: '조회', exact: true }).click();
  await page
    .getByRole('button', { name: '워크스페이스 만들기', exact: true })
    .click();
  await page.getByLabel('이름', { exact: true }).fill('공개 작성자');
  // Only SMS delivery is stubbed. Verification and signup use real server actions and DB.
  await db
    .insert(phoneOtps)
    .values({
      phone,
      codeHash: createHash('sha256').update('123456').digest('hex'),
      expiresAt: new Date(Date.now() + 300000),
    });
  await page.route('**/signup/buyer/profile', async (route) => {
    const request = route.request();
    if (request.method() === 'POST' && request.headers()['next-action']) {
      const body = JSON.parse(request.postData() || 'null');
      if (
        Array.isArray(body) &&
        Object.keys(body[0] ?? {}).length === 1 &&
        body[0]?.phone?.replaceAll('-', '') === phone
      ) {
        await route.fulfill({
          contentType: 'text/x-component',
          body: '0:{"a":"$@1","f":"","b":"test"}\n1:{"ok":true}\n',
        });
        return;
      }
    }
    await route.continue();
  });
  await page.getByLabel('휴대전화', { exact: true }).fill(phone);
  await page.getByRole('button', { name: '인증하기', exact: true }).click();
  await page.getByLabel('인증번호', { exact: true }).fill('123456');
  await expect(page.getByText('인증 완료 ✓', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /가입 완료/ }).click();
  await expect(
    page.getByRole('heading', { name: '이메일을 인증해 주세요' }),
  ).toBeVisible({ timeout: 20000 });
  await page.reload();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).data,
      draftKey,
    ),
  ).toEqual(before);
  // External email-link verification and operator approval are represented by their DB changes.
  await db
    .update(users)
    .set({ emailVerified: true, emailVerifiedAt: new Date() })
    .where(eq(users.email, email));
  await expect(
    page.getByRole('heading', { name: '거의 다 왔어요!' }),
  ).toBeVisible({ timeout: 15000 });
  const [user] = await db.select().from(users).where(eq(users.email, email));
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.name, workspaceName));
  await db
    .update(workspaces)
    .set({ status: 'active' })
    .where(eq(workspaces.id, workspace.id));
  const [saved] = await db.select().from(guestRfpDrafts).where(eq(guestRfpDrafts.userId, user.id));
  if (renewal) expect(saved.answers.data.currentPgs).toEqual([{ pgWorkspaceId: null, name: '기존 외부 결제회사' }]);
  expect(saved.workspaceId).toBe(workspace.id); expect(saved.applicationId).toBeTruthy(); expect(saved.expiresAt).toBeNull();
  await db.update(guestRfpDrafts).set({ updatedAt: new Date(Date.now() - 172800000) }).where(eq(guestRfpDrafts.id, saved.id));
  await page.evaluate(async () => { localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase('support-b-guest-rfp-files'); });
  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  try {
    await other.goto('/login');
    await other.locator('input[name="email"]').fill(email);
    await other.locator('input[name="password"]').fill('Password123!');
    await other.getByRole('button', { name: '로그인', exact: true }).click();
    await other.waitForURL(/\/rfp-create\?resume=guest/, { timeout: 30000 });
    await other.getByRole('button', { name: '계정에 보관한 초안을 이어 써요' }).click();
    await expect(other.getByRole('button', { name: '다음', exact: true })).toBeVisible();
    const [file] = await db.select().from(attachments).where(eq(attachments.id, fileId));
    expect(file.uploadedBy).toBe(user.id); expect(file.status).toBe('ready');
    await other.getByRole('button', { name: '다음', exact: true }).click();
    await other.getByRole('radio', { name: /서포터 B 페이/ }).check({ timeout: 15000 });
    await expect(other.getByRole('button', { name: '5영업일', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await other.getByRole('button', { name: '상담 요청하기', exact: true }).click();
    await other.waitForURL(/\/rfp\/P-/, { timeout: 30000 });
    const [done] = await db.select().from(guestRfpDrafts).where(eq(guestRfpDrafts.id, saved.id));
    expect(done.completedAt).not.toBeNull();
    const [attached] = await db.select().from(attachments).where(eq(attachments.id, fileId));
    expect(attached.rfpId).toBe(done.completedRfpId);
  } catch (error) {
    await test.info().attach('restored-browser', { body: await other.screenshot(), contentType: 'image/png' });
    await test.info().attach('restored-browser-state', { body: await other.locator('body').ariaSnapshot(), contentType: 'text/plain' });
    throw error;
  } finally { await fresh.close(); }

});

test('deleted industry returns to its question after business confirmation', async ({
  page,
}) => {
  test.setTimeout(90000);
  await fillQuote(page, '업종 변경 확인');
  await completeAndLogin(page);
  await page.evaluate((key) => {
    const d = JSON.parse(localStorage.getItem(key)!);
    d.data.industryGroupId = crypto.randomUUID();
    localStorage.setItem(key, JSON.stringify(d));
  }, draftKey);
  await page.reload();
  await page
    .getByRole('button', { name: '로그인 전 초안을 이어 써요' })
    .click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(
    page.getByRole('searchbox', { name: '업종 검색' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).data.contentQuestion,
      draftKey,
    ),
  ).toBe('industry');
});

test('PG login cannot import a buyer draft', async ({ page }) => {
  test.setTimeout(90000);
  await fillQuote(page, 'PG 계정 차단 확인');
  await page
    .getByRole('button', { name: '작성 마치기', exact: true })
    .click();
  await page.getByRole('link', { name: '로그인하고 이어 쓸게요' }).click();
  await page.locator('input[name="email"]').fill('ws-toss-admin@example.com');
  await page.locator('input[name="password"]').fill('password123');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.waitForURL(/notice=pg-rfp-blocked/);
  await page.goto('/quote-start');
  await expect(
    page.getByRole('heading', { name: '구매사 계정에서 견적을 요청해요' }),
  ).toBeVisible();
  const draft = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    draftKey,
  );
  expect(draft.data.title).toBe('PG 계정 차단 확인');
  expect(draft.owner).toBeUndefined();
});
