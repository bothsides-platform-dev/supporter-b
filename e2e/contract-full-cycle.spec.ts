/**
 * 전자계약 풀사이클 — 템플릿 등록 → 발송 → PG 서명 → buyer 서명 → 무결성/파일 라우트.
 *
 * 선정(awarded) 이후 PG 가 계약서 PDF 템플릿을 발송하고 buyer↔PG 양측이 플랫폼에서
 * 서명하는 전 여정을 한 번에 검증한다:
 *   ① PG 로그인 → /contract-templates 에서 계약서 PDF 템플릿 등록.
 *   ② PG 딜룸(/inbox/P-2604-0001) '계약서 보내기' CTA → /contracts/new 폼 작성 → 발송.
 *   ③ PG 가 자기 차례 서명(입력 모드 — 캔버스 드래그는 비결정적이라 회피).
 *   ④ buyer 로그인 → /contracts 목록 → 상세 → 서명 → 양측 서명 완료 + 무결성 배지.
 *   ⑤ /api/contract-docs/{id}/file 라우트 — 302 + 서명된 R2 URL 검증(전례 미러:
 *      e2e/bid-detail-pdf-preview.spec.ts).
 *
 * R2 게이팅: 템플릿 업로드(2-phase presigned PUT)와 파일 라우트 둘 다 실 R2 버킷이
 * 있어야 바이트가 프로세스 경계를 넘나든다 — R2_* env 없으면 스펙 전체를 skip한다
 * (전례 동일: bid-detail-pdf-preview.spec.ts).
 *
 * 시드 `P-2604-0001` 사용(buyer 소유, toss 제출 견적 보유). beforeAll 에서
 * `awardRfpDirect` 로 즉시 'awarded' 상태로 만든다(RfpService.award() 를 거치지
 * 않는 DB 직접 조작 — 알림/아웃박스 팬아웃은 이 스펙의 관심사가 아니다).
 *
 * 게이트: 시드 계정은 비마스터라 `lib/features/e-contract.ts` 의 기본값(마스터 전용)
 * 으로는 /contracts* 라우트가 전부 /home 으로 리다이렉트된다 — playwright.config.ts
 * 의 webServer env 에 `E_CONTRACT_ALL=1` 을 추가해 게이트를 해제했다.
 */
import { test, expect } from 'playwright/test';

import { awardRfpDirect, loginAs } from './_helpers';

const RFP_CODE = 'P-2604-0001';
const TEMPLATE_NAME = 'E2E 표준 계약서 템플릿';
const BUYER_REP_NAME = '김구매';
const PG_REP_NAME = '박결제';

// 최소 유효 PDF — pdf-lib 로 로드 가능함을 직접 확인(getPageCount()===1).
// e2e/_helpers.ts 의 attachTossProposalPdf 가 쓰는 것과 동일한 바이트 구성.
const MINIMAL_PDF = Buffer.from(
  [
    '%PDF-1.4',
    '1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj',
    '2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj',
    '3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 100 100]>> endobj',
    'xref',
    '0 4',
    '0000000000 65535 f',
    '0000000009 00000 n',
    '0000000056 00000 n',
    '0000000111 00000 n',
    'trailer <</Size 4 /Root 1 0 R>>',
    'startxref',
    '177',
    '%%EOF',
    '',
  ].join('\n'),
  'utf8',
);

