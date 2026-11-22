import { test, expect } from 'playwright/test';
import { randomUUID } from 'node:crypto';

test('배정 시범 신청은 홈페이지 다음에 등록번호를 제안하고 수정·확인을 받는다', async ({ page }) => {
  test.skip(process.env.NEXT_PUBLIC_PG_ASSIGNMENT_ENABLED !== 'true', '배정 시범 빌드');
  // Deterministic external website analysis. The real draft save and browser flow run locally.
  await page.route('**/api/guest-rfp/assist', (route) =>
    route.fulfill({
      json: { status: 'partial', suggestedBizNo: '2208162517', suggestions: [], needsConfirmation: [] },
    }),
  );
  await page.goto('/quote-start');
  await page.getByLabel('사업 운영 홈페이지').fill('example.com');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  const number = page.getByLabel('사업자등록번호', { exact: true });
  await expect(number).toHaveValue(/220-?81-?62517/);
  await number.fill('12345');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByText('사업자등록번호를 확인해주세요.')).toBeVisible();
  await number.fill('1248100998');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByRole('heading', { name: '입력할 내용을 함께 확인해요' })).toBeVisible();
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await page.getByLabel('사업 운영 홈페이지').fill('another.example.com');
  await page.getByRole('button', { name: '직접 입력할게요' }).click();
  await expect(number).toHaveValue('');
});

test('비로그인 이메일 확인은 토큰을 GET으로 전송하지 않고 제출 시 만료를 표시한다', async ({
  page,
}) => {
  const token = 'T'.repeat(43),
    requests: string[] = [];
  page.on('request', (req) => requests.push(req.url()));
  await page.goto('/contact-confirm/' + randomUUID() + '#' + token);
  await page.getByRole('button', { name: '받았어요', exact: true }).click();
  await expect(page.getByRole('heading', { name: '이 확인 요청은 종료됐어요.' })).toBeVisible();
  expect(requests.every((url) => !url.includes(token))).toBe(true);
});
