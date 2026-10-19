import { test, expect } from 'playwright/test';

test('landing calculator reflows and keeps input, pointer and keyboard results synchronized', async ({ page }, info) => {
  test.setTimeout(120000);
  await page.route('**/api/auth/session', route => route.fulfill({ json: {} }));
  await page.goto('/');
  const calculator = page.locator('#calculator');
  const annual = calculator.getByLabel('예상 연간 절감액', { exact: true });
  await calculator.scrollIntoViewIfNeeded();
  await expect(annual).toBeVisible();
  await expect(annual).toHaveText('1,000만 원');
  for (const [width, zoom, dark] of [[360, 1, false], [768, 1, false], [1440, 1, false], [1440, 1, true], [720, 2, false]] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(({ zoom, dark }) => {
      document.documentElement.style.zoom = String(zoom);
      document.documentElement.classList.toggle('dark', dark);
    }, { zoom, dark });
    await calculator.scrollIntoViewIfNeeded();
    expect(await calculator.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const result = await annual.boundingBox();
    const input = await calculator.getByRole('textbox', { name: '연간 카드 거래액' }).boundingBox();
    const cta = await calculator.getByRole('link', { name: '맞춤 PG 견적 무료로 받기' }).boundingBox();
    if (!result || !input || !cta) throw new Error('Calculator layout missing');
    if (width / zoom < 1024) {
      expect(result.y).toBeLessThan(input.y);
      expect(input.y).toBeLessThan(cta.y);
    } else expect(input.x).toBeLessThan(result.x);
    for (const control of await calculator.locator('button, input, a').all()) {
      const box = await control.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44 * zoom);
    }
    for (const slider of await calculator.getByRole('slider').all()) {
      const box = await slider.locator('xpath=../..').boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44 * zoom);
    }
    await calculator.screenshot({ path: info.outputPath(`calculator-${width}-${zoom}-${dark ? 'dark' : 'light'}.png`) });
  }
  await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await calculator.getByRole('button', { name: '1억 원', exact: true }).click();
  await calculator.getByRole('button', { name: '0.5%p', exact: true }).click();
  await expect(annual).toHaveText('50만 원');
  const rate = calculator.getByRole('slider', { name: '수수료 인하 폭' });
  await rate.focus(); await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expect(annual).toHaveText('10만 원');
  await expect(calculator.getByRole('status')).toContainText('10만 원');
  await rate.scrollIntoViewIfNeeded();
  const track = await rate.locator('xpath=../..').boundingBox();
  if (!track) throw new Error('Slider track missing');
  await page.mouse.move(track.x + track.width / 3, track.y + track.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * 2 / 3, track.y + track.height / 2);
  await expect(annual).toHaveText('200만 원');
  await page.waitForTimeout(650);
  await expect(calculator.getByRole('status')).toContainText('10만 원');
  await page.mouse.up();
  await expect(calculator.getByRole('status')).toContainText('200만 원');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await calculator.getByRole('textbox', { name: '수수료 인하 폭' }).fill('4.25');
  await expect(rate).toHaveAttribute('aria-valuemax', '4.25');
  await expect(annual).toHaveText('425만 원');
  await calculator.getByRole('textbox', { name: '연간 카드 거래액' }).fill('');
  await expect(annual).toHaveText('—');
  await expect(calculator.getByRole('link', { name: '맞춤 PG 견적 무료로 받기' })).toHaveAttribute('href', '/quote-start');
});
