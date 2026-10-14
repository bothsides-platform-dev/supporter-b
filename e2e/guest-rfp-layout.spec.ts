import { test, expect } from 'playwright/test';
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { pgRecommendationGroups } from '@/lib/db/schema';

test('public layout, touch targets, keyboard errors and zoom reflow', async ({ page }, info) => {
  test.setTimeout(90000);
  await page.route('**/api/guest-rfp/events', route => route.fulfill({ json: { ok: true } }));
  await page.goto('/quote-start');
  const input = page.getByLabel('사업 운영 홈페이지');
  await input.waitFor();
  await expect(page.getByRole('progressbar', { name: '작성 진행' })).toBeVisible();
  for (const width of [390, 768, 1440, 320]) {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : width >= 1024 ? 900 : 844 });
    const sidebar = page.getByRole('list', { name: '견적 요청 순서' });
    const question = await page.getByRole('heading', { name: '어떤 홈페이지에서 판매하나요?' }).boundingBox();
    const field = await input.boundingBox();
    const previous = await page.getByRole('button', { name: '홈으로' }).boundingBox();
    const next = await page.getByRole('button', { name: '다음', exact: true }).boundingBox();
    if (width >= 1024) {
      await expect(sidebar).toBeVisible();
      const rail = await sidebar.boundingBox();
      expect(question!.x).toBeGreaterThan(rail!.x + rail!.width);
    } else {
      await expect(sidebar).not.toBeVisible();
    }
    await expect(input).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: '다음', exact: true })).toBeInViewport({ ratio: 1 });
    expect(field!.x).toBeCloseTo(question!.x, 0);
    expect(previous!.x).toBeCloseTo(field!.x, 0);
    expect(field!.width).toBeLessThanOrEqual(720);
    if (width < 1024) {
      if (width < 608) expect(question!.x).toBe(20);
      expect(previous!.height).toBeGreaterThanOrEqual(44);
      expect(next!.height).toBeGreaterThanOrEqual(44);
      if (width < 640) expect(next!.width).toBeGreaterThan(previous!.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`quote-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const disclosure = page.getByText('전달·보관 안내 자세히 보기', { exact: true });
  const details = disclosure.locator('..');
  await expect(details).not.toHaveAttribute('open');
  await expect(page.getByRole('complementary', { name: '작성 전 안내' })).toBeVisible();
  await disclosure.focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open');
  await expect(details.getByText(/다른 기기에서는 이어 쓸 수 없어요/)).toBeVisible();
  await page.keyboard.press('Space');
  await expect(details).not.toHaveAttribute('open');
  await input.press('Enter');
  await expect(input).toBeFocused();
  await expect(page.getByRole('alert').filter({ hasText: '홈페이지' })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 844 });
  await input.fill('example.com');
  await input.press('Enter');
  const skip = page.getByRole('button', { name: '지금은 건너뛰어요' });
  await expect(skip).toBeVisible();
  const skipBox = await skip.boundingBox();
  const nextBox = await page.getByRole('button', { name: '다음', exact: true }).boundingBox();
  expect(skipBox!.height).toBeGreaterThanOrEqual(44);
  expect(skipBox!.y + skipBox!.height).toBeLessThanOrEqual(nextBox!.y);
  const cafe = page.getByRole('button', { name: '카페24', exact: true });
  await cafe.click();
  await expect(cafe).toHaveAttribute('aria-pressed', 'true');
  expect((await cafe.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: info.outputPath('solution-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(cafe).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: info.outputPath('solution-desktop.png'), fullPage: true });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.screenshot({ path: info.outputPath('solution-desktop-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath('solution-mobile-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 640, height: 400 });
  await page.getByRole('button', { name: '다음', exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: '다음', exact: true }).click({ trial: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => {
    const key = 'support-b-guest-rfp-v1';
    const draft = JSON.parse(localStorage.getItem(key)!);
    draft.data.contentQuestion = 'delivery';
    localStorage.setItem(key, JSON.stringify(draft));
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: '배송이나 서비스 완료까지 얼마나 걸리나요?' })).toBeVisible();
  await page.setViewportSize({ width: 640, height: 900 });
  await page.addStyleTag({ content: 'html { zoom: 2; }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('quote-200-percent.png'), fullPage: true });
});


test('long industry results, renewal and missing attachments keep actions reachable', async ({ page }, info) => {
  test.setTimeout(90000);
  const groups = Array.from({ length: 18 }, (_, index) => ({
    id: randomUUID(), name: `레이아웃검증 긴 업종 이름과 판매 서비스 ${index + 1}`,
  }));
  await db.insert(pgRecommendationGroups).values(groups);
  try {
    await page.route('**/api/guest-rfp/events', route => route.fulfill({ json: { ok: true } }));
    await page.goto('/quote-start');
    await page.getByLabel('사업 운영 홈페이지').fill('example.com');
    for (const question of ['industry', 'annual', 'attachments']) {
      await page.evaluate(question => {
        const key = 'support-b-guest-rfp-v1';
        const draft = JSON.parse(localStorage.getItem(key)!);
        draft.data.contentQuestion = question;
        draft.data.contractType = 'renewal';
        draft.files = question === 'attachments'
          ? [{ id: 'missing-local-file', name: '저장하지못한첨부자료.pdf', size: 4, type: 'application/pdf' }]
          : [];
        localStorage.setItem(key, JSON.stringify(draft));
      }, question);
      await page.reload();
      await expect(page.getByLabel('질문 진행률')).toContainText('/ 19');
      if (question === 'industry') {
        await page.getByRole('searchbox', { name: '업종 검색' }).fill('레이아웃검증');
        await expect(page.getByRole('radio', { name: /레이아웃검증/ })).toHaveCount(18);
      }
      if (question === 'attachments') await expect(page.getByText('첨부 원본을 아직 보관하지 못했어요')).toBeVisible();
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: width === 768 ? 1024 : width === 1440 ? 900 : 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const next = page.getByRole('button', { name: question === 'attachments' ? '작성 마치기' : '다음', exact: true });
        await next.scrollIntoViewIfNeeded();
        await expect(next).toBeInViewport({ ratio: 1 });
        await next.click({ trial: true });
        await page.screenshot({ path: info.outputPath(`${question}-${width}.png`), fullPage: true });
      }
    }
  } finally {
    await db.delete(pgRecommendationGroups).where(inArray(pgRecommendationGroups.id, groups.map(group => group.id)));
  }
});
