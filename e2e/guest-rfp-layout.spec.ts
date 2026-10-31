import { test, expect } from 'playwright/test';
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { pgRecommendationGroups } from '@/lib/db/schema';
import { createGuestDraft, GUEST_DRAFT_KEY } from '@/lib/guest-rfp/draft';
import { newQuoteContext } from '@/lib/guest-rfp/quote-context';
// Start at the question renderer after intake; guest-quote-assist covers intake.
test.beforeEach(async ({ page }) => {
  const draft = createGuestDraft();
  draft.quoteContext = { ...newQuoteContext(), stage: 'questions' };
  await page.addInitScript(
    ({ key, draft }) => {
      if (window === window.top && !localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(draft));
    },
    { key: GUEST_DRAFT_KEY, draft },
  );
});

test('public solution logos reflow without shifting selection and retain answers after refresh', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.route('**/api/guest-rfp/events', (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.goto('/quote-start');
  await page.getByLabel('사업 운영 홈페이지').fill('example.com');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  const names = ['카페24', '아임웹', '메이크샵', '고도몰', '자체 개발', '기타'];
  const cafe = page.getByRole('button', { name: '카페24', exact: true });
  const next = page.getByRole('button', { name: '다음', exact: true });
  for (const [width, theme] of [
    [390, 'light'],
    [1440, 'dark'],
  ] as const) {
    await page.evaluate(
      (theme) =>
        document.documentElement.classList.toggle('dark', theme === 'dark'),
      theme,
    );
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('[data-solution-options] img')).toHaveCount(4);
    for (const name of names) {
      const button = page.getByRole('button', { name, exact: true });
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(width >= 1024 ? 64 : 56);
      expect(
        await button.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
    }
    await expect
      .poll(() =>
        page
          .locator('[data-solution-options] img')
          .evaluateAll((images) =>
            images.every(
              (image) =>
                image instanceof HTMLImageElement &&
                image.complete &&
                image.naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
    const choices = page.locator('[data-solution-options] > div');
    expect(
      await choices.evaluate(
        (element) =>
          getComputedStyle(element).gridTemplateColumns.split(' ').length,
      ),
    ).toBe(width >= 1024 ? 3 : 2);
    const heading = await page
      .getByRole('heading', { name: '홈페이지를 어떻게 만들었나요?' })
      .boundingBox();
    const progress = await page
      .getByRole('progressbar', { name: '작성 진행' })
      .boundingBox();
    const answers = await page.getByTestId('rfp-question-scroll').boundingBox();
    expect(heading!.y - progress!.y - progress!.height).toBeCloseTo(
      width >= 1024 ? 32 : 24,
      0,
    );
    expect(answers!.y - heading!.y - heading!.height).toBeCloseTo(20, 0);
    if (width >= 1024) {
      const grid = await choices.boundingBox();
      const nextBox = await next.boundingBox();
      expect(nextBox!.y - grid!.y - grid!.height).toBeCloseTo(32, 0);
    }
    const before = await cafe.locator('span').evaluateAll((elements) =>
      elements.map((element) => ({
        x: element.getBoundingClientRect().x,
        width: element.getBoundingClientRect().width,
      })),
    );
    await cafe.click();
    expect(
      await cafe.locator('span').evaluateAll((elements) =>
        elements.map((element) => ({
          x: element.getBoundingClientRect().x,
          width: element.getBoundingClientRect().width,
        })),
      ),
    ).toEqual(before);
    await expect(cafe.locator('svg').last()).toHaveCSS(
      'opacity',
      (await cafe.getAttribute('aria-pressed')) === 'true' ? '1' : '0',
    );
    await expect(
      page.getByRole('heading', { name: '홈페이지를 어떻게 만들었나요?' }),
    ).toBeVisible();
    await cafe.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(cafe).toBeFocused();
    expect(
      await cafe.evaluate((element) => getComputedStyle(element).outlineStyle),
    ).toBe('solid');
    await expect(next).toBeInViewport({ ratio: 1 });
    await next.click({ trial: true });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    const choices = page.locator('[data-solution-options] > div');
    await expect
      .poll(() =>
        choices.evaluate(
          (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length,
        ),
      )
      .toBe(width >= 1024 ? 3 : 2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole('button', { name: '기타', exact: true }).click();
  await page.getByRole('textbox', { name: '솔루션 이름' }).fill('우리 쇼핑몰');
  await page.getByRole('button', { name: '지금은 건너뛰어요' }).click();
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole('button', { name: '기타', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('textbox', { name: '솔루션 이름' })).toHaveValue(
    '우리 쇼핑몰',
  );
  for (const height of [400, 900]) {
    await page.setViewportSize({ width: 640, height });
    if (height === 900)
      await page.addStyleTag({ content: 'html { zoom: 2; }' });
    for (const name of names) {
      const choice = page.getByRole('button', { name, exact: true });
      await choice.evaluate((element) =>
        element.scrollIntoView({ block: 'center' }),
      );
      await choice.click({ trial: true });
    }
    await page
      .getByRole('textbox', { name: '솔루션 이름' })
      .click({ trial: true });
    await next.scrollIntoViewIfNeeded();
    await next.click({ trial: true });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test('public layout, touch targets, keyboard errors and zoom reflow', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.route('**/api/guest-rfp/events', (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.goto('/quote-start');
  const input = page.getByLabel('사업 운영 홈페이지');
  await input.waitFor();
  await expect(
    page.getByRole('progressbar', { name: '작성 진행' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '우리 사업에 맞는 PG 견적을 받아요' }),
  ).toBeInViewport();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width >= 1024 ? 900 : 844 });
    const title = await page
      .getByRole('heading', { name: '우리 사업에 맞는 PG 견적을 받아요' })
      .boundingBox();
    await expect(
      page.getByText('사업 정보를 입력하면 업종에 맞는 PG사를 추천해요.'),
    ).toBeInViewport();
    await expect(
      page.getByRole('complementary', { name: '작성 전 안내' }),
    ).toHaveCount(0);
    await expect(page.getByText('전달·보관 안내 자세히 보기')).toHaveCount(0);
    const question = await page
      .getByRole('heading', { name: '어떤 홈페이지에서 판매하나요?' })
      .boundingBox();
    const field = await input.boundingBox();
    const previous = await page
      .getByRole('button', { name: '이전', exact: true })
      .boundingBox();
    const next = await page
      .getByRole('button', { name: '다음', exact: true })
      .boundingBox();
    if (width >= 1024) {
      expect(question!.x).toBeGreaterThan(title!.x + title!.width);
    } else {
      expect(title!.x).toBeCloseTo(question!.x, 0);
      expect(question!.y).toBeGreaterThan(title!.y + title!.height);
    }
    await expect(input).toBeInViewport({ ratio: 1 });
    await expect(
      page.getByRole('button', { name: '다음', exact: true }),
    ).toBeInViewport({ ratio: 1 });
    expect(field!.x).toBeCloseTo(question!.x, 0);
    expect(previous!.x).toBeCloseTo(field!.x, 0);
    expect(field!.width).toBeLessThanOrEqual(720);
    if (width < 1024) {
      if (width < 608) expect(question!.x).toBe(20);
      expect(previous!.height).toBeGreaterThanOrEqual(44);
      expect(next!.height).toBeGreaterThanOrEqual(44);
      if (width < 640) expect(next!.width).toBeGreaterThan(previous!.width);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await input.press('Enter');
  await expect(input).toBeFocused();
  await expect(
    page.getByRole('alert').filter({ hasText: '홈페이지' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 844 });
  await input.fill('example.com');
  await input.press('Enter');
  const skip = page.getByRole('button', { name: '지금은 건너뛰어요' });
  await expect(skip).toBeVisible();
  const skipBox = await skip.boundingBox();
  const nextBox = await page
    .getByRole('button', { name: '다음', exact: true })
    .boundingBox();
  expect(skipBox!.height).toBeGreaterThanOrEqual(44);
  expect(skipBox!.y + skipBox!.height).toBeLessThanOrEqual(nextBox!.y);
  const cafe = page.getByRole('button', { name: '카페24', exact: true });
  await cafe.click();
  await expect(cafe).toHaveAttribute('aria-pressed', 'true');
  expect((await cafe.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(cafe).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({ width: 640, height: 400 });
  await page
    .getByRole('button', { name: '다음', exact: true })
    .scrollIntoViewIfNeeded();
  await page
    .getByRole('button', { name: '다음', exact: true })
    .click({ trial: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    const key = 'support-b-guest-rfp-v1';
    const draft = JSON.parse(localStorage.getItem(key)!);
    draft.data.contentQuestion = 'delivery';
    localStorage.setItem(key, JSON.stringify(draft));
  });
  await page.reload();
  await expect(
    page.getByRole('heading', {
      name: '배송이나 서비스 완료까지 얼마나 걸리나요?',
    }),
  ).toBeVisible();
  await page.setViewportSize({ width: 640, height: 900 });
  await page.addStyleTag({ content: 'html { zoom: 2; }' });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('long industry results, renewal and missing attachments keep actions reachable', async ({
  page,
}) => {
  test.setTimeout(90000);
  const groups = Array.from({ length: 18 }, (_, index) => ({
    id: randomUUID(),
    name: `레이아웃검증 긴 업종 이름과 판매 서비스 ${index + 1}`,
  }));
  await db.insert(pgRecommendationGroups).values(groups);
  try {
    await page.route('**/api/guest-rfp/events', (route) =>
      route.fulfill({ json: { ok: true } }),
    );
    await page.goto('/quote-start');
    await page.getByLabel('사업 운영 홈페이지').fill('example.com');
    for (const question of ['industry', 'annual', 'attachments']) {
      await page.evaluate((question) => {
        const key = 'support-b-guest-rfp-v1';
        const draft = JSON.parse(localStorage.getItem(key)!);
        draft.data.contentQuestion = question;
        draft.data.contractType = 'renewal';
        draft.files =
          question === 'attachments'
            ? [
                {
                  id: 'missing-local-file',
                  name: '저장하지못한첨부자료.pdf',
                  size: 4,
                  type: 'application/pdf',
                },
              ]
            : [];
        localStorage.setItem(key, JSON.stringify(draft));
      }, question);
      await page.reload();
      await expect(page.getByLabel('질문 진행률')).toContainText('/ 20');
      if (question === 'industry') {
        await page
          .getByRole('searchbox', { name: '업종 검색' })
          .fill('레이아웃검증');
        await expect(
          page.getByRole('radio', { name: /레이아웃검증/ }),
        ).toHaveCount(18);
      }
      if (question === 'attachments')
        await expect(
          page.getByText('첨부 원본을 아직 보관하지 못했어요'),
        ).toBeVisible();
      for (const width of [390, 1440]) {
        await page.setViewportSize({
          width,
          height: width === 1440 ? 900 : 844,
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const next = page.getByRole('button', {
          name: question === 'attachments' ? '작성 마치기' : '다음',
          exact: true,
        });
        // Center explicitly: nearest scrolling can leave a fractional pixel outside the viewport.
        await next.evaluate((element) =>
          element.scrollIntoView({ block: 'center' }),
        );
        await expect(next).toBeInViewport({ ratio: 1 });
        await next.click({ trial: true });
      }
    }
  } finally {
    await db.delete(pgRecommendationGroups).where(
      inArray(
        pgRecommendationGroups.id,
        groups.map((group) => group.id),
      ),
    );
  }
});

test('public answer controls and completion edits remain usable across sizes, themes and zoom', async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.route('**/api/guest-rfp/events', (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.goto('/quote-start');
  await page.getByLabel('사업 운영 홈페이지').fill('example.com');
  const key = 'support-b-guest-rfp-v1';
  const screens = [
    ['website', '어떤 홈페이지에서 판매하나요?'],
    ['industry', '어떤 업종에 해당하나요?'],
    ['contract', '어떤 계약을 준비하나요?'],
    ['payment', '어떤 결제수단의 견적을 받을까요?'],
    ['annual', '전년도 PG 거래액은 얼마인가요?'],
    ['delivery', '배송이나 서비스 완료까지 얼마나 걸리나요?'],
    ['attachments', '함께 보낼 자료가 있나요?'],
  ];
  for (const [question, heading] of screens) {
    await page.evaluate(
      ({ key, question }) => {
        const draft = JSON.parse(localStorage.getItem(key)!);
        Object.assign(draft.data, {
          contentQuestion: question,
          websiteUrl: 'https://example.com',
          contractType: 'renewal',
          industryMode: 'custom',
          customIndustryName: '반려동물 방문 돌봄',
          title: '맞춤 PG 견적 요청',
          mainProducts: '의류',
          requiredPaymentMethods: ['card'],
          annualPgVolume: '1000000000',
          deliveryServicePeriod: 'W+2',
          currentPgs: [{ pgWorkspaceId: null, name: '기존 결제대행사' }],
          productInfo: {
            cashConvertible: false,
            maximumPrice: 'under_100k',
            salesMethods: ['none'],
          },
        });
        draft.files =
          question === 'attachments'
            ? [
                {
                  id: 'lost',
                  name: '길고긴첨부파일이름-사업소개서.pdf',
                  size: 2048,
                  type: 'application/pdf',
                },
              ]
            : [];
        localStorage.setItem(key, JSON.stringify(draft));
      },
      { key, question },
    );
    await page.reload();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    if (question === 'payment') {
      await page.getByLabel('목록에 없는 결제수단').fill('포인트'.repeat(12));
      await page.getByRole('button', { name: '추가', exact: true }).click();
      await expect(
        page.getByRole('button', { name: `${'포인트'.repeat(12)} 삭제` }),
      ).toBeVisible();
    }
    if (question === 'attachments')
      await expect(
        page.getByText('원본을 찾지 못했어요. 파일을 제거한 뒤 다시 선택해요.'),
      ).toBeVisible();
    for (const [width, theme] of [
      [390, 'light'],
      [1440, 'dark'],
    ] as const) {
      await page.evaluate(
        (theme) =>
          document.documentElement.classList.toggle('dark', theme === 'dark'),
        theme,
      );
      await page.setViewportSize({ width, height: 900 });
      const answers = page.getByTestId('rfp-question-scroll');
      for (const control of await answers
        .locator(
          'button, input:not([type="radio"]):not([type="checkbox"]):not([type="file"]), select',
        )
        .all()) {
        if (!(await control.isVisible())) continue;
        const box = await control.boundingBox();
        expect(
          box!.height,
          `${question} ${width} ${await control.getAttribute('aria-label')}`,
        ).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
      }
      const next = page
        .getByRole('group', { name: '작성 이동' })
        .getByRole('button')
        .last();
      await next.scrollIntoViewIfNeeded();
      await next.click({ trial: true });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 320, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 640, height: 400 });
    const actions = page.getByRole('group', { name: '작성 이동' });
    expect(
      await actions.evaluate((element) => getComputedStyle(element).position),
    ).toBe('static');
    await actions.getByRole('button').last().scrollIntoViewIfNeeded();
    await actions.getByRole('button').last().click({ trial: true });
    await page.setViewportSize({ width: 640, height: 900 });
    await page.addStyleTag({ content: 'html { zoom: 2; }' });
    const zoomControls = page
      .getByTestId('rfp-question-scroll')
      .locator(
        'input:not([type="radio"]):not([type="checkbox"]):not([type="file"]), select, button',
      );
    for (const control of await zoomControls.all()) {
      if (!(await control.isVisible()) || !(await control.isEnabled()))
        continue;
      await control.scrollIntoViewIfNeeded();
      await control.click({ trial: true });
    }
    await actions.getByRole('button').last().scrollIntoViewIfNeeded();
    await actions.getByRole('button').last().click({ trial: true });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole('button', { name: '길고긴첨부파일이름-사업소개서.pdf 제거' })
    .click();
  await page.getByRole('button', { name: '작성 마치기' }).click();
  await expect(
    page.getByRole('heading', { name: '입력한 사업 정보' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '홈페이지 수정' }).click();
  await page.getByLabel('사업 운영 홈페이지').fill('edited.example.com');
  await page.getByRole('button', { name: '수정 완료' }).click();
  await expect(
    page.getByText('https://edited.example.com', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '계약 유형 수정' }).click();
  await page.getByRole('button', { name: '신규 계약', exact: true }).click();
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.getByText('갱신 계약', { exact: true })).toBeVisible();
});
