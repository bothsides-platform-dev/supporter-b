// 조항 편집기 상태 — **순수 리듀서**. 마운트 없이 검증한다.
//
// `template-editor-state.ts`(PDF 에디터)와 같은 분리다: 컴포넌트가 무거운 의존성을
// 끌고 오더라도 상태 전이는 그것 없이 테스트된다.

import { describe, it, expect } from 'vitest';
import {
  addClause,
  fromDocument,
  moveClause,
  newClauseId,
  removeClause,
  toDocument,
  updateClause,
  type ClauseEditorState,
} from '../clause-editor-state';
import type { ContractDoc } from '@/lib/types/contract-doc';

const DOC: ContractDoc = {
  _v: 1,
  title: '전자결제 서비스 이용계약서',
  preamble: '갑과 을은 다음과 같이 계약을 체결한다.',
  clauses: [
    { id: 'a', kind: 'text', heading: '목적', body: '본문 A' },
    { id: 'b', kind: 'feeTable', heading: '수수료', intro: '앞', outro: '뒤' },
    { id: 'c', kind: 'text', heading: '정산', body: '본문 C' },
  ],
  closing: '각 1부씩 보관한다.',
};

const state = (): ClauseEditorState => fromDocument(DOC);
const ids = (s: ClauseEditorState) => s.clauses.map((c) => c.id);

describe('fromDocument / toDocument', () => {
  it('문서를 편집 상태로 옮기고 되돌려도 같다', () => {
    expect(toDocument(fromDocument(DOC))).toEqual(DOC);
  });

  it('되돌린 문서는 항상 현재 버전을 단다', () => {
    expect(toDocument(fromDocument(DOC))._v).toBe(1);
  });
});

describe('addClause', () => {
  it('맨 뒤에 빈 조항을 더한다', () => {
    const next = addClause(state(), 'text');
    expect(next.clauses).toHaveLength(4);
    const added = next.clauses[3];
    expect(added.kind).toBe('text');
    expect(added.heading).toBe('');
  });

  it('새 조항 id 는 기존과 겹치지 않는다', () => {
    const next = addClause(state(), 'text');
    expect(new Set(ids(next)).size).toBe(next.clauses.length);
  });

  it('수수료 표 조항도 더할 수 있다', () => {
    const next = addClause(state(), 'feeTable');
    expect(next.clauses[3].kind).toBe('feeTable');
  });

  it('원본 상태를 변형하지 않는다', () => {
    const s = state();
    addClause(s, 'text');
    expect(s.clauses).toHaveLength(3);
  });
});

describe('removeClause', () => {
  it('지정한 조항만 지운다', () => {
    expect(ids(removeClause(state(), 'b'))).toEqual(['a', 'c']);
  });

  it('없는 id 는 아무것도 바꾸지 않는다', () => {
    expect(ids(removeClause(state(), 'zzz'))).toEqual(['a', 'b', 'c']);
  });
});

describe('moveClause', () => {
  it('위로 옮긴다', () => {
    expect(ids(moveClause(state(), 'b', 'up'))).toEqual(['b', 'a', 'c']);
  });

  it('아래로 옮긴다', () => {
    expect(ids(moveClause(state(), 'b', 'down'))).toEqual(['a', 'c', 'b']);
  });

  // 경계에서 조용히 사라지거나 순서가 뒤집히면 사용자는 조항을 잃는다.
  it('맨 위에서 더 위로는 그대로', () => {
    expect(ids(moveClause(state(), 'a', 'up'))).toEqual(['a', 'b', 'c']);
  });

  it('맨 아래에서 더 아래로는 그대로', () => {
    expect(ids(moveClause(state(), 'c', 'down'))).toEqual(['a', 'b', 'c']);
  });

  it('없는 id 는 아무것도 바꾸지 않는다', () => {
    expect(ids(moveClause(state(), 'zzz', 'up'))).toEqual(['a', 'b', 'c']);
  });

  // 조 번호는 순서에서 파생하므로 재배열이 곧 재번호다 — 내용이 따라가야 한다.
  it('옮겨도 조항 내용이 함께 간다', () => {
    const moved = moveClause(state(), 'c', 'up');
    const c = moved.clauses[1];
    expect(c.id).toBe('c');
    expect(c.kind === 'text' && c.body).toBe('본문 C');
  });
});

describe('updateClause', () => {
  it('제목을 고친다', () => {
    const next = updateClause(state(), 'a', { heading: '새 제목' });
    expect(next.clauses[0].heading).toBe('새 제목');
  });

  it('text 조항의 본문을 고친다', () => {
    const next = updateClause(state(), 'a', { body: '새 본문' });
    const c = next.clauses[0];
    expect(c.kind === 'text' && c.body).toBe('새 본문');
  });

  it('feeTable 조항의 앞뒤 문장을 고친다', () => {
    const next = updateClause(state(), 'b', { intro: '새 앞', outro: '새 뒤' });
    const c = next.clauses[1];
    expect(c.kind === 'feeTable' && c.intro).toBe('새 앞');
    expect(c.kind === 'feeTable' && c.outro).toBe('새 뒤');
  });

  // 종류를 넘나드는 필드는 무시한다 — text 조항에 intro 를 넣으면 렌더가 잃는다.
  it('종류에 없는 필드는 무시한다', () => {
    const next = updateClause(state(), 'a', { intro: '들어가면 안 됨' });
    expect(next.clauses[0]).toEqual(DOC.clauses[0]);
  });

  it('다른 조항은 건드리지 않는다', () => {
    const next = updateClause(state(), 'a', { heading: '바뀜' });
    expect(next.clauses[1]).toEqual(DOC.clauses[1]);
    expect(next.clauses[2]).toEqual(DOC.clauses[2]);
  });
});

describe('newClauseId', () => {
  it('부를 때마다 다른 값을 준다', () => {
    const seen = new Set(Array.from({ length: 50 }, () => newClauseId()));
    expect(seen.size).toBe(50);
  });
});
