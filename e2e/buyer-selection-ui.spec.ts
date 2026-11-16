import { expect, test } from 'playwright/test';

for (const width of [320, 390, 1024, 1440]) {
  test(`견적 조건과 선정 행동을 가리지 않는다 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/demo');
    await page.getByRole('button', { name: '핵심 흐름 체험하기', exact: true }).click();
    const action = page.getByRole('button', { name: '이 견적 선정하기', exact: true });
    await expect(action).toBeVisible();
    await expect(page.getByRole('button', { name: '위치 보기', exact: true })).toBeVisible();
    const footer = page.getByRole('group', { name: '견적 선정', exact: true });
    const panel = page.getByRole('tabpanel', { name: '견적 비교', exact: true });
    await expect(panel.getByRole('button', { name: '상담 내역과 다른 PG 문의' })).toHaveAttribute('aria-expanded', 'false');
    await expect(panel.getByText('내 등급: 중소2')).toBeVisible();
    const summary = page.getByTestId('metric-row-card');
    const summaryBox = await summary.boundingBox();
    const footerBox = await footer.boundingBox();
    expect(summaryBox!.y + summaryBox!.height).toBeLessThanOrEqual(footerBox!.y);

    const position = await action.boundingBox();
    await panel.getByRole('button', { name: /전체 결제수단 요율/ }).click();
    await panel.getByRole('button', { name: '상담 내역과 다른 PG 문의' }).click();
    await expect(panel.getByRole('link', { name: '다른 PG 상담을 문의해요' })).toHaveAttribute('href', /^mailto:/);
    await panel.evaluate((element) => { element.parentElement!.scrollTop = element.parentElement!.scrollHeight; });
    expect((await action.boundingBox())!.y).toBe(position!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await panel.evaluate((element) => element.parentElement!.scrollWidth <= element.parentElement!.clientWidth)).toBe(true);
    const chat = page.getByRole('button', { name: '채팅 열기', exact: true });
    if (await chat.isVisible()) {
      const chatBox = await chat.boundingBox();
      const actionBox = await action.boundingBox();
      expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(chatBox!.x);
    }

    await page.getByRole('tab', { name: '요청 조건', exact: true }).click();
    await expect(footer).toHaveCount(0);
    await page.getByRole('tab', { name: '견적 비교', exact: true }).click();
    await expect(action).toHaveCount(1);
    await action.focus();
    await action.press('Enter');
    const dialog = page.getByRole('dialog', { name: '데모페이의 견적을 선정할까요?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('region', { name: '선정할 견적의 핵심 조건' })).toContainText('2.00%');
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(action).toBeFocused();
    await action.click();
    await dialog.getByRole('button', { name: '선정할게요', exact: true }).click();
    await expect(page.getByRole('tab', { name: '합의서 작성', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(footer).toHaveCount(0);
  });
}
