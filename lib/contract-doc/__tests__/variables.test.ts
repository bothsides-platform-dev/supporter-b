// 조항 본문의 `{{토큰}}` → 딜 값 치환.
//
// 이 기능의 값어치가 여기 있다: 수수료율·정산주기를 사람이 매번 타이핑하지 않는다.
// 그래서 **오타 토큰이 그대로 인쇄되는 것**이 최악의 실패다 — 서명되면 되돌릴 수
// 없으므로 미등록 토큰은 저장 시점에 fail-closed 로 막는다.

import { describe, it, expect } from 'vitest';
import type { ContractDoc } from '@/lib/types/contract-doc';
import {
  CONTRACT_VARIABLES,
  collectUnknownTokens,
  previewContractDoc,
  resolveContractDoc,
  type ContractVariableContext,
} from '../variables';

const CTX: ContractVariableContext = {
  buyerCompany: '주식회사 서포트비',
  pgCompany: '주식회사 페이지원',
  // KST 2026-08-17. UTC 로는 08-16 이라 시간대 처리가 틀리면 하루가 밀린다.
  contractDate: new Date('2026-08-17T01:00:00Z'),
  settleCycle: 'D+3',
  settleLimit: 100_000_000,
  guaranteeInsurance: 50_000_000,
  signupFee: 220_000,
};

function docWith(parts: Partial<ContractDoc>): ContractDoc {
  return {
    _v: 1,
    title: '전자결제 서비스 이용계약서',
    preamble: '',
    clauses: [],
    closing: '',
    ...parts,
  };
}

describe('계약서 변수 레지스트리', () => {
  it('모든 토큰이 라벨을 갖는다 — 편집기 삽입 메뉴가 이 배열에서 파생한다', () => {
    const entries = Object.entries(CONTRACT_VARIABLES);
    expect(entries.length).toBeGreaterThan(0);
    for (const [token, meta] of entries) {
      expect(token).toMatch(/^[^{}]+$/); // 토큰 키에 중괄호를 포함하지 않는다
      expect(meta.label.length).toBeGreaterThan(0);
    }
  });
});

describe('collectUnknownTokens — 저장 시 fail-closed', () => {
  it('등록된 토큰만 쓰면 빈 배열', () => {
    const doc = docWith({
      preamble: '{{구매사.상호}}(이하 "갑")와 {{PG사.상호}}(이하 "을")는',
      clauses: [{ id: 'c1', kind: 'text', heading: '정산', body: '정산주기는 {{정산주기}}로 한다.' }],
    });
    expect(collectUnknownTokens(doc)).toEqual([]);
  });

  it('오타 토큰을 찾아낸다', () => {
    const doc = docWith({ preamble: '{{구매사.상후}}는' });
    expect(collectUnknownTokens(doc)).toEqual(['구매사.상후']);
  });

  it('제목·전문·조항 본문·말미문언을 모두 훑는다', () => {
    const doc = docWith({
      title: '{{없는1}}',
      preamble: '{{없는2}}',
      clauses: [
        { id: 'c1', kind: 'text', heading: '조', body: '{{없는3}}' },
        { id: 'c2', kind: 'feeTable', heading: '수수료', intro: '{{없는4}}', outro: '{{없는5}}' },
      ],
      closing: '{{없는6}}',
    });
    expect(collectUnknownTokens(doc)).toEqual([
      '없는1', '없는2', '없는3', '없는4', '없는5', '없는6',
    ]);
  });

  it('같은 미등록 토큰은 한 번만 보고한다', () => {
    const doc = docWith({ preamble: '{{오타}} {{오타}} {{오타}}' });
    expect(collectUnknownTokens(doc)).toEqual(['오타']);
  });

  // 조항 제목은 **치환 대상이 아니다**(목차가 딜마다 달라지면 조항을 특정할 수 없다).
  // 그 결정은 옳지만, 훑기에서까지 빼면 제목에 쓴 토큰이 아무 게이트도 만나지 못하고
  // `{{계약일}}` 이 **그대로 인쇄된 계약서가 서명된다**. 제목의 토큰은 등록 여부와
  // 무관하게 전부 거부한다 — 치환되지 않을 것이므로 등록 토큰도 똑같이 위험하다.
  it('조항 제목에 쓴 토큰은 등록된 것이라도 거부한다', () => {
    const doc = docWith({
      clauses: [{ id: 'c1', kind: 'text', heading: '{{계약일}} 기준', body: '본문' }],
    });
    expect(collectUnknownTokens(doc)).toEqual(['계약일']);
  });

  it('수수료 표 제목의 토큰도 거부한다', () => {
    const doc = docWith({
      clauses: [{ id: 'c1', kind: 'feeTable', heading: '{{정산주기}}', intro: '', outro: '' }],
    });
    expect(collectUnknownTokens(doc)).toEqual(['정산주기']);
  });
});

