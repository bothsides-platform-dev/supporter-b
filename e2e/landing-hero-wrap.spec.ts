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
      ['받은 견적이 회사에 유리한지 판단이 어려울 때.', '어려울'],
      ['우리 서비스가 PG사에 가입이 될지 막막할 때.', '막막할'],
      ['결제 오픈 전까지 무엇부터 준비할지 고민될 때.', '고민될'],
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

// 데스크톱 롤링 줄의 폭 breakpoint(1920px)는 램프가 아니라 계단형이다 — 네 후보 문구의
// 폭이 서로 달라서, 매끈하게 늘리면 더 좁은 문구만 먼저 한 줄로 붙고 가장 넓은 문구는
// 여전히 두 줄로 남는 혼재 구간(실측 약 1512~1600px)이 생긴다. 1920px 미만에서는 모든
// 문구가 항상 두 줄, 1920px 이상에서는 모든 문구가 항상 한 줄이어야 한다. 애니메이션
// 순환을 기다리지 않고, 항상 렌더되는 숨은 측정용 그리드([data-roll-sizing])의 조각
// 폭을 실제 롤링 줄 폭과 비교해 네 문구 모두의 줄 수를 한 번에 판정한다.
for (const [width, expectSingleLine] of [
  [1600, false], // 이전 램프 구현에서 혼재가 발생했던 구간 — 여전히 모두 2줄이어야 한다
  [1919, false], // breakpoint 바로 아래 — 모두 2줄
  [1920, true], // breakpoint — 모두 1줄로 전환
  [2560, true], // breakpoint 위 — 모두 1줄
] as const) {
  test(`buyer hero rolling line shows the same line count for every phrase at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();

    const fits = await heading.evaluate((h1) => {
      const sizing = h1.querySelector('[data-roll-sizing]')!;
      const phraseGroups = Array.from(sizing.children);
      const segWidths = phraseGroups.map((group) =>
        Array.from(group.querySelectorAll('[data-roll-segment]')).map(
          (seg) => seg.getBoundingClientRect().width,
        ),
      );
      const rollingSpan = h1.querySelector('span.block.overflow-hidden')!;
      const rollWidth = rollingSpan.getBoundingClientRect().width;
      // 세그먼트 사이 공백 1칸은 segment 텍스트에 포함되지 않으므로 보수적으로 더해준다.
      const spaceGapPx = 0.28 * 72;
      return segWidths.map(
        (ws) =>
          ws.reduce((a, b) => a + b, 0) + spaceGapPx * (ws.length - 1) <=
          rollWidth,
      );
    });

    expect(fits).toEqual(fits.map(() => expectSingleLine));
  });
}
