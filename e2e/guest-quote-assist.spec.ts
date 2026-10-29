import { test, expect } from 'playwright/test';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { guestRfpDrafts } from '@/lib/db/schema';

for (const failure of ['ai-unavailable', 'apick-outage', 'website-unavailable']) {
  test(failure + ': direct writing, reload, server save and signup handoff', async ({ page, context }, info) => {
    test.setTimeout(150000);
    await context.setExtraHTTPHeaders({ 'x-forwarded-for': '198.18.1.' + (failure === 'ai-unavailable' ? 21 : failure === 'apick-outage' ? 22 : 23) });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let analyses = 0;
    // Provider failures are represented at the public HTTP seam here; service
    // tests independently exercise real aggregation and injected provider failures.
    await page.route('**/api/guest-rfp/assist', route => {
      analyses++;
      const input = route.request().postDataJSON();
      const suggestions = input.kind === 'website' && failure === 'ai-unavailable'
        ? [{ field: 'mainProducts', value: '면 티셔츠', source: 'rules', sourceUrl: 'https://example.com', evidence: '면 티셔츠' }] : [];
      return route.fulfill({ json: { status: suggestions.length ? 'partial' : 'manual', suggestions, needsConfirmation: suggestions.map(s => s.field) } });
    });
    await page.route('**/api/guest-rfp/events', route => route.fulfill({ json: { ok: true } }));
    await page.goto('/quote-start');
    await page.getByLabel('사업자등록번호').fill('1248100998');
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await page.getByLabel('사업 운영 홈페이지').fill('example.com');
    await page.getByLabel('사업 운영 홈페이지').press('Enter');
    await page.getByLabel('회사명', { exact: true }).fill('장애 대응 상점');
    await expect(page.getByText('확인한 정보만 채웠어요. 나머지는 직접 입력해주세요.')).toBeVisible();
    await page.screenshot({ path: info.outputPath(failure + '-review.png'), fullPage: true });
    await page.getByRole('button', { name: '확인한 내용으로 계속할게요' }).click();
    const next = () => page.getByRole('button', { name: '다음', exact: true }).click();
    const skip = () => page.getByRole('button', { name: '지금은 건너뛰어요', exact: true }).click();
    await skip();
    await page.getByRole('radio', { name: '업종을 직접 입력할게요' }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('radio', { name: '업종을 직접 입력할게요' })).toBeChecked();
    await page.getByLabel('업종 이름').fill('의류 판매');
    await next();
    if (failure !== 'ai-unavailable') {
      await page.getByLabel('주요 판매 상품', { exact: true }).fill('면 티셔츠');
      await next();
    }
    await skip();
    await page.getByRole('radio', { name: '아니요', exact: true }).check(); await next();
    await page.getByRole('radio', { name: '10만원 미만', exact: true }).check(); await next();
    await page.getByRole('checkbox', { name: '해당 없음', exact: true }).check(); await next();
    await page.getByLabel('배송 및 서비스 기간', { exact: true }).fill('3'); await next();
    await page.getByRole('button', { name: '신규 계약', exact: true }).click(); await next();
    await page.getByRole('button', { name: '카드', exact: true }).click(); await next();
    await expect(page.getByLabel('제목', { exact: true })).toHaveCount(0);
    await skip(); await skip();
    await expect(page.getByRole('button', { name: '이 정보로 맞춤 견적 받기' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: '이 정보로 맞춤 견적 받기' })).toBeVisible();
    expect(analyses).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: '이 정보로 맞춤 견적 받기' }).click();
    await page.waitForURL(/\/signup\/buyer/);
    const id = await page.evaluate(() => sessionStorage.getItem('support-b-guest-signup-draft'));
    const [row] = await db.select().from(guestRfpDrafts).where(eq(guestRfpDrafts.id, id!));
    expect(row.answers.quoteContext).toMatchObject({ companyName: '장애 대응 상점', bizNo: '1248100998', stage: 'complete' });
    expect(row.answers.data.title).toBe('장애 대응 상점 면 티셔츠 신규 PG 견적');
  });
}
