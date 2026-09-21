import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { eq, inArray } from 'drizzle-orm';
import { test, expect } from 'playwright/test';

import { db } from '@/lib/db/client';
import { attachments, rfps } from '@/lib/db/schema';
import { getStorage } from '@/lib/server/storage';
import { loginAs, resetRfpForKanban } from './_helpers';

const RFP_CODE = 'P-2604-0001';

test.describe.serial('구매사 첨부 썸네일 — 실제 R2와 Chromium', () => {
  test.skip(!process.env.R2_BUCKET, '실제 R2 설정이 필요해요');
  test.setTimeout(120_000);

  const attachmentIds: string[] = [];
  let originalDeadline: { rfpId: string; value: Date } | undefined;

  test.afterAll(async () => {
    for (const id of attachmentIds) await getStorage().delete(id);
    if (attachmentIds.length > 0) {
      await db.delete(attachments).where(inArray(attachments.id, attachmentIds));
    }
    if (originalDeadline) {
      await db.update(rfps).set({ deadline: originalDeadline.value })
        .where(eq(rfps.id, originalDeadline.rfpId));
    }
  });

  test('빈 상태, 이미지·PDF 미리보기, 모바일 목록을 확인한다', async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await resetRfpForKanban(RFP_CODE);
    await loginAs(page, 'buyer');
    await page.goto(`/rfp/${RFP_CODE}`);
    await page.getByRole('tab', { name: '첨부' }).click();
    await expect(page.getByText('첨부파일 없이 견적을 요청했어요.')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('attachment-empty.png'), fullPage: true });

    const [rfp] = await db.select({ id: rfps.id, createdBy: rfps.createdBy, deadline: rfps.deadline })
      .from(rfps).where(eq(rfps.code, RFP_CODE)).limit(1);
    if (!rfp) throw new Error(`테스트 견적 요청을 찾을 수 없어요: ${RFP_CODE}`);
    originalDeadline = { rfpId: rfp.id, value: rfp.deadline };

    const image = await readFile(resolve(process.cwd(), 'public/images/pg-logos/toss.png'));
    const pdf = await PDFDocument.create();
    pdf.addPage([320, 440]).drawText('Attachment preview', { x: 40, y: 380, size: 18 });
    const pdfBytes = Buffer.from(await pdf.save());
    const files = [
      { id: randomUUID(), name: '첨부이미지.png', bytes: image, mimeType: 'image/png' },
      { id: randomUUID(), name: '첨부문서.pdf', bytes: pdfBytes, mimeType: 'application/pdf' },
    ];
    for (const file of files) {
      await db.insert(attachments).values({
        id: file.id,
        rfpId: rfp.id,
        name: file.name,
        size: file.bytes.length,
        mimeType: file.mimeType,
        uploadedBy: rfp.createdBy,
      });
      attachmentIds.push(file.id);
      await getStorage().save(file.id, file.bytes, file.mimeType);
    }

    await page.reload();
    const pdfResponse = page.waitForResponse((response) =>
      response.url().includes(`/api/files/${files[1].id}?preview=1`),
    );
    await page.getByRole('tab', { name: '첨부' }).click();
    await expect(page.getByText('첨부파일 (2)')).toBeVisible();
    const response = await pdfResponse;
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/pdf');
    expect(response.headers()['cache-control']).toBe('private, no-store');
    const download = await page.request.get(`/api/files/${files[1].id}`, { maxRedirects: 0 });
    expect(download.status()).toBe(302);
    const location = download.headers()['location'];
    expect(location).toBeTruthy();
    expect(new URL(location!).searchParams.get('X-Amz-Signature')).toBeTruthy();
    const downloaded = await page.request.get(`/api/files/${files[1].id}`);
    expect(downloaded.status()).toBe(200);
    expect((await downloaded.body()).subarray(0, 5).toString('utf8')).toBe('%PDF-');

    const imageThumb = page.getByRole('img', { name: '첨부이미지.png', exact: true });
    await expect(imageThumb).toBeVisible();
    await expect.poll(() => imageThumb.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByRole('img', { name: '첨부문서.pdf 첫 페이지 미리보기' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('attachment-desktop.png'), fullPage: true });

    await page.getByRole('button', { name: /첨부이미지\.png/ }).click();
    const dialog = page.getByRole('dialog', { name: '첨부이미지.png 미리보기' });
    const largeImage = dialog.getByRole('img', { name: '첨부이미지.png 미리보기' });
    await expect(largeImage).toBeVisible();
    await expect.poll(() => largeImage.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /첨부문서\.pdf/ }).click();
    await expect(page.getByRole('dialog', { name: '첨부문서.pdf 미리보기' }).locator('iframe')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/rfp');
    const row = page.getByRole('row').filter({ hasText: RFP_CODE });
    await expect(row).toBeVisible();
    await expect(row.getByText('견적 도착')).toBeVisible();
    await expect(row.getByText('견적 확인하기')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('buyer-list-mobile.png'), fullPage: true });

    await db.update(rfps).set({ deadline: new Date(Date.now() - 60_000) }).where(eq(rfps.id, rfp.id));
    await page.reload();
    const closedRow = page.getByRole('row').filter({ hasText: RFP_CODE });
    await expect(closedRow.getByText('마감')).toBeVisible();
    await expect(closedRow.getByText('견적 확인하기')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});
