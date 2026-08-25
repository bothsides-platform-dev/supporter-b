// 레이아웃 엔진 — 순수 함수. PDF 바이트를 만지지 않고 폰트도 모른다.
//
// 이 엔진의 산출물 중 **서명칸 좌표**가 이 기능의 핵심이다: 업계는 생성 문서에
// 앵커 문자열을 숨겨 서명칸을 찾게 하지만(DocuSign AutoPlace), 우리는 렌더러를
// 소유하므로 레이아웃이 좌표를 직접 뱉는다. 그래서 좌표가 틀리면 서명칸이 엉뚱한
// 자리에 앉고, 그건 발송 전에 아무도 못 본다 — 테스트가 유일한 감시자다.

import { describe, it, expect } from 'vitest';
import type { ContractDoc } from '@/lib/types/contract-doc';
import { validateTemplateFields } from '@/lib/signing/template-fields';
import { layoutContract, PAGE, MARGIN, type TextMetrics } from '../layout';

// 가짜 metric — 한글 1칸, 라틴 0.5칸. 폰트 없이 줄바꿈·페이지 분기를 검증한다.
const metrics: TextMetrics = {
  widthOf: (text, size) =>
    Array.from(text).reduce((w, ch) => w + (/[\x20-\x7E]/.test(ch) ? size * 0.5 : size), 0),
};

const PARTIES = {
  buyer: { company: '주식회사 서포트비', bizNo: '123-45-67890' },
  pg: { company: '주식회사 페이지원' },
};

function doc(over: Partial<ContractDoc> = {}): ContractDoc {
  return {
    _v: 1,
    title: '전자결제 서비스 이용계약서',
    preamble: '갑과 을은 다음과 같이 계약을 체결한다.',
    clauses: [
      { id: 'a', kind: 'text', heading: '목적', body: '본 계약은 목적을 정한다.' },
      { id: 'b', kind: 'text', heading: '정산', body: '정산주기는 D+3 로 한다.' },
    ],
    closing: '위 계약을 증명하기 위하여 각 1부씩 보관한다.',
    ...over,
  };
}

const run = (over: Partial<ContractDoc> = {}, feeRows: { label: string; value: string }[] = []) =>
  layoutContract({ doc: doc(over), feeRows, parties: PARTIES }, metrics);

describe('layoutContract — 조 번호', () => {
  it('배열 순서대로 제N조 를 매긴다', () => {
    const r = run();
    const texts = r.ops.flatMap((op) => (op.op === 'text' ? [op.text] : []));
    expect(texts).toContain('제1조 (목적)');
    expect(texts).toContain('제2조 (정산)');
  });

  it('조항을 재배열하면 번호가 따라 바뀐다 — 번호는 저장되지 않는다', () => {
    const r = run({
      clauses: [
        { id: 'b', kind: 'text', heading: '정산', body: '정산주기는 D+3 로 한다.' },
        { id: 'a', kind: 'text', heading: '목적', body: '본 계약은 목적을 정한다.' },
      ],
    });
    const texts = r.ops.flatMap((op) => (op.op === 'text' ? [op.text] : []));
    expect(texts).toContain('제1조 (정산)');
    expect(texts).toContain('제2조 (목적)');
  });
});

describe('layoutContract — 서명칸', () => {
  it('구매사·PG 각각 서명 가능한 칸을 만든다 (기존 검증기를 통과한다)', () => {
    const r = run();
    expect(validateTemplateFields(r.fields)).toEqual({ ok: true });
  });

  it('서명칸은 공급자 좌표계를 따른다 — 1-based page, 좌상단 원점, 페이지 안', () => {
    const r = run();
    expect(r.fields.length).toBeGreaterThan(0);
    for (const f of r.fields) {
      expect(f.pageNumber).toBeGreaterThanOrEqual(1);
      expect(f.pageNumber).toBeLessThanOrEqual(r.pageCount);
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.width).toBeGreaterThan(0);
      expect(f.height).toBeGreaterThan(0);
      expect(f.x + f.width).toBeLessThanOrEqual(PAGE.width);
      expect(f.y + f.height).toBeLessThanOrEqual(PAGE.height);
    }
  });

  // 서명란이 페이지 경계에 걸리면 갑의 칸과 을의 칸이 다른 장에 앉는다 —
  // 법적으로도 어색하고 좌표만 봐서는 알 수 없다.
  it('서명란은 통째로 한 페이지 안에 있다', () => {
    const pages = new Set(run().fields.map((f) => f.pageNumber));
    expect(pages.size).toBe(1);
  });

  it('긴 문서에서도 서명란이 쪼개지지 않는다', () => {
    const long = Array.from({ length: 40 }, (_, i) => ({
      id: `c${i}`,
      kind: 'text' as const,
      heading: `조항 ${i}`,
      body: '가나다라마바사아자차카타파하'.repeat(12),
    }));
    const r = run({ clauses: long });
    expect(r.pageCount).toBeGreaterThan(1);
    expect(new Set(r.fields.map((f) => f.pageNumber)).size).toBe(1);
  });

  it('값을 아는 항목은 텍스트로 인쇄하고 모르는 항목만 서명칸으로 남긴다', () => {
    const r = run();
    const texts = r.ops.flatMap((op) => (op.op === 'text' ? [op.text] : []));
    // 상호는 항상 알고, 구매사 사업자등록번호도 이 케이스에선 안다 → 인쇄
    expect(texts.some((t) => t.includes('주식회사 서포트비'))).toBe(true);
    expect(texts.some((t) => t.includes('123-45-67890'))).toBe(true);
    // PG 사업자등록번호는 모른다 → 서명 화면에서 채우도록 text 필드
    const pgTextFields = r.fields.filter((f) => f.party === 'pg' && f.type === 'text');
    expect(pgTextFields.length).toBeGreaterThan(0);
    // 주소·대표자는 스키마에 없으므로 양측 모두 필드다
    expect(r.fields.filter((f) => f.party === 'buyer' && f.type === 'text').length)
      .toBeGreaterThan(0);
  });
});

