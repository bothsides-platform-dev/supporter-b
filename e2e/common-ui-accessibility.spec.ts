import { test, expect } from 'playwright/test';
import { loginAs } from './_helpers';

test('로그인 체크박스는 키보드 초점을 표시하고 Space로 변경한다', async ({ page }) => {
  await page.goto('/login');
  const checkbox = page.getByRole('checkbox', { name: '로그인 유지' });
  await page.getByRole('button', { name: '비밀번호 보기', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(checkbox).toBeFocused();
  const box = page.getByTestId('checkbox-box');
  await expect.poll(() => box.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
  await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
});

test('검색 모달은 초점을 가두고 닫은 뒤 트리거로 돌려준다', async ({ page }) => {
  await loginAs(page, 'buyer');
  const trigger = page.getByRole('button', { name: /검색…/ });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '검색', exact: true });
  const input = dialog.getByRole('combobox', { name: '검색어', exact: true });
  await expect(input).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '닫기' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(input).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/\/home$/);
});

test('메시지 탭은 방향키로 초점만 옮기고 Enter로 선택한다', async ({ page }) => {
  await loginAs(page, 'buyer');
  await page.goto('/messages');
  const all = page.getByRole('tab', { name: '전체', exact: true });
  const team = page.getByRole('tab', { name: '팀', exact: true });
  await all.focus();
  await page.keyboard.press('End');
  await expect(team).toBeFocused();
  await expect(all).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(team).toHaveAttribute('aria-selected', 'true');
  const panel = page.getByRole('tabpanel', { name: '팀', exact: true });
  await expect(panel).toBeVisible();
  await expect(team).toHaveAttribute('aria-controls', await panel.getAttribute('id') ?? '');
});

for (const theme of ['light', 'dark'] as const) {
  test(`동작 줄이기: ${theme} 페이지·사이드바·모바일 시트`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
    await loginAs(page, 'buyer');
    const entrance = page.locator('.page-enter');
    await expect(entrance).toHaveCSS('animation-name', 'none');
    await expect(entrance).toHaveCSS('opacity', '1');
    await expect(entrance).toHaveCSS('transform', 'none');
    const toggle = page.getByRole('button', { name: '사이드바 접기', exact: true });
    await toggle.click();
    await expect(page.locator('[data-slot="sidebar-gap"]')).toHaveCSS('transition-property', 'none');
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileToggle = page.getByRole('button', { name: '사이드바 펼치기', exact: true });
    await mobileToggle.click();
    const sheet = page.getByRole('dialog', { name: 'Sidebar', exact: true });
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveCSS('translate', 'none');
    await expect(sheet).toHaveCSS('transition-property', 'opacity');
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(mobileToggle).toBeFocused();
  });
}
