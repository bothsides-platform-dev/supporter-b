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
  const volume = page.getByRole('slider', { name: '연간 카드 거래액' });
  for (const [width, zoom] of [[320, 1], [1440, 1], [640, 2]]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(zoom => { document.documentElement.style.zoom = String(zoom); }, zoom);
    await annual.scrollIntoViewIfNeeded();
    await expect(annual).toHaveText('1,000만 원');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const control of [volume, page.getByRole('slider', { name: '수수료 인하 폭' }), page.getByRole('button', { name: '가입하고 이어 쓸게요' })]) {
      await control.scrollIntoViewIfNeeded();
      await control.click({ trial: true });
      expect(await control.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    await page.screenshot({ path: info.outputPath(`savings-${width}-${zoom}.png`), fullPage: true });
  }
  await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
  await page.getByRole('button', { name: '연간 카드 거래액 직접 입력' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('textbox', { name: '연간 카드 거래액' }).fill('100000000');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '연간 카드 거래액 직접 입력' })).toBeFocused();
  await expect(annual).toHaveText('100만 원');
  const rate = page.getByRole('slider', { name: '수수료 인하 폭' });
  await rate.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect(annual).toHaveText('50만 원');
  await expect(page.getByLabel('확정 절감 예상')).toContainText('50만 원');
  expect(await page.evaluate(key => localStorage.getItem(key), GUEST_DRAFT_KEY)).toBe(before);
  await page.getByRole('button', { name: '홈페이지 수정' }).click();
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(volume).toHaveAttribute('aria-valuenow', '100000000');
  await expect(annual).toHaveText('50만 원');
  await expect(page.getByRole('link', { name: '로그인하고 이어 쓸게요' })).toHaveAttribute('href', '/login?next=%2Frfp-create%3Fresume%3Dguest');
  // 가입은 서버 저장 후 이동하는 버튼이다 — 저장·이동 흐름은 guest-rfp-intake.spec.ts 가 검증한다.
  await expect(page.getByRole('button', { name: '가입하고 이어 쓸게요' })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await rate.scrollIntoViewIfNeeded();
  const track = await rate.locator('xpath=../..').boundingBox();
  if (!track) throw new Error('slider has no touch bounds');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const touch = (fraction: number) => [{ x: track.x + track.width * fraction, y: track.y + track.height / 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touch(0.25) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touch(0.75) });
  await expect(rate).toHaveAttribute('aria-valuenow', '2.3');
  await page.waitForTimeout(650);
  await expect(page.getByLabel('확정 절감 예상')).toContainText('50만 원');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByLabel('확정 절감 예상')).toContainText('230만 원');
  await rate.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await cdp.detach();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '연간 카드 거래액 직접 입력' }).click();
  await page.getByRole('textbox', { name: '연간 카드 거래액' }).fill('1000000000');
  await expect(annual).toHaveText('500만 원');
  expect(await page.locator('canvas').evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
});