describe('layoutContract — 페이지', () => {
  it('짧은 문서는 한 장', () => {
    expect(run().pageCount).toBe(1);
  });

  it('내용이 넘치면 페이지가 늘어난다', () => {
    const long = Array.from({ length: 40 }, (_, i) => ({
      id: `c${i}`,
      kind: 'text' as const,
      heading: `조항 ${i}`,
      body: '가나다라마바사아자차카타파하'.repeat(12),
    }));
    expect(run({ clauses: long }).pageCount).toBeGreaterThan(1);
  });

  it('모든 그리기 연산이 페이지 여백 안에 있다', () => {
    const long = Array.from({ length: 25 }, (_, i) => ({
      id: `c${i}`,
      kind: 'text' as const,
      heading: `조항 ${i}`,
      body: '가나다라마바사아자차카타파하'.repeat(8),
    }));
    const r = run({ clauses: long });
    for (const op of r.ops) {
      expect(op.page).toBeGreaterThanOrEqual(1);
      expect(op.page).toBeLessThanOrEqual(r.pageCount);
      const y = op.op === 'text' ? op.baselineY : op.y;
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThanOrEqual(PAGE.height - MARGIN.bottom + 24);
      expect(op.x).toBeGreaterThanOrEqual(MARGIN.left - 1);
    }
  });

  // 제목만 페이지 끝에 남고 본문이 다음 장으로 넘어가면 읽는 사람이 조항을 잃는다.
  it('조 제목이 페이지 마지막에 혼자 남지 않는다', () => {
    // 여러 길이로 훑어 경계에 제목이 걸리는 조합을 찾는다.
    for (const count of [8, 12, 16, 20, 24, 28]) {
      const clauses = Array.from({ length: count }, (_, i) => ({
        id: `c${i}`,
        kind: 'text' as const,
        heading: `조항 ${i}`,
        body: '가나다라마바사아자차카타파하'.repeat(6),
      }));
      const r = layoutContract({ doc: doc({ clauses }), feeRows: [], parties: PARTIES }, metrics);
      const headings = r.ops.filter(
        (op) => op.op === 'text' && /^제\d+조 \(/.test(op.text),
      );
      for (const h of headings) {
        // 같은 페이지에 이 제목보다 아래에 있는 본문 텍스트가 최소 하나 있어야 한다.
        const below = r.ops.some(
          (op) =>
            op.op === 'text' &&
            op.page === h.page &&
            op.baselineY > (h.op === 'text' ? h.baselineY : 0),
        );
        expect(below, `count=${count} heading=${h.op === 'text' ? h.text : ''}`).toBe(true);
      }
    }
  });
});

describe('layoutContract — 수수료 표', () => {
  it('feeTable 조항은 표 행을 그린다', () => {
    const r = run(
      {
        clauses: [
          { id: 'f', kind: 'feeTable', heading: '수수료', intro: '요율은 다음과 같다.', outro: '끝.' },
        ],
      },
      [
        { label: '카드', value: '2.50%' },
        { label: '계좌이체', value: '1.30%' },
      ],
    );
    const texts = r.ops.flatMap((op) => (op.op === 'text' ? [op.text] : []));
    expect(texts).toContain('카드');
    expect(texts.some((t) => t.includes('2.50%'))).toBe(true);
    expect(texts.some((t) => t.includes('1.30%'))).toBe(true);
    expect(texts).toContain('요율은 다음과 같다.');
  });

  it('요율이 하나도 없으면 표 대신 안내 문장을 남긴다 — 빈 표를 그리지 않는다', () => {
    const r = run({
      clauses: [
        { id: 'f', kind: 'feeTable', heading: '수수료', intro: '요율은 다음과 같다.', outro: '끝.' },
      ],
    });
    const texts = r.ops.flatMap((op) => (op.op === 'text' ? [op.text] : []));
    expect(texts.some((t) => t.includes('별도 협의'))).toBe(true);
  });
});
