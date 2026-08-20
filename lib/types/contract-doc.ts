// 조항형 계약서 문서 — 버전드 JSONB.
//
// `lib/types/rfp-terms.ts` 의 규율을 그대로 따른다: **읽기는 관대**(어떤 `_v` 든
// 현재 정규형으로 올린다), **쓰기는 정규**(항상 현재 버전을 emit). 그래서 버전
// 범프가 백필 없는 lazy migration 이 된다.
//
// 이 문서가 SSOT 다 — 공급자에는 렌더한 PDF 만 올라가고, 우리가 들고 있는 것은
// 이 JSON 이다. 그래서 서식 편집은 provider 왕복 없이 로컬 UPDATE 하나로 끝난다
// (PDF 업로드 서식이 재생성-후-id-교체를 해야 하는 것과 대조).

/** 조 번호는 **저장하지 않는다** — 배열 순서에서 렌더 시각에 파생한다. */
export type ContractClause =
  | {
      id: string;
      kind: 'text';
      /** `제N조 (제목)` 의 제목 부분. 번호는 붙이지 않는다. */
      heading: string;
      /** 자유 텍스트. 빈 줄 = 문단 구분, 개행 = 강제 줄바꿈. `{{토큰}}` 허용. */
      body: string;
    }
  | {
      id: string;
      kind: 'feeTable';
      heading: string;
      /** 표 앞뒤 문장. `{{토큰}}` 허용. */
      intro: string;
      outro: string;
    };

/**
 * id 가 아직 없는 조항 — 기본 세트 정의와 편집기의 "조항 추가"가 공유한다.
 *
 * 평범한 `Omit<ContractClause, 'id'>` 를 쓰면 안 된다: `Omit` 은 유니온에 분배되지
 * 않아 **공통 키(`kind`·`heading`)만 남기고** `body`·`intro` 를 지운다. 조건부
 * 타입으로 각 팔에 분배해야 판별 유니온이 살아남는다.
 */
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;
export type ContractClauseDraft = WithoutId<ContractClause>;

export const CONTRACT_DOC_VERSION = 1 as const;

export type ContractDocV1 = {
  _v: 1;
  title: string;
  /** 전문 — 당사자 표시. */
  preamble: string;
  clauses: ContractClause[];
  /** 말미문언 — "본 계약의 성립을 증명하기 위해…". */
  closing: string;
  // 서명란은 여기 없다: 구조가 고정이고 **좌표를 레이아웃 엔진이 소유**하기 때문이다.
  // 필드로 두면 "서명칸 없는 계약서"가 표현 가능해진다 — 지금은 구성상 불가능하다.
};

/** 역대 버전 union (현재 v1 단일). 미래: `ContractDocV1 | ContractDocV2`. */
export type ContractDocAny = ContractDocV1;
/** 현재 정규형. */
export type ContractDoc = ContractDocV1;

/**
 * 관대한 읽기 + 정규 쓰기. 모든 읽기 사이트가 이 함수를 지난다.
 * 미래 버전 홉은 여기 체인으로 넣는다(`if (v < 2) o = upgradeV1toV2(o)`).
 */
export function migrateContractDoc(raw: unknown): ContractDoc {
  const o = (raw ?? {}) as Partial<ContractDocV1>;
  return {
    ...(o as ContractDocV1),
    _v: CONTRACT_DOC_VERSION,
    title: o.title ?? '',
    preamble: o.preamble ?? '',
    clauses: Array.isArray(o.clauses) ? o.clauses : [],
    closing: o.closing ?? '',
  };
}
