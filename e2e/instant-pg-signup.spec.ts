import { expect, test } from 'playwright/test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  instantPgChannels,
  instantPolicies,
  pgAgreementRates,
  pgMatchingPolicies,
  pgRecommendationGroups,
  workspaces,
} from '@/lib/db/schema';
import { emptyMatchingFees } from '@/lib/rfp/pg-matching';
import { MERCHANT_TIERS } from '@/lib/types/bid';
import { newQuoteContext } from '@/lib/guest-rfp/quote-context';
import { createGuestDraft, GUEST_DRAFT_KEY } from '@/lib/guest-rfp/draft';

test('사업자번호 확인 후 낮은 거래액으로 가입 전 전체 등급 견적을 조회한다', async ({
  page,
}, info) => {
  test.skip(
    process.env.NEXT_PUBLIC_PG_INSTANT_QUOTE_ENABLED !== 'true',
    '즉시 견적 시범 운영 환경',
  );
  test.setTimeout(150000);
  const pg = randomUUID(),
    group = randomUUID(),
    name = '가입 견적 확인 ' + group.slice(0, 6);
  const fees = MERCHANT_TIERS.map((t) => ({ key: 'card:' + t, rate: 0.012 }));
  await db
    .insert(workspaces)
    .values({ id: pg, name, type: 'pg', status: 'active' });
  await db
    .insert(pgRecommendationGroups)
    .values({ id: group, name: '가방 ' + group });
  try {
    await db.insert(pgMatchingPolicies).values({
      groupId: group,
      policy: {
        risk: 'white',
        candidates: [
          {
            pgWorkspaceId: pg,
            reason: '가방 판매',
            feesByTier: emptyMatchingFees(),
            feeNote: '',
          },
        ],
      },
    });
    await db.insert(instantPgChannels).values({
      pgId: pg,
      enabled: true,
      recipient: 'partner@example.test',
      signupUrl: 'https://partner.example.test/join',
    });
    await db
      .insert(pgAgreementRates)
      .values({ pgWsId: pg, rates: fees.map((f) => ({ ...f, rate: 0.014 })) });
    await db.insert(instantPolicies).values({
      pgId: pg,
      groupId: group,
      version: 1,
      policy: {
        fees,
        terms: {
          insurance: { kind: 'none' },
          limit: { kind: 'fixed', won: 50000000 },
          cycle: { days: 3, unit: 'business' },
          signupFee: { kind: 'fixed', won: 0 },
        },
        direct: { cycle: { days: 7, unit: 'business' } },
        review: {
          cashConvertible: false,
          prices: [],
          sales: [],
          maxDeliveryDays: null,
        },
        validityDays: 10,
        retryDays: 20,
        ackDays: 1,
        applicationDays: 3,
        resultDays: 7,
        responseDays: 30,
      },
    });
    await page.goto('/quote-start');
    await expect(
      page.getByRole('heading', { name: '어떤 홈페이지에서 판매하나요?' }),
    ).toBeVisible();
    const draft = createGuestDraft(),
      url = 'https://example.com';
    draft.quoteContext = {
      ...newQuoteContext(),
      stage: 'questions',
      confirmedWebsite: url,
      bizNo: '1248100998',
      confirmed: ['business-number'],
    };
    Object.assign(draft.data, {
      websiteUrl: url,
      industryGroupId: group,
      mainProducts: '가방',
      contractType: 'new',
      expectedVolume: '10m',
      requiredPaymentMethods: ['card'],
    });
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
      key: GUEST_DRAFT_KEY,
      value: JSON.stringify(draft),
    });
    await page.reload();
    await page.getByRole('button', { name: '견적 조회하기' }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText('카드 영세 가맹점')).toBeVisible();
    await expect(page.getByText(/4영업일 빠름/)).toBeVisible();
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath('instant-' + width + '.png'),
        fullPage: true,
      });
    }
    await page.getByRole('button', { name: '이 PG로 신청하기' }).click();
    await expect(
      page.getByRole('link', { name: '로그인하고 신청하기' }),
    ).toHaveAttribute('href', '/login?next=%2Fquote-start');
    await page.getByRole('link', { name: '로그인하고 신청하기' }).click();
    await expect(page).toHaveURL(/\/login\?/);
    await page.goto('/quote-start');
    await page.getByRole('button', { name: '예상 견적 확인' }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
  } finally {
    await db.delete(instantPolicies).where(eq(instantPolicies.pgId, pg));
    await db.delete(instantPgChannels).where(eq(instantPgChannels.pgId, pg));
    await db.delete(pgAgreementRates).where(eq(pgAgreementRates.pgWsId, pg));
    await db
      .delete(pgRecommendationGroups)
      .where(eq(pgRecommendationGroups.id, group));
    await db.delete(workspaces).where(eq(workspaces.id, pg));
  }
});
