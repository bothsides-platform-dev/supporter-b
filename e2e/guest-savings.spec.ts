import { test, expect } from 'playwright/test';
import { createGuestDraft, GUEST_DRAFT_KEY } from '@/lib/guest-rfp/draft';

test('calculator reflows, supports keyboard input, preserves draft and keeps auth return links', async ({ page }, info) => {
  test.setTimeout(90000);
  const draft = createGuestDraft();
  Object.assign(draft.data, {
    contentQuestion: 'attachments', websiteUrl: 'https://example.com', title: '테스트', mainProducts: '상품',
    industryMode: 'custom', customIndustryName: '방문 돌봄', contractType: 'new', requiredPaymentMethods: ['card'],
    productInfo: { cashConvertible: false, maximumPrice: 'under_100k', salesMethods: ['none'] },
  });
  await page.route('**/api/guest-rfp/events', route => route.fulfill({ json: { ok: true } }));
  await page.addInitScript(({ key, draft }) => localStorage.setItem(key, JSON.stringify(draft)), { key: GUEST_DRAFT_KEY, draft });
  await page.goto('/quote-start');
  await page.getByRole('button', { name: '작성 마치기' }).click();
  await expect(page.getByRole('heading', { name: 'PG 수수료, 얼마나 아낄 수 있을까요?' })).toBeFocused();
  const before = await page.evaluate(key => localStorage.getItem(key), GUEST_DRAFT_KEY);
  const annual = page.getByLabel('연간 절감 예상액');
  const volume = page.getByLabel('연간 카드 거래액');
  for (const [width, zoom] of [[320, 1], [1440, 1], [640, 2]]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(zoom => { document.documentElement.style.zoom = String(zoom); }, zoom);
    await annual.scrollIntoViewIfNeeded();
    await expect(annual).toHaveText('300만 원');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const control of [volume, page.getByLabel('수수료 인하 폭'), page.getByRole('link', { name: '가입하고 이어 쓸게요' })]) {
      await control.scrollIntoViewIfNeeded();
      await control.click({ trial: true });
      expect(await control.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    await page.screenshot({ path: info.outputPath(`savings-${width}-${zoom}.png`), fullPage: true });
  }
  await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
  await page.getByRole('button', { name: '1억 원' }).focus();
  await page.keyboard.press('Enter');
  await expect(annual).toHaveText('30만 원');
  await page.getByLabel('수수료 인하 폭').fill('0.5');
  await expect(annual).toHaveText('50만 원');
  await expect(page.getByLabel('확정 절감 예상')).toContainText('50만 원');
  expect(await page.evaluate(key => localStorage.getItem(key), GUEST_DRAFT_KEY)).toBe(before);
  await page.getByRole('button', { name: '홈페이지 수정' }).click();
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(volume).toHaveValue('100,000,000');
  await expect(annual).toHaveText('50만 원');
  await expect(page.getByRole('link', { name: '로그인하고 이어 쓸게요' })).toHaveAttribute('href', '/login?next=%2Frfp-create%3Fresume%3Dguest');
  await expect(page.getByRole('link', { name: '가입하고 이어 쓸게요' })).toHaveAttribute('href', '/signup/buyer?next=%2Frfp-create%3Fresume%3Dguest');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '10억 원' }).click();
  await expect(annual).toHaveText('500만 원');
  expect(await page.locator('canvas').evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
});
