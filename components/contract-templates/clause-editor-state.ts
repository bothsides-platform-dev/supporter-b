// 조항 편집기 상태 전이 — **순수 함수만**. React·pdfjs·DOM 을 모른다.
//
// `template-editor-state.ts`(PDF 서명칸 에디터)와 같은 분리다: 컴포넌트가 무거운
// 의존성을 끌고 오더라도 상태 전이는 그것 없이 테스트된다. 조항 재배열·삭제는
// 사용자가 작성한 문서를 잃을 수 있는 연산이라, 경계 조건을 마운트 없이 못박는 게
// 값어치가 크다.

import type { ContractClause, ContractDoc } from '@/lib/types/contract-doc';
import { CONTRACT_DOC_VERSION } from '@/lib/types/contract-doc';

export type ClauseEditorState = {
  title: string;
  preamble: string;
  clauses: ContractClause[];
  closing: string;
};

let clauseSeq = 0;

/**
 * 편집기 내부 React key 겸 조항 식별자.
 *
 * `randomUUID` 를 쓰지 않는 이유: 이 값은 화면 밖으로 나가지 않고(문서 JSON 에는
 * 저장되지만 의미가 없다), 짧은 편이 디버깅에 낫다. 충돌만 안 하면 된다.
 */
export function newClauseId(): string {
  clauseSeq += 1;
  return `cl-${Date.now().toString(36)}-${clauseSeq}`;
}

export function fromDocument(doc: ContractDoc): ClauseEditorState {
  return {
    title: doc.title,
    preamble: doc.preamble,
    // 배열·원소를 복사한다 — 편집이 원본 문서(서버에서 받은 값)를 건드리면
    // "저장 안 했는데 목록이 바뀐" 상태가 된다.
    clauses: doc.clauses.map((c) => ({ ...c })),
    closing: doc.closing,
  };
}

export function toDocument(state: ClauseEditorState): ContractDoc {
  return {
    _v: CONTRACT_DOC_VERSION,
    title: state.title,
    preamble: state.preamble,
    clauses: state.clauses.map((c) => ({ ...c })),
    closing: state.closing,
  };
}

export function addClause(
  state: ClauseEditorState,
  kind: ContractClause['kind'],
): ClauseEditorState {
  const id = newClauseId();
  const clause: ContractClause =
    kind === 'feeTable'
      ? { id, kind: 'feeTable', heading: '', intro: '', outro: '' }
      : { id, kind: 'text', heading: '', body: '' };
  return { ...state, clauses: [...state.clauses, clause] };
}

export function removeClause(state: ClauseEditorState, id: string): ClauseEditorState {
  return { ...state, clauses: state.clauses.filter((c) => c.id !== id) };
}

/**
 * 한 칸 위/아래로 옮긴다. **경계에서는 아무것도 하지 않는다** — 배열 밖으로 밀면
 * 조항이 사라지거나 순서가 뒤집히고, 그건 사용자가 쓴 문서를 잃는 것이다.
 */
export function moveClause(
  state: ClauseEditorState,
  id: string,
  direction: 'up' | 'down',
): ClauseEditorState {
  const index = state.clauses.findIndex((c) => c.id === id);
  if (index === -1) return state;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= state.clauses.length) return state;
  const clauses = [...state.clauses];
  [clauses[index], clauses[target]] = [clauses[target], clauses[index]];
  return { ...state, clauses };
}

/** 조항 한 칸의 부분 수정. 종류에 없는 필드는 **무시한다**(아래 참조). */
export type ClausePatch = {
  heading?: string;
  body?: string;
  intro?: string;
  outro?: string;
};

export function updateClause(
  state: ClauseEditorState,
  id: string,
  patch: ClausePatch,
): ClauseEditorState {
  return {
    ...state,
    clauses: state.clauses.map((c) => {
      if (c.id !== id) return c;
      // 종류를 넘나드는 필드를 그대로 얹으면 판별 유니온이 깨진 객체가 만들어진다
      // (text 조항에 intro 가 붙는 식). 렌더러는 그 필드를 보지 않으므로 사용자가
      // 입력한 내용이 조용히 사라진다 — 그래서 종류에 맞는 필드만 받는다.
      if (c.kind === 'text') {
        return {
          ...c,
          ...(patch.heading !== undefined ? { heading: patch.heading } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
        };
      }
      return {
        ...c,
        ...(patch.heading !== undefined ? { heading: patch.heading } : {}),
        ...(patch.intro !== undefined ? { intro: patch.intro } : {}),
        ...(patch.outro !== undefined ? { outro: patch.outro } : {}),
      };
    }),
  };
}
