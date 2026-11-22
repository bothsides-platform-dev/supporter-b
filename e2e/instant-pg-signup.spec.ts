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
import { loginAs } from './_helpers';

async function openPg() {
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
  const close = async () => {
    await db.delete(instantPolicies).where(eq(instantPolicies.pgId, pg));
    await db.delete(instantPgChannels).where(eq(instantPgChannels.pgId, pg));
    await db.delete(pgAgreementRates).where(eq(pgAgreementRates.pgWsId, pg));
    await db
      .delete(pgRecommendationGroups)
      .where(eq(pgRecommendationGroups.id, group));
    await db.delete(workspaces).where(eq(workspaces.id, pg));
  };
  return { pg, group, name, close };
}

test('사업자번호 확인 후 낮은 거래액으로 가입 전 전체 등급 견적을 조회한다', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  const { group, name, close } = await openPg();
  try {
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
    await close();
  }
});

test('상담으로 넘어가 새로고침하고 신규 계약으로 바꿔도 PG 선택까지 간다', async ({
  page,
}) => {
  test.setTimeout(150000);
  const { group, close } = await openPg();
  try {
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
      confirmed: ['business-number', 'website'],
    };
    Object.assign(draft.data, {
      contentQuestion: 'contract',
      websiteUrl: url,
      title: '가방 PG 견적',
      industryGroupId: group,
      mainProducts: '가방',
      deliveryServicePeriod: 'D+3',
      contractType: 'renewal',
      monthlyAvgPgVolume: '60000000',
      currentPgs: [{ pgWorkspaceId: null, name: '기존 PG' }],
      requiredPaymentMethods: ['card'],
      productInfo: {
        cashConvertible: false,
        maximumPrice: 'under_100k',
        salesMethods: ['none'],
      },
    });
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
      key: GUEST_DRAFT_KEY,
      value: JSON.stringify(draft),
    });
    await page.reload();
    await page.getByRole('button', { name: '견적 조회하기' }).click();
    const contract = page.getByRole('heading', {
      name: '어떤 계약을 준비하나요?',
    });
    await expect(contract).toBeVisible();
    await page.reload();
    await expect(contract).toBeVisible();
    await page.getByRole('button', { name: '신규 계약', exact: true }).click();

    const finish = page.getByRole('button', { name: '작성 마치기' });
    const skip = page.getByRole('button', { name: '지금은 건너뛰어요' });
    const heading = page.getByRole('region', { name: '견적 작성' }).locator('h2');
    for (let step = 0; step < 8 && !(await finish.isVisible()); step++) {
      const current = await heading.innerText();
      if (await skip.isVisible()) await skip.click();
      else await page.getByRole('button', { name: '다음', exact: true }).click();
      await expect(heading).not.toHaveText(current);
    }
    await finish.click();
    await expect(
      page.getByRole('group', { name: '상담할 PG사' }),
    ).toBeVisible({ timeout: 20000 });
  } finally {
    await close();
  }
});

test('PG 접수를 열고 닫으면 재배포 없이 흐름과 진입 링크가 바뀐다', async ({
  page,
  browser,
}) => {
  test.setTimeout(150000);
  const { pg, close } = await openPg();
  const guest = await browser.newContext();
  try {
    const visitor = await guest.newPage();
    await visitor.goto('/quote-start');
    await expect(
      visitor.getByRole('heading', { name: '어떤 홈페이지에서 판매하나요?' }),
    ).toBeVisible();
    await visitor.getByLabel('사업 운영 홈페이지').fill('example.com');
    await visitor.getByRole('button', { name: '직접 입력할게요' }).click();
    await expect(
      visitor.getByRole('heading', { name: '사업자등록번호를 알려주세요' }),
    ).toBeVisible();
    await expect(
      visitor.getByRole('button', { name: '지금은 건너뛸게요' }),
    ).toHaveCount(0);

    await loginAs(page, 'buyer');
    await page.goto('/rfp');
    const entry = page.getByRole('link', { name: 'PG 가입 신청', exact: true });
    await expect(entry).toBeVisible();

    await db
      .update(instantPgChannels)
      .set({ enabled: false })
      .where(eq(instantPgChannels.pgId, pg));
    await page.reload();
    await expect(page.getByRole('button', { name: '견적 요청하기' }).first()).toBeVisible();
    await expect(entry).toHaveCount(0);
    await visitor.evaluate(() => localStorage.clear());
    await visitor.reload();
    await expect(
      visitor.getByRole('button', { name: '지금은 건너뛸게요' }),
    ).toBeVisible();
  } finally {
    await guest.close();
    await close();
  }
});