test.describe.serial('전자계약 풀사이클 — 템플릿·발송·양측 서명·무결성', () => {
  test.skip(
    !process.env.R2_BUCKET,
    'requires real R2 config (R2_* env) — template/base PDF bytes must be shared cross-process',
  );

  // 템플릿 업로드(presign 왕복) + 계약서 발송(PDF 합성) + 서명(파일 재합성)까지
  // 겹치면 무거운 흐름이라 넉넉히 잡는다 (bid-detail-pdf-preview.spec.ts 전례 동일).
  test.setTimeout(90_000);

  let contractDocId = '';
  let contractDocCode = '';

  test.beforeAll(async () => {
    await awardRfpDirect(RFP_CODE);
  });

  test('pg(toss): 계약서 템플릿 등록', async ({ page }) => {
    await loginAs(page, 'pg-toss');
    await page.goto('/contract-templates');

    await page.getByRole('button', { name: '새 템플릿' }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();

    await drawer.getByPlaceholder('템플릿 이름').fill(TEMPLATE_NAME);
    await drawer.locator('input[type="file"]').setInputFiles({
      name: 'e2e-contract-template.pdf',
      mimeType: 'application/pdf',
      buffer: MINIMAL_PDF,
    });

    const saveButton = drawer.getByRole('button', { name: '저장', exact: true });
    await expect(saveButton).toBeEnabled({ timeout: 20_000 });
    await saveButton.click();

    await expect(drawer).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(TEMPLATE_NAME)).toBeVisible();
  });

  test('pg(toss): 딜룸 CTA → 계약서 작성·발송', async ({ page }) => {
    await loginAs(page, 'pg-toss');
    await page.goto(`/inbox/${RFP_CODE}`);

    await page.getByRole('button', { name: '계약서 보내기' }).click();
    await page.waitForURL(/\/contracts\/new\?rfp=/, { timeout: 20_000 });

    await page.getByTestId('buyer-repName').fill(BUYER_REP_NAME);
    await page.getByTestId('pg-repName').fill(PG_REP_NAME);

    await page.getByRole('button', { name: '계약서 보내기', exact: true }).click();
    const confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toBeVisible();
    await expect(
      confirmDialog.getByRole('heading', { name: '계약서를 보낼까요?' }),
    ).toBeVisible();
    await confirmDialog.getByRole('button', { name: '보내기', exact: true }).click();

    // 발송은 서버에서 base PDF 합성(폰트 임베드+별지 렌더+해시)을 동반한다.
    await page.waitForURL(/\/contracts\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    contractDocId = new URL(page.url()).pathname.split('/').pop()!;
    expect(contractDocId).toMatch(/^[0-9a-f-]{36}$/);

    const header = page.locator('header');
    await expect(header.getByText('서명 대기', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    contractDocCode = (await header.locator('.md-numeric').first().textContent())?.trim() ?? '';
    expect(contractDocCode).toMatch(/^CT-/);
  });

  test('pg(toss): 서명 — 입력 모드 → 상대 서명 대기', async ({ page }) => {
    await loginAs(page, 'pg-toss');
    await page.goto(`/contracts/${contractDocId}`);

    await page.getByRole('button', { name: '서명하기' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('tab', { name: '입력' }).click();
    await dialog.getByPlaceholder('이름을 입력해 주세요').fill(PG_REP_NAME);
    await dialog.getByText('계약서 내용을 모두 확인했어요').click();
    await dialog.getByText('위 내용에 동의해요').click();
    await dialog.getByRole('button', { name: '서명 완료', exact: true }).click();

    await expect(dialog).toBeHidden({ timeout: 20_000 });
    await expect(
      page.locator('header').getByText('상대 서명 대기', { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('buyer: 알림·목록 → 상세 → 서명 → 서명 완료 + 무결성 배지 + 파일 라우트', async ({
    page,
  }) => {
    await loginAs(page, 'buyer');

    // 선택: PG 발송 시 buyer 앞으로 간 인앱 알림 1건 확인.
    await page.goto('/notifications');
    await expect(page.getByText('서명할 계약서가 도착했어요')).toBeVisible({
      timeout: 10_000,
    });

    // 목록 → 상세 (실제 링크를 클릭해 목록 와이어링까지 함께 검증).
    await page.goto('/contracts');
    await expect(page.getByText(contractDocCode)).toBeVisible();
    await page.locator(`a[href="/contracts/${contractDocId}"]`).click();
    await page.waitForURL(new RegExp(`/contracts/${contractDocId}$`));

    await expect(
      page.locator('header').getByText('서명 대기', { exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: '서명하기' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('tab', { name: '입력' }).click();
    await dialog.getByPlaceholder('이름을 입력해 주세요').fill(BUYER_REP_NAME);
    await dialog.getByText('계약서 내용을 모두 확인했어요').click();
    await dialog.getByText('위 내용에 동의해요').click();
    await dialog.getByRole('button', { name: '서명 완료', exact: true }).click();

    // 양측 완료 서명 — 최종 PDF 재합성(감사추적 별지 포함)을 동반해 더 무겁다.
    await expect(dialog).toBeHidden({ timeout: 25_000 });
    await expect(
      page.locator('header').getByText('서명 완료', { exact: true }),
    ).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText('위변조 없음')).toBeVisible({ timeout: 20_000 });

    // ⑤ 파일 라우트 — 302 + 서명된 R2 URL(전례 미러: bid-detail-pdf-preview.spec.ts).
    const fileUrl = `/api/contract-docs/${contractDocId}/file`;

    const viewRes = await page.request.get(fileUrl, { maxRedirects: 0 });
    expect(viewRes.status()).toBe(302);
    const viewLocation = viewRes.headers()['location'];
    expect(viewLocation).toBeTruthy();
    const viewLocationUrl = new URL(viewLocation!);
    expect(viewLocationUrl.hostname).toMatch(/r2\.cloudflarestorage\.com$/);
    expect(viewLocationUrl.searchParams.get('X-Amz-Signature')).toBeTruthy();
    expect(viewRes.headers()['cache-control']).toBe('private, no-store');

    // 리다이렉트를 실제로 따라가 서명이 그 버킷에 대해 유효함을 증명한다.
    const followedRes = await page.request.get(fileUrl);
    expect(followedRes.status()).toBe(200);
    expect(followedRes.headers()['content-type']).toBe('application/pdf');
    const body = await followedRes.body();
    expect(body.subarray(0, 5).toString('utf8')).toBe('%PDF-');

    const downloadRes = await page.request.get(`${fileUrl}?download=1`, {
      maxRedirects: 0,
    });
    expect(downloadRes.status()).toBe(302);
    expect(downloadRes.headers()['location']).toBeTruthy();
  });
});
