// 레이아웃 → 실제 PDF 바이트. 여기서 두 좌표계가 만난다.
//
// 레이아웃은 **좌상단 원점**(공급자 좌표계)으로 계산하고 pdf-lib 은 **좌하단 원점**
// 으로 그린다. 뒤집기는 이 파일 한 곳에만 있고, 틀리면 글자와 서명칸이 위아래로
// 뒤집힌 채 발송된다 — 발송 전에는 아무도 못 본다. 그래서 만든 PDF 를 pdfjs 로
// 되읽어 **좌표까지** 대조한다.

import { describe, it, expect } from 'vitest';
import type { ContractDoc } from '@/lib/types/contract-doc';
import { PAGE, MARGIN } from '../layout';
import { renderContractPdf } from '../render-pdf';

const DOC: ContractDoc = {
  _v: 1,
  title: '전자결제 서비스 이용계약서',
  preamble: '주식회사 서포트비(이하 "갑")와 주식회사 페이지원(이하 "을")은 다음과 같이 계약을 체결한다.',
  clauses: [
    { id: 'a', kind: 'text', heading: '목적', body: '본 계약은 전자지급결제대행 업무를 정한다.' },
    {
      id: 'b',
      kind: 'feeTable',
      heading: '수수료',
      intro: '결제수단별 수수료는 다음과 같다.',
      outro: '수수료율 변경은 서면 합의에 따른다.',
    },
    { id: 'c', kind: 'text', heading: '정산', body: '정산주기는 D+3 이며 한도는 100,000,000원이다.' },
  ],
  closing: '본 계약의 성립을 증명하기 위하여 각 1부씩 보관한다.',
};

const INPUT = {
  doc: DOC,
  feeRows: [
    { label: '카드', value: '영세 0.50% · 일반 2.50%' },
    { label: '가상계좌', value: '건당 300원' },
  ],
  parties: {
    buyer: { company: '주식회사 서포트비', bizNo: '123-45-67890' },
    pg: { company: '주식회사 페이지원' },
  },
};

type TextItem = { str: string; x: number; y: number; page: number };

async function readPdf(bytes: Uint8Array): Promise<{ pages: { width: number; height: number }[]; items: TextItem[] }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: bytes, useSystemFonts: false });
  const doc = await task.promise;
  const pages: { width: number; height: number }[] = [];
  const items: TextItem[] = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    pages.push({ width: viewport.width, height: viewport.height });
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!('str' in item) || item.str === '') continue;
      // transform = [a,b,c,d,e,f] — e,f 가 PDF 사용자 공간(좌하단 원점) 좌표다.
      items.push({ str: item.str, x: item.transform[4], y: item.transform[5], page: p });
    }
  }
  await task.destroy();
  return { pages, items };
}

describe('renderContractPdf', () => {
  it('레이아웃이 센 쪽수·페이지 크기와 실제 PDF 가 일치한다', async () => {
    const r = await renderContractPdf(INPUT);
    const read = await readPdf(r.bytes);
    expect(read.pages).toHaveLength(r.pageCount);
    for (const page of read.pages) {
      // 공급자 좌표 기준이 곧 이 viewport 다 — 어긋나면 모든 서명칸이 틀어진다.
      expect(page.width).toBeCloseTo(PAGE.width, 1);
      expect(page.height).toBeCloseTo(PAGE.height, 1);
    }
  });

  it('한글 본문이 글자 그대로 살아 있다', async () => {
    const r = await renderContractPdf(INPUT);
    const { items } = await readPdf(r.bytes);
    const joined = items.map((i) => i.str).join('');
    expect(joined).toContain('전자결제 서비스 이용계약서');
    expect(joined).toContain('제1조 (목적)');
    expect(joined).toContain('제2조 (수수료)');
    expect(joined).toContain('제3조 (정산)');
    // 숫자·기호가 깨지지 않는다(GSUB 이형자 회귀)
    expect(joined).toContain('123-45-67890');
    expect(joined).toContain('D+3');
    expect(joined).toContain('100,000,000원');
    expect(joined).toContain('건당 300원');
  });

  it('좌표 뒤집기가 맞다 — 제목의 PDF y 가 (페이지높이 - 베이스라인) 이다', async () => {
    const r = await renderContractPdf(INPUT);
    const { items } = await readPdf(r.bytes);
    const titleOp = r.ops.find((op) => op.op === 'text' && op.text === DOC.title);
    expect(titleOp).toBeDefined();
    if (!titleOp || titleOp.op !== 'text') return;

    const titleItem = items.find((i) => i.str === DOC.title);
    expect(titleItem).toBeDefined();
    if (!titleItem) return;

    expect(titleItem.y).toBeCloseTo(PAGE.height - titleOp.baselineY, 1);
    expect(titleItem.x).toBeCloseTo(titleOp.x, 1);
  });

  it('제목이 실제로 가운데 정렬이다 — 뒤집기가 x 를 건드리지 않는다', async () => {
    const r = await renderContractPdf(INPUT);
    const { items } = await readPdf(r.bytes);
    const titleItem = items.find((i) => i.str === DOC.title);
    expect(titleItem).toBeDefined();
    if (!titleItem) return;
    expect(titleItem.x).toBeGreaterThan(MARGIN.left);
  });

  it('서명칸 좌표는 레이아웃 값 그대로다 — 이미 공급자 좌표계다', async () => {
    const r = await renderContractPdf(INPUT);
    expect(r.fields.length).toBeGreaterThan(0);
    for (const f of r.fields) {
      expect(f.y + f.height).toBeLessThanOrEqual(PAGE.height);
      expect(f.x + f.width).toBeLessThanOrEqual(PAGE.width);
    }
    // 구매사·PG 각각 서명칸이 있다
    expect(r.fields.some((f) => f.party === 'buyer' && f.type === 'signature')).toBe(true);
    expect(r.fields.some((f) => f.party === 'pg' && f.type === 'signature')).toBe(true);
  });

  // 같은 입력이 같은 바이트를 내야 미리보기와 발송본이 같다고 말할 수 있다.
  it('같은 입력은 같은 바이트를 만든다', async () => {
    const a = await renderContractPdf(INPUT);
    const b = await renderContractPdf(INPUT);
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true);
  });

  // 폰트를 통째로 싣기 때문에 산출이 크다 — 그게 의도다(pdf-font.ts 주석 참조).
  // 하한을 두는 이유: 폰트 프로그램이 빠지면(=서브셋 사고) 여기서 급격히 작아진다.
  // 상한은 폰트가 실수로 여러 벌 박히는 것을 잡는다.
  it('폰트가 통째로 박혀 있다 — 크기가 그 증거다', async () => {
    const r = await renderContractPdf(INPUT);
    expect(r.bytes.byteLength).toBeGreaterThan(1_000_000);
    expect(r.bytes.byteLength).toBeLessThan(8_000_000);
  });
});
