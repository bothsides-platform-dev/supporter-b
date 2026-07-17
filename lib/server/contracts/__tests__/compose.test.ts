import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { composeBasePdf } from '@/lib/server/contracts/compose';
import { sha256Hex } from '@/lib/server/contracts/hash';
import { makeKoreanTemplate, PARTIES_FIXTURE, TERMS_FIXTURE } from './_fixtures';

const NOW = new Date('2026-07-17T02:30:00.000Z');

async function compose(overrides: Partial<Parameters<typeof composeBasePdf>[0]> = {}) {
  return composeBasePdf({
    templatePdf: await makeKoreanTemplate(2),
    docCode: 'C-2607-0001',
    now: NOW,
    title: '결제대행 서비스 이용 계약서',
    parties: PARTIES_FIXTURE,
    terms: TERMS_FIXTURE,
    ...overrides,
  });
}

describe('composeBasePdf', () => {
  it('원본 2페이지에 별지1을 덧붙여 3페이지 이상이 된다', async () => {
    const { pdf, pageCount } = await compose();
    expect(pageCount).toBeGreaterThanOrEqual(3);
    // 반환된 pageCount 는 실제 산출물과 일치해야 한다 (호출자가 DB에 적재).
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(pageCount);
  });

  it('산출물이 유효한 PDF 로 재파싱된다', async () => {
    const { pdf } = await compose();
    expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    await expect(PDFDocument.load(pdf)).resolves.toBeDefined();
  });

  it('반환 sha256 은 반환 바이트의 해시와 일치한다', async () => {
    const { pdf, sha256 } = await compose();
    expect(sha256).toBe(sha256Hex(pdf));
  });

  it('동일 입력을 두 번 합성하면 바이트가 동일하다 — 무결성 해시의 전제', async () => {
    // 같은 템플릿 바이트를 써야 한다 (템플릿 자체도 결정적이어야 성립).
    const templatePdf = await makeKoreanTemplate(2);
    const a = await compose({ templatePdf });
    const b = await compose({ templatePdf });
    expect(a.sha256).toBe(b.sha256);
    expect(a.pdf.equals(b.pdf)).toBe(true);
  });

  it('now 가 다르면 sha 가 달라진다 — 생성 시각이 실제로 문서에 박힌다', async () => {
    const templatePdf = await makeKoreanTemplate(2);
    const a = await compose({ templatePdf });
    const b = await compose({ templatePdf, now: new Date('2026-07-18T02:30:00.000Z') });
    expect(a.sha256).not.toBe(b.sha256);
  });

  it('사업자등록번호가 없는 당사자(미등록 워크스페이스)도 합성된다', async () => {
    const { pdf } = await compose({
      parties: {
        _v: 1,
        buyer: { ...PARTIES_FIXTURE.buyer, bizNo: null },
        pg: { ...PARTIES_FIXTURE.pg, bizNo: null },
      },
    });
    await expect(PDFDocument.load(pdf)).resolves.toBeDefined();
  });

  it('구간 요율이 전혀 없는 조건(정액 수단만)도 합성된다', async () => {
    const { pdf } = await compose({
      terms: {
        ...TERMS_FIXTURE,
        paymentFees: { virtual_account: 300 },
        customFees: {},
        customPaymentMethods: [],
        buyerTier: null,
      },
    });
    await expect(PDFDocument.load(pdf)).resolves.toBeDefined();
  });

  it('본문이 길어 넘치면 다음 페이지로 이어진다 — 잘리지 않는다', async () => {
    const many = await compose({
      terms: {
        ...TERMS_FIXTURE,
        rfpTitle: '아주 긴 제목 '.repeat(40),
        customPaymentMethods: Array.from({ length: 40 }, (_, i) => ({
          id: `c-${i}`,
          label: `커스텀 결제수단 ${i}`,
        })),
        customFees: Object.fromEntries(
          Array.from({ length: 40 }, (_, i) => [`c-${i}`, 0.01 + i / 1000]),
        ),
      },
    });
    const few = await compose();
    expect(many.pageCount).toBeGreaterThan(few.pageCount);
  });

  it('원본 템플릿 페이지는 보존된다 — 60p 템플릿이 60+별지', async () => {
    const { pageCount } = await compose({ templatePdf: await makeKoreanTemplate(60) });
    expect(pageCount).toBeGreaterThanOrEqual(61);
  });
});
