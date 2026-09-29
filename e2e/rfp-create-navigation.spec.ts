import { test, expect } from 'playwright/test';
import { loginAs } from './_helpers';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { pgMatchingPolicies, pgRecommendationGroups, workspaces } from '@/lib/db/schema';

test('구매사 질문은 키보드로 이동하고 긴 답변에서도 질문과 버튼을 볼 수 있다', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await loginAs(page, 'buyer');
  await page.goto('/rfp-create');

  const actions = page.getByRole('group', { name: '작성 이동' });
  await expect(actions.getByRole('button', { name: '이전' })).toBeDisabled();
  await expect(actions.getByRole('button', { name: '다음' })).toBeInViewport();
  await page.keyboard.press('Enter');

  const website = page.getByRole('textbox', { name: '사업 운영 홈페이지' });
  await page.setViewportSize({ width: 390, height: 844 });
  await actions.getByRole('button', { name: '다음' }).click();
  await expect(website).toBeFocused();
  await expect(website).toHaveAttribute('inputmode', 'url');
  await expect(website).toHaveAttribute('autocapitalize', 'none');
  await expect(website).toHaveAccessibleDescription(/홈페이지 주소를 입력해주세요/);
  await website.fill('example.com');
  await website.press('Enter');
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByRole('heading', { name: '홈페이지를 어떻게 만들었나요?' })).toBeVisible();
  await page.keyboard.press('Shift+Enter');
  await expect(website).toHaveValue('https://example.com');
  await website.press('Enter');
  await page.keyboard.press('Enter');

  const heading = page.getByRole('heading', { name: '어떤 업종에 해당하나요?' });
  await expect(heading).toBeVisible();
  const content = page.getByTestId('rfp-question-scroll');
  await page.setViewportSize({ width: 1280, height: 450 });
  expect(await content.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
  await content.evaluate(element => { element.scrollTop = element.scrollHeight; });
  expect(await content.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(heading).toBeInViewport({ ratio: 1 });
  await expect(page.getByLabel('질문 진행률')).toBeInViewport({ ratio: 1 });
  await expect(actions.getByRole('button', { name: '이전' })).toBeInViewport();
  await expect(actions.getByRole('button', { name: '다음' })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('desktop-scrolled.png') });

  await page.setViewportSize({ width: 390, height: 500 });
  const mobileContent = page.locator('[data-coachmark="tutorial-wizard-content"]');
  expect(await mobileContent.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
  await mobileContent.evaluate(element => { element.scrollTop = element.scrollHeight; });
  expect(await mobileContent.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(actions.getByRole('button', { name: '이전' })).toBeInViewport();
  await expect(actions.getByRole('button', { name: '다음' })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('mobile-scrolled.png') });

  // 1280×720 화면을 브라우저에서 200% 확대한 유효 CSS 뷰포트를 640×360으로 근사한다.
  await page.setViewportSize({ width: 640, height: 360 });
  await page.getByRole('radio', { name: '업종을 직접 입력할게요' }).check();
  const zoomedContent = page.locator('[data-coachmark="tutorial-wizard-content"]');
  expect(await zoomedContent.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
  await zoomedContent.evaluate(element => { element.scrollTop = element.scrollHeight; });
  expect(await zoomedContent.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await expect(page.getByPlaceholder('예: 반려동물 방문 돌봄')).toBeInViewport();
  await expect(actions.getByRole('button', { name: '이전' })).toBeInViewport({ ratio: 1 });
  await expect(actions.getByRole('button', { name: '다음' })).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: testInfo.outputPath('zoom-200-scrolled.png') });
});

test('최종 확인의 긴 내용·추천 대기와 다크 화면에서도 이동 버튼이 남는다', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const pg = (await db.select().from(workspaces)).find(workspace => workspace.name === '서포터 B 페이')!;
  const groupId = randomUUID();
  const industryName = `화면 검증 ${groupId.slice(0, 8)}`;
  await db.insert(pgRecommendationGroups).values({ id: groupId, name: industryName });
  await db.insert(pgMatchingPolicies).values({ groupId, policy: { risk: 'gray', candidates: [{ pgWorkspaceId: pg.id, reason: '화면 검증', feeMin: 0.8, feeMax: 0.9, feeNote: '카드 결제·부가세 별도' }] } });
  try {
    await page.setViewportSize({ width: 1280, height: 720 });
    await loginAs(page, 'buyer');
    await page.goto('/rfp-create');
    const actions = page.getByRole('group', { name: '작성 이동' });
    const next = () => actions.getByRole('button', { name: '다음', exact: true }).click();
    await next();
    await page.getByPlaceholder('example.com').fill('example.com');
    await next();
    await next();
    await page.getByRole('searchbox', { name: '업종 검색' }).fill(industryName);
    await page.getByRole('radio', { name: industryName, exact: true }).check();
    await next();
    await page.getByPlaceholder('의류').fill('의류');
    await next();
    await actions.getByRole('button', { name: '건너뛰기' }).click();
    await page.getByRole('radio', { name: '아니요', exact: true }).check();
    await next();
    await page.getByRole('radio', { name: '10만원 미만', exact: true }).check();
    await next();
    await page.getByRole('checkbox', { name: '해당 없음', exact: true }).check();
    await next();
    await next();
    await page.getByRole('button', { name: '신규 계약', exact: true }).click();
    await next();
    await page.getByRole('button', { name: '카드', exact: true }).click();
    await next();
    await page.getByPlaceholder('2026 서포트쇼핑몰 결제 인프라 견적 요청').fill('화면 검증 상담');
    await next();
    await next();
    await actions.getByRole('button', { name: '내용 확인하기' }).click();
    await expect(actions.getByRole('button', { name: '이전' })).toBeInViewport();
    await expect(actions.getByRole('button', { name: '상담 요청하기' })).toBeDisabled();
    await expect(page.getByRole('radio', { name: new RegExp(pg.name) })).toBeVisible({ timeout: 20_000 });
    // 핵심 요약만으로는 1280×720에 다 들어가므로, 전체 답변을 펼쳐 긴 내용을 만든다.
    await page.getByText('요청 내용 전체 보기').click();
    const content = page.locator('[data-coachmark="tutorial-wizard-content"]');
    expect(await content.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
    await content.evaluate(element => { element.scrollTop = element.scrollHeight; });
    expect(await content.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await expect(actions.getByRole('button', { name: '이전' })).toBeInViewport();
    await expect(actions.getByRole('button', { name: '상담 요청하기' })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('review-desktop-light.png') });

    await page.getByRole('button', { name: '다크 모드로 전환' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    // 테마 전환은 350ms View Transition이므로 완전히 끝난 뒤 색을 확인한다.
    await page.waitForTimeout(400);
    await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))); });
    await page.screenshot({ path: testInfo.outputPath('review-desktop-dark.png') });
    await page.setViewportSize({ width: 390, height: 640 });
    // 1024px 미만에서는 PG 선택 화면과 마감일·요약 화면이 나뉜다.
    await expect(actions.getByRole('button', { name: '이전' })).toBeInViewport();
    await expect(actions.getByRole('button', { name: '다음', exact: true })).toBeInViewport();
    await page.getByRole('radio', { name: new RegExp(pg.name) }).check();
    await actions.getByRole('button', { name: '다음', exact: true }).click();
    await content.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(actions.getByRole('button', { name: '이전' })).toBeInViewport();
    await expect(actions.getByRole('button', { name: '상담 요청하기' })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('review-mobile-dark.png') });
  } finally {
    await db.delete(pgRecommendationGroups).where(eq(pgRecommendationGroups.id, groupId));
  }
});
