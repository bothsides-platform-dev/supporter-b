import { test, expect } from 'playwright/test';

test('public layout, touch targets, keyboard errors and zoom reflow', async ({ page }, info) => {
  test.setTimeout(90000);
  await page.route('**/api/guest-rfp/events', route => route.fulfill({ json: { ok: true } }));
  await page.goto('/quote-start');
  const input = page.getByLabel('사업 운영 홈페이지');
  await input.waitFor();
  await expect(page.getByRole('heading', { name: '맞춤 PG 견적을 준비해요' })).toBeInViewport();
  await input.press('Enter');
  await expect(input).toBeFocused();
  await expect(page.getByRole('alert').filter({ hasText: '홈페이지' })).toBeVisible();
  for (const width of [390, 320, 1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
    const title = await page.getByRole('heading', { name: '맞춤 PG 견적을 준비해요' }).boundingBox();
    const question = await page.getByRole('heading', { name: '어떤 홈페이지에서 판매하나요?' }).boundingBox();
    const field = await input.boundingBox();
    const previous = await page.getByRole('button', { name: '홈으로' }).boundingBox();
    const next = await page.getByRole('button', { name: '다음', exact: true }).boundingBox();
    expect(title!.x).toBeCloseTo(question!.x, 0);
    expect(field!.x).toBeCloseTo(question!.x, 0);
    expect(previous!.x).toBeCloseTo(field!.x, 0);
    expect(title!.width).toBeLessThanOrEqual(576);
    if (width < 640) {
      expect(title!.x).toBe(16);
      expect(previous!.height).toBeGreaterThanOrEqual(44);
      expect(next!.height).toBeGreaterThanOrEqual(44);
      expect(next!.width).toBeGreaterThan(previous!.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`quote-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await input.fill('example.com');
  await input.press('Enter');
  const skip = page.getByRole('button', { name: '지금은 건너뛰어요' });
  await expect(skip).toBeVisible();
  const skipBox = await skip.boundingBox();
  const nextBox = await page.getByRole('button', { name: '다음', exact: true }).boundingBox();
  expect(skipBox!.height).toBeGreaterThanOrEqual(44);
  expect(skipBox!.y).toBeGreaterThanOrEqual(nextBox!.y + nextBox!.height);
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