describe('resolveContractDoc', () => {
  it('등록 토큰을 딜 값으로 바꾼다', () => {
    const doc = docWith({
      preamble: '{{구매사.상호}}(이하 "갑")와 {{PG사.상호}}(이하 "을")',
    });
    const r = resolveContractDoc(doc, CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.preamble).toBe('주식회사 서포트비(이하 "갑")와 주식회사 페이지원(이하 "을")');
  });

  it('금액은 천단위 구분 + 원 으로 쓴다', () => {
    const doc = docWith({
      clauses: [{
        id: 'c1', kind: 'text', heading: '정산',
        body: '한도 {{정산한도}}, 보증보험 {{보증보험}}, 가입비 {{가입비}}',
      }],
    });
    const r = resolveContractDoc(doc, CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const clause = r.doc.clauses[0];
    expect(clause.kind).toBe('text');
    if (clause.kind !== 'text') return;
    expect(clause.body).toBe('한도 100,000,000원, 보증보험 50,000,000원, 가입비 220,000원');
  });

  it('계약일은 한국 시간 기준 한국어 표기다', () => {
    const doc = docWith({ closing: '{{계약일}}' });
    const r = resolveContractDoc(doc, CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.closing).toBe('2026년 8월 17일');
  });

  it('같은 토큰이 여러 번 나오면 모두 치환한다', () => {
    const doc = docWith({ preamble: '{{정산주기}} / {{정산주기}}' });
    const r = resolveContractDoc(doc, CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.preamble).toBe('D+3 / D+3');
  });

  // 심층 방어 — 저장 검증을 우회해 들어온 문서(구버전 행·직접 호출)가
  // `{{오타}}` 를 그대로 인쇄한 채 서명되는 것을 막는다.
  it('미등록 토큰이 있으면 치환하지 않고 거부한다', () => {
    const doc = docWith({ preamble: '{{구매사.상호}} {{오타}}' });
    const r = resolveContractDoc(doc, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.unknownTokens).toEqual(['오타']);
  });

  it('feeTable 조항의 intro·outro 도 치환한다', () => {
    const doc = docWith({
      clauses: [{
        id: 'c1', kind: 'feeTable', heading: '수수료',
        intro: '{{구매사.상호}}의 수수료는 다음과 같다.',
        outro: '정산주기는 {{정산주기}}.',
      }],
    });
    const r = resolveContractDoc(doc, CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const clause = r.doc.clauses[0];
    if (clause.kind !== 'feeTable') return;
    expect(clause.intro).toBe('주식회사 서포트비의 수수료는 다음과 같다.');
    expect(clause.outro).toBe('정산주기는 D+3.');
  });

  it('원본 문서를 변형하지 않는다', () => {
    const doc = docWith({ preamble: '{{구매사.상호}}' });
    resolveContractDoc(doc, CTX);
    expect(doc.preamble).toBe('{{구매사.상호}}');
  });
});

// 편집 시점에는 딜이 없다 — 토큰을 그대로 두면 미리보기에 `{{구매사.상호}}` 가 찍혀
// "이대로 나가나?" 싶고, 빈 문자열로 지우면 문장이 무너져 조판을 판단할 수 없다.
// 자리표시자 치환이 이 함수가 `resolveContractDoc` 과 따로 존재하는 이유 전부이므로,
// 그것을 직접 단언한다(라우트 테스트는 200 만 보므로 본문을 항등함수로 바꿔도 green 이다).
describe('previewContractDoc', () => {
  it('등록 토큰을 〔라벨〕 자리표시자로 바꾼다', () => {
    const doc = docWith({ preamble: '{{구매사.상호}}와 {{PG사.상호}}' });
    const r = previewContractDoc(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.preamble).toBe(
      `〔${CONTRACT_VARIABLES['구매사.상호'].label}〕와 〔${CONTRACT_VARIABLES['PG사.상호'].label}〕`,
    );
    expect(r.doc.preamble).not.toContain('{{');
  });

  it('조항 본문·표 앞뒤 문장도 바꾼다', () => {
    const doc = docWith({
      clauses: [
        { id: 'c1', kind: 'text', heading: '정산', body: '정산주기는 {{정산주기}}.' },
        { id: 'c2', kind: 'feeTable', heading: '수수료', intro: '{{가입비}}', outro: '{{정산한도}}' },
      ],
    });
    const r = previewContractDoc(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const clause of r.doc.clauses) {
      const parts = clause.kind === 'text' ? [clause.body] : [clause.intro, clause.outro];
      for (const p of parts) expect(p).not.toContain('{{');
    }
  });

  it('미등록 토큰이 있으면 거부한다', () => {
    expect(previewContractDoc(docWith({ preamble: '{{없는토큰}}' }))).toEqual({
      ok: false,
      unknownTokens: ['없는토큰'],
    });
  });

  it('원본 문서를 변형하지 않는다', () => {
    const doc = docWith({ preamble: '{{구매사.상호}}' });
    previewContractDoc(doc);
    expect(doc.preamble).toBe('{{구매사.상호}}');
  });
});
