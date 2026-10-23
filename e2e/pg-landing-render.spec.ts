import { test, expect } from 'playwright/test';

// Keep the real server/client boundary: a jsdom render does not reproduce
// the lazy React nodes Next.js sends for the heading and intro slots.
for (const width of [1440, 390]) {
  test(`PG 랜딩 제목·소개가 key 경고 없이 렌더된다 (${width}px)`, async ({ page }) => {
    const keyWarnings: string[] = [];
    page.on('console', message => {
      if (/Each child in a list should have a unique "key"|same key/.test(message.text())) {
        keyWarnings.push(message.text());
      }
    });
    await page.route('**/api/auth/session', route => route.fulfill({ json: {} }));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/pg-landing');

    const problem = page.locator('#problem');
    const heading = problem.getByRole('heading', { level: 2 });
    await heading.scrollIntoViewIfNeeded();
    // The in-view animation confirms this subtree has hydrated.
    await expect(heading).toHaveCSS('opacity', '1');
    await expect(heading).toHaveText(
      /PG 영업에서 가장 어려운 건\s*리드 수가 아니라, 확실한 니즈입니다/,
    );
    await expect(problem.getByText(/의사가 불분명한 리드에 제안서와 미팅이 쌓일수록/)).toBeVisible();
    await expect(problem.getByRole('heading', { level: 3 })).toHaveText([
      '관심은 있지만 움직이지 않는 고객사',
      '조건 확인부터 다시 시작하는 영업',
      '수수료율만 남는 협상',
      '낮은 전환율의 반복 미팅',
    ]);
    expect(keyWarnings).toEqual([]);
  });
}
