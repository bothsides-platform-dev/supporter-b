// `ContractDoc` 텍스트 순회 — **단일 출처**.
//
// 왜 한 곳인가: 이 문서의 텍스트를 훑는 코드가 v0.4.57.0 시점에 넷으로 흩어져 있었고,
// 그 릴리스가 고친 결함 **둘 다** "순회가 어떤 필드를 빠뜨렸다" 였다.
//   · 조항 제목의 `{{토큰}}` 이 어떤 게이트도 만나지 못해 **그대로 인쇄된 채 서명**됐다.
//   · 수수료 표 라벨(구매사 자유 입력)이 글리프 검사를 안 지나 **서명된 계약서에 빈칸**이
//     남을 수 있었다.
// 순회가 흩어져 있는 한 v2 에서 필드를 하나 더할 때 같은 종류의 구멍이 또 난다. 그래서
// 필드 목록을 아는 곳을 여기 하나로 모은다.
//
// **모양이 둘이라는 것이 핵심이다** — 하나로 뭉개면 아래 비대칭이 조용히 붕괴한다:
//   ① 스캔(토큰 검사) — 조항 제목을 **포함**하되 `substituted:false` 로 가른다.
//   ② 치환 — 조항 제목을 **제외**한다(목차가 딜마다 달라지면 조항을 특정할 수 없다).
// 제목은 치환되지 않으므로 거기 쓴 토큰은 등록돼 있어도 그대로 인쇄된다. 그래서 스캔은
// 제목을 보고, 치환은 제목을 건드리지 않는다.

import type { ContractDoc, ContractClause } from '@/lib/types/contract-doc';
import type { ContractParty } from './layout';
import type { FeeTableRow } from './fee-table';

export type DocTextPart = {
  text: string;
  /** 이 자리의 토큰이 딜 값으로 치환되는가. `false` = 조항 제목(위 ② 참조). */
  substituted: boolean;
};

/** 치환 대상 필드(제목 제외) — 스캔과 치환이 같은 목록에서 파생하기 위한 공통부. */
function clauseTextParts(clause: ContractClause): string[] {
  return clause.kind === 'text' ? [clause.body] : [clause.intro, clause.outro];
}

/**
 * 토큰이 등장할 수 있는 모든 자리를 **문서 순서대로** 훑는다.
 *
 * 순서가 유의미하다 — `collectUnknownTokens` 가 "등장 순서대로" 보고한다고 약속한다.
 */
export function contractDocTokenSources(doc: ContractDoc): DocTextPart[] {
  const parts: DocTextPart[] = [
    { text: doc.title, substituted: true },
    { text: doc.preamble, substituted: true },
  ];
  for (const clause of doc.clauses) {
    parts.push({ text: clause.heading, substituted: false });
    for (const text of clauseTextParts(clause)) parts.push({ text, substituted: true });
  }
  parts.push({ text: doc.closing, substituted: true });
  return parts;
}

/**
 * 치환 대상 텍스트에 `sub` 를 적용한 **새 문서**를 돌려준다(원본 불변).
 *
 * 미리보기(자리표시자)와 발송(딜 값)이 `sub` 만 바꿔 이 함수를 공유한다 — 둘이 각자
 * 순회를 들면 한쪽에만 필드가 추가돼 "미리보기에는 들어가는데 발송에는 안 들어가는"
 * 값이 생긴다.
 */
export function mapContractDocText(
  doc: ContractDoc,
  sub: (text: string) => string,
): ContractDoc {
  return {
    ...doc,
    title: sub(doc.title),
    preamble: sub(doc.preamble),
    closing: sub(doc.closing),
    clauses: doc.clauses.map((clause) =>
      clause.kind === 'text'
        ? { ...clause, body: sub(clause.body) }
        : { ...clause, intro: sub(clause.intro), outro: sub(clause.outro) },
    ),
  };
}

/**
 * **PDF 에 그려지는 모든 텍스트**를 평평한 문자열로 — 글리프 커버리지 검사의 입력.
 *
 * 경계를 `layoutContract` 의 입력(`{ doc, feeRows, parties }`)과 같게 잡은 것이 요점이다:
 * "레이아웃이 그릴 것"과 "검사할 것"이 같은 목록에서 나오면 둘이 어긋날 수 없다.
 *
 * 저장 시점에는 딜이 없어 `doc` 만 넘긴다(수수료 표·당사자는 발송 시점에야 정해진다).
 * 발송 시점에는 셋 다 넘겨야 한다 — 구매사 상호와 커스텀 결제수단 라벨은 **구매사가
 * 자유 입력**한 값이고 Pretendard 는 한자를 담지 않는다. 빠뜨리면 보내는 PG 가 고칠
 * 수도 없는 빈칸이 서명된 계약서에 남는다.
 */
export function collectDrawableText(input: {
  doc: ContractDoc;
  feeRows?: FeeTableRow[];
  parties?: { buyer: ContractParty; pg: ContractParty };
}): string {
  const parts = contractDocTokenSources(input.doc).map((p) => p.text);
  for (const party of [input.parties?.buyer, input.parties?.pg]) {
    if (!party) continue;
    parts.push(party.company);
    if (party.bizNo) parts.push(party.bizNo);
  }
  for (const row of input.feeRows ?? []) parts.push(row.label, row.value);
  return parts.join('\n');
}
