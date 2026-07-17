import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { composeBasePdf } from '@/lib/server/contracts/compose';
import { composeFinalPdf } from '@/lib/server/contracts/finalize';
import { sha256Hex } from '@/lib/server/contracts/hash';
import { CONTRACT_CONSENT_TEXT_VERSION } from '@/lib/types/contract-doc';
import { makeKoreanTemplate, PARTIES_FIXTURE, PNG_1X1, TERMS_FIXTURE } from './_fixtures';

const NOW = new Date('2026-07-17T02:30:00.000Z');
const SIGNED_BUYER = new Date('2026-07-17T01:10:00.000Z');
const SIGNED_PG = new Date('2026-07-17T02:20:00.000Z');

async function makeBase() {
  return composeBasePdf({
    templatePdf: await makeKoreanTemplate(2),
    docCode: 'C-2607-0001',
    now: NOW,
    title: '결제대행 서비스 이용 계약서',
    parties: PARTIES_FIXTURE,
    terms: TERMS_FIXTURE,
  });
}

type FinalInput = Parameters<typeof composeFinalPdf>[0];

function signers(): FinalInput['signers'] {
  return [
    {
      party: 'buyer',
      name: '김구매',
      email: 'buyer@example.com',
      signedAt: SIGNED_BUYER,
      ip: '203.0.113.10',
      method: 'draw',
      imagePng: PNG_1X1,
      consentAt: SIGNED_BUYER,
      consentTextVersion: CONTRACT_CONSENT_TEXT_VERSION,
    },
    {
      party: 'pg',
      name: '박대행',
      email: 'pg@example.com',
      signedAt: SIGNED_PG,
      ip: null, // IP 미기록 서명자도 렌더돼야 한다
      method: 'type',
      imagePng: PNG_1X1,
      consentAt: SIGNED_PG,
      consentTextVersion: CONTRACT_CONSENT_TEXT_VERSION,
    },
  ];
}

function events(): FinalInput['events'] {
  return [
    { type: 'sent', at: new Date('2026-07-16T00:00:00Z'), actorName: '김구매', ip: '203.0.113.10' },
    { type: 'viewed', at: new Date('2026-07-16T05:00:00Z'), actorName: '박대행', ip: '198.51.100.7' },
    { type: 'signed', at: SIGNED_BUYER, actorName: '김구매', ip: '203.0.113.10' },
    { type: 'signed', at: SIGNED_PG, actorName: '박대행', ip: null },
    { type: 'completed', at: NOW, actorName: null, ip: null },
  ];
}

async function finalize(overrides: Partial<FinalInput> = {}) {
  const base = await makeBase();
  return composeFinalPdf({
    basePdf: base.pdf,
    docCode: 'C-2607-0001',
    now: NOW,
    title: '결제대행 서비스 이용 계약서',
    baseSha256: base.sha256,
    completedAt: NOW,
    signers: signers(),
    events: events(),
    ...overrides,
  });
}

describe('composeFinalPdf', () => {
  it('base 위에 별지2를 덧붙여 페이지가 늘어난다', async () => {
    const base = await makeBase();
    const { pdf } = await finalize({ basePdf: base.pdf, baseSha256: base.sha256 });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(base.pageCount);
  });

  it('산출물이 유효한 PDF 로 재파싱된다', async () => {
    const { pdf } = await finalize();
    expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    await expect(PDFDocument.load(pdf)).resolves.toBeDefined();
  });

  it('반환 sha256 은 반환 바이트의 해시와 일치한다', async () => {
    const { pdf, sha256 } = await finalize();
    expect(sha256).toBe(sha256Hex(pdf));
  });

  it('동일 입력을 두 번 확정하면 바이트가 동일하다', async () => {
    const base = await makeBase();
    const a = await finalize({ basePdf: base.pdf, baseSha256: base.sha256 });
    const b = await finalize({ basePdf: base.pdf, baseSha256: base.sha256 });
    expect(a.sha256).toBe(b.sha256);
    expect(a.pdf.equals(b.pdf)).toBe(true);
  });

  it('final 은 base 와 다른 문서다 — 별지2가 실제로 붙는다', async () => {
    const base = await makeBase();
    const { sha256 } = await finalize({ basePdf: base.pdf, baseSha256: base.sha256 });
    expect(sha256).not.toBe(base.sha256);
  });

  it('알 수 없는 이벤트 타입도 렌더된다 — 라벨 없는 타입에 던지지 않는다', async () => {
    // events[].type 은 문자열 계약이라 라벨 맵에 없는 값이 들어올 수 있다.
    // 감사추적은 증거이므로, 모르는 이벤트를 숨기거나 터뜨리는 대신 원문을 남긴다.
    const { pdf } = await finalize({
      events: [
        ...events(),
        { type: 'signer_reassigned', at: NOW, actorName: '이담당', ip: null },
        { type: 'future_event_type', at: NOW, actorName: null, ip: null },
      ],
    });
    await expect(PDFDocument.load(pdf)).resolves.toBeDefined();
  });

  it('이벤트가 많아 넘치면 다음 페이지로 이어진다', async () => {
    const many = await finalize({
      events: Array.from({ length: 60 }, (_, i) => ({
        type: 'viewed',
        at: new Date(Date.UTC(2026, 6, 16, 0, i)),
        actorName: `담당자 ${i}`,
        ip: `203.0.113.${i}`,
      })),
    });
    const few = await finalize();
    const manyDoc = await PDFDocument.load(many.pdf);
    const fewDoc = await PDFDocument.load(few.pdf);
    expect(manyDoc.getPageCount()).toBeGreaterThan(fewDoc.getPageCount());
  });
});
