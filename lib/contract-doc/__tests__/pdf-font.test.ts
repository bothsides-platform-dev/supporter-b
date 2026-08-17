// Phase 0 위험 선증명 — "우리가 만든 한글 PDF 에 글자가 실제로 찍히는가".
//
// pdf-lib 의 `subset: true` 는 CJK 글리프가 조용히 누락되는 알려진 버그가 있다
// (Hopding/pdf-lib#1232). 눈으로 보는 확인은 빈 글리프를 놓치므로, 만든 PDF 를
// pdfjs 로 되읽어 **텍스트를 글자 단위로 대조**한다. 이 테스트가 이 기능 전체의
// 전제이고, 폰트 파일·임베딩 옵션이 바뀌면 여기서 먼저 빨개져야 한다.

import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  loadContractFontBytes,
  embedContractFonts,
  loadGlyphCoverage,
  missingGlyphs,
} from '../pdf-font';

// 기본 조항 세트에서 실제로 쓰일 어휘 — 한글/라틴/숫자/기호가 섞인 최악 케이스.
const SAMPLE = [
  '전자결제 서비스 이용계약서',
  '제1조 (목적) 본 계약은 갑과 을 사이의 전자지급결제대행 업무에 관하여',
  '신용카드 2.50%, 계좌이체 1.30%, 가상계좌 300원 (VAT 별도)',
  '정산주기는 D+3 영업일로 한다.',
  '주식회사 서포트비 · 대표이사 홍길동 · 사업자등록번호 123-45-67890',
].join('\n');

describe('계약서 PDF 폰트 — 한글 임베딩', () => {
  it('Pretendard static 폰트 바이트를 읽어온다', async () => {
    const fonts = await loadContractFontBytes();
    expect(fonts.regular.byteLength).toBeGreaterThan(100_000);
    expect(fonts.bold.byteLength).toBeGreaterThan(100_000);
    // TTF(glyf) 시그니처 `00 01 00 00` 을 못박는다. OTF(CFF)면 'OTTO' 가 나오는데,
    // @pdf-lib/fontkit 은 이 폰트의 CFF 글리프를 그리다 죽는다 — 그래서 이건
    // 취향이 아니라 **동작 조건**이다(pdf-font.ts 의 FONT_FILES 주석 참조).
    expect(Array.from(fonts.regular.slice(0, 4))).toEqual([0x00, 0x01, 0x00, 0x00]);
    expect(Array.from(fonts.bold.slice(0, 4))).toEqual([0x00, 0x01, 0x00, 0x00]);
  });

  it('기본 조항에 쓰이는 문자는 전부 폰트 커버리지 안에 있다', async () => {
    const coverage = await loadGlyphCoverage();
    expect(missingGlyphs(SAMPLE, coverage)).toEqual([]);
  });

  it('커버리지 밖 문자(한자)를 찾아낸다 — 조용한 빈칸을 오류로 바꾼다', async () => {
    const coverage = await loadGlyphCoverage();
    // 한자 상호(株式會社)는 발송 시점에 구매사 이름으로 들어올 수 있다.
    // 여기서 잡지 못하면 서명된 계약서에 빈칸으로 실린다.
    const missing = missingGlyphs('株式會社 테스트', coverage);
    expect(missing).toEqual(['株', '式', '會', '社']);
  });

  it('커버리지 검증은 개행을 통과시키고 같은 문자를 한 번만 보고한다', async () => {
    const coverage = await loadGlyphCoverage();
    expect(missingGlyphs('가\n나\t다', coverage)).toEqual([]);
    expect(missingGlyphs('株株株', coverage)).toEqual(['株']);
  });

  it('한글을 그린 PDF 를 pdfjs 로 되읽으면 원문과 글자 단위로 일치한다', async () => {
    const doc = await PDFDocument.create();
    const { regular } = await embedContractFonts(doc);
    const page = doc.addPage([595.28, 841.89]);

    const lines = SAMPLE.split('\n');
    lines.forEach((line, i) => {
      page.drawText(line, { x: 50, y: 780 - i * 20, size: 11, font: regular });
    });

    const bytes = await doc.save();
    const extracted = await extractTextLines(bytes);

    // 글자 단위 대조 — 빈 글리프는 추출 텍스트에서 사라지거나 대체문자가 된다.
    expect(extracted.join('\n')).toBe(SAMPLE);
  });

  // 회귀 — 이 한 줄이 실패하면 사업자등록번호가 `123㏄45㏄67890` 으로 복사된다.
  // 원인과 처방은 pdf-font.ts 의 `cmapOnlyFontkit` 주석 참조. 폰트를 갈아끼우거나
  // 그 프록시를 "단순화" 하면 여기서 먼저 빨개져야 한다.
  it('숫자 옆 하이픈·플러스가 추출에서 살아남는다 (GSUB 이형자 치환 회귀)', async () => {
    const doc = await PDFDocument.create();
    const { regular } = await embedContractFonts(doc);
    const page = doc.addPage([595.28, 841.89]);
    const line = '사업자등록번호 123-45-67890 · 정산 D+3 · 2026-08-17';
    page.drawText(line, { x: 50, y: 700, size: 11, font: regular });

    const extracted = await extractTextLines(await doc.save());
    expect(extracted.join('')).toBe(line);
  });
});

/** 산출 PDF 를 pdfjs 로 되읽어 페이지의 텍스트 아이템을 줄 단위로 돌려준다. */
async function extractTextLines(bytes: Uint8Array): Promise<string[]> {
  // legacy 빌드는 Node 용이다 — 기본 빌드는 top-level `new DOMMatrix()` 로 죽는다
  // (이 레포가 에디터를 `ssr:false` 로 두는 이유와 같은 뿌리).
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: bytes, useSystemFonts: false });
  const doc = await task.promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const out = content.items
    .map((it) => ('str' in it ? it.str : ''))
    .filter((s) => s !== '');
  await task.destroy();
  return out;
}
