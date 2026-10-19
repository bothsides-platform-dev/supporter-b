import { test, expect } from 'playwright/test';

for (const width of [320, 390, 768, 1440]) {
  test(`buyer hero keeps each ending together at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    const initialHeight = (await heading.boundingBox())!.height;
    const phrases = [
      ['PG사마다 같은 설명을 반복하기 번거로울 때.', '번거로울'],
      ['받은 견적이 우리 회사에 유리한지 판단하기 어려울 때.', '어려울'],
      ['우리 서비스도 PG에 가입할 수 있는지 막막할 때.', '막막할'],
      ['결제 오픈까지 무엇부터 준비할지 고민될 때.', '고민될'],
    ];
    const current = heading.locator('[data-roll-layer="current"]');
    for (const [phrase, ending] of phrases) {
      await expect(current).toHaveText(phrase, { timeout: 20_000 });
      await expect(heading.locator('[data-roll-layer="next"]')).toHaveCount(0);
      const boxes = await current
        .locator('[data-roll-word]')
        .evaluateAll((words) =>
          words.map((word) => {
            const r = word.getBoundingClientRect();
            return {
              text: word.textContent,
              top: r.top,
              left: r.left,
              right: r.right,
            };
          }),
        );
      const beforeWhen = boxes.find((word) => word.text === ending)!;
      const when = boxes.at(-1)!;
      expect(when.text).toBe('때.');
      expect(when.top).toBeCloseTo(beforeWhen.top, 0);
      for (const word of boxes) {
        expect(word.left).toBeGreaterThanOrEqual(0);
        expect(word.right).toBeLessThanOrEqual(width);
      }
      expect((await heading.boundingBox())!.height).toBeCloseTo(
        initialHeight,
        0,
      );
    }
  });
}
