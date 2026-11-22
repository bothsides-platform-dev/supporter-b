import { expect, test } from 'playwright/test';

for (const width of [390, 1440]) {
  test(`신규 견적은 홈페이지 판가 기준으로 비교한다 ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/demo');
    await page.getByRole('button', { name: '견적 요청부터 체험하기' }).click();
    await page.getByRole('link', { name: '견적 요청하기', exact: true }).click();
    await page.getByRole('button', { name: '다음', exact: true }).click();
    const questions = page.getByLabel('질문 진행률');
    await expect(questions).toBeVisible();
    let selectedNew = false;
    for (let i = 0; i < 25 && await questions.isVisible(); i++) {
      const newContract = page.getByRole('button', { name: '신규 계약', exact: true });
      if (await newContract.isVisible()) {
        await newContract.click();
        selectedNew = true;
      }
      await page.locator('[data-coachmark="demo-question-next"]').click();
    }
    expect(selectedNew).toBe(true);
    await page.locator('[data-coachmark="demo-pg-choice"]').click();
    const reviewNext = page.locator('[data-coachmark="demo-review-next"]');
    if (await reviewNext.isVisible()) await reviewNext.click();
    await page.locator('[data-coachmark="tutorial-wizard-submit"]').click();
    await page.getByPlaceholder(/메시지/).fill('신규 계약 견적을 확인하고 싶어요.');
    await page.locator('[data-coachmark="demo-send"]').click();
    await page.getByRole('button', { name: '받은 견적 확인하기', exact: true }).click();
    await expect(page.getByRole('heading', { name: '홈페이지 판가보다 이만큼 좋아져요' })).toBeVisible();
    const card = page.getByTestId('metric-row-card');
    await expect(card.getByText('홈페이지 판가', { exact: true })).toBeVisible();
    await expect(card.getByText('2.80%', { exact: true })).toBeVisible();
    await expect(card.getByText('2.00%', { exact: true })).toBeVisible();
    await expect(card).toContainText('↓0.80%p');
    await expect(page.getByText('현재 조건', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '위치 보기', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('new-contract.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.getByRole('button', { name: '영세', exact: true }).click();
    await expect(card.getByText('2.30%', { exact: true })).toBeVisible();
    await expect(card.getByText('1.80%', { exact: true })).toBeVisible();
    await expect(card).toContainText('↓0.50%p');
    await page.getByRole('button', { name: '이 견적 선정하기', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '데모페이의 견적을 선정할까요?' });
    await expect(dialog.getByRole('region', { name: '선정할 견적의 핵심 조건' })).toContainText('2.00%');
    await dialog.getByRole('button', { name: '선정할게요', exact: true }).click();
    await expect(page.getByRole('tab', { name: '합의서 작성', exact: true })).toHaveAttribute('aria-selected', 'true');
  });
}

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
