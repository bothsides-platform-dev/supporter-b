// 문서 텍스트 순회 단일 출처.
//
// 왜 한 곳이어야 하는가: v0.4.57.0 이 고친 결함 **둘 다** "순회가 어떤 필드를 빠뜨렸다"
// 였다 — 조항 제목의 토큰이 어떤 게이트도 안 만났고(그대로 인쇄된 채 서명), 수수료 표
// 라벨이 글리프 검사를 안 지났다(서명된 계약서에 빈칸). 순회가 넷으로 흩어져 있으면
// v2 에서 필드를 하나 더할 때 또 같은 종류의 구멍이 난다.

import { describe, it, expect } from 'vitest';
import type { ContractDoc } from '@/lib/types/contract-doc';
import {
  collectDrawableText,
  contractDocTokenSources,
  mapContractDocText,
} from '../doc-text';

const DOC: ContractDoc = {
  _v: 1,
  title: '전자결제 서비스 이용계약서',
  preamble: '갑과 을은 다음과 같이 계약을 체결한다.',
  clauses: [
    { id: 'c1', kind: 'text', heading: '목적', body: '본 계약은 목적을 정한다.' },
    { id: 'c2', kind: 'feeTable', heading: '수수료', intro: '앞 문장', outro: '뒤 문장' },
  ],
  closing: '각 1부씩 보관한다.',
};

describe('contractDocTokenSources', () => {
  it('문서 순서대로 훑는다 — 등장 순서가 미등록 토큰 보고 순서를 정한다', () => {
    expect(contractDocTokenSources(DOC).map((p) => p.text)).toEqual([
      '전자결제 서비스 이용계약서',
      '갑과 을은 다음과 같이 계약을 체결한다.',
      '목적',
      '본 계약은 목적을 정한다.',
      '수수료',
      '앞 문장',
      '뒤 문장',
      '각 1부씩 보관한다.',
    ]);
  });

  // 이 비대칭이 이 함수의 존재 이유다. 제목은 치환되지 않으므로 거기 쓴 토큰은
  // 등록돼 있어도 그대로 인쇄된다 — 그래서 훑기에는 **포함**하되 플래그로 가른다.
  it('조항 제목만 substituted:false 로 표시한다', () => {
    const notSubstituted = contractDocTokenSources(DOC)
      .filter((p) => !p.substituted)
      .map((p) => p.text);
    expect(notSubstituted).toEqual(['목적', '수수료']);
  });
});

describe('mapContractDocText', () => {
  it('제목을 제외한 모든 텍스트에 변환을 적용한다', () => {
    const out = mapContractDocText(DOC, (t) => `[${t}]`);
    expect(out.title).toBe('[전자결제 서비스 이용계약서]');
    expect(out.preamble).toBe('[갑과 을은 다음과 같이 계약을 체결한다.]');
    expect(out.closing).toBe('[각 1부씩 보관한다.]');
    const [text, fee] = out.clauses;
    if (text.kind !== 'text' || fee.kind !== 'feeTable') throw new Error('shape');
    expect(text.body).toBe('[본 계약은 목적을 정한다.]');
    expect(fee.intro).toBe('[앞 문장]');
    expect(fee.outro).toBe('[뒤 문장]');
    // 제목은 치환 대상이 아니다 — 목차가 딜마다 달라지면 조항을 특정할 수 없다.
    expect(text.heading).toBe('목적');
    expect(fee.heading).toBe('수수료');
  });

  it('원본을 변형하지 않는다', () => {
    mapContractDocText(DOC, () => 'X');
    expect(DOC.title).toBe('전자결제 서비스 이용계약서');
    expect(DOC.clauses[0].kind === 'text' && DOC.clauses[0].body).toBe('본 계약은 목적을 정한다.');
  });
});

describe('collectDrawableText', () => {
  it('문서만 넘기면 조항 텍스트 전체를 담는다 (제목 포함)', () => {
    const text = collectDrawableText({ doc: DOC });
    for (const s of ['전자결제', '갑과 을', '목적', '본 계약은', '수수료', '앞 문장', '뒤 문장', '각 1부씩']) {
      expect(text).toContain(s);
    }
  });

  // ⚠️ 여기가 이 함수의 값어치다 — PDF 에 그려지는데 검사 대상에서 빠지던 것들.
  it('수수료 표 라벨·값과 당사자 상호·사업자번호까지 담는다', () => {
    const text = collectDrawableText({
      doc: DOC,
      feeRows: [{ label: '無通帳 입금', value: '2.50%' }],
      parties: {
        buyer: { company: '주식회사 구매', bizNo: '111-22-33333' },
        pg: { company: '주식회사 페이', bizNo: '444-55-66666' },
      },
    });
    expect(text).toContain('無通帳 입금');
    expect(text).toContain('2.50%');
    expect(text).toContain('주식회사 구매');
    expect(text).toContain('주식회사 페이');
    expect(text).toContain('111-22-33333');
    expect(text).toContain('444-55-66666');
  });

  it('사업자번호가 없으면 빈 자리를 만들지 않는다', () => {
    const text = collectDrawableText({
      doc: DOC,
      parties: { buyer: { company: '갑' }, pg: { company: '을' } },
    });
    expect(text).toContain('갑');
    expect(text).toContain('을');
    expect(text).not.toContain('undefined');
  });
});
