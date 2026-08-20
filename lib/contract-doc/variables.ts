// 조항 본문의 `{{토큰}}` → 낙찰 딜 값 치환. 토큰 어휘의 **단일 출처**.
//
// 편집기 삽입 메뉴 · 저장 검증 · 발송 시 해석이 전부 `CONTRACT_VARIABLES` 에서
// 파생한다. 세 곳이 각자 목록을 들면 "편집기에는 있는데 해석기가 모르는 토큰"이
// 생기고, 그건 곧 `{{...}}` 가 인쇄된 계약서다.
//
// ## v1 이 담는 토큰의 기준: **항상 해석되는 값만**
//
// 대표자·주소는 우리 스키마 어디에도 없고(`workspaces`·`biz_profiles` 확인),
// 사업자등록번호도 nullable 이다. 그런 값을 본문 토큰으로 열어 두면 해석 실패가
// 곧 발송 차단이 되는데, PG 는 구매사 프로필을 고칠 수 없어 **스스로 풀 수 없는
// 데드엔드**가 된다(본인인증 전화번호 차단과 같은 모양).
//
// 그래서 그 값들은 본문이 아니라 **서명란**에서 다룬다 — 레이아웃이 고정 구조로
// 그리고, 값이 없으면 그 자리에 공급자 `text` 서명칸을 배정해 서명 화면에서
// 당사자가 직접 채우게 한다(업계 표준 signer-filled field). 여기 있는 토큰은
// 전부 NOT NULL 컬럼에서 오므로 해석이 실패할 수 없다.
//
// 결제수단별 수수료도 본문 토큰으로 두지 않는다 — 요율이 `결제수단 × 가맹점 등급`
// 행렬이라(`Bid.paymentFees` 는 `number | TierRates`) 한 줄 문장으로 정직하게
// 표현되지 않는다. 그건 `feeTable` 조항이 표로 그린다.

import { formatInTimeZone } from 'date-fns-tz';
import { formatKRW } from '@/lib/utils/format';
import type { ContractDoc } from '@/lib/types/contract-doc';
import { contractDocTokenSources, mapContractDocText } from './doc-text';

const KST = 'Asia/Seoul';

/** 발송 시 해석에 필요한 입력. 전부 NOT NULL 출처라 옵셔널이 없다. */
export type ContractVariableContext = {
  /** buyer `workspaces.name`. */
  buyerCompany: string;
  /** PG `workspaces.name`. */
  pgCompany: string;
  /** 발송 시각 — 계약일로 인쇄한다. */
  contractDate: Date;
  /** `bids.settle_cycle` 자유 텍스트("D+3"). */
  settleCycle: string;
  settleLimit: number;
  guaranteeInsurance: number;
  signupFee: number;
};

type VariableMeta = {
  /** 편집기 삽입 메뉴 표기. */
  label: string;
  resolve: (ctx: ContractVariableContext) => string;
};

export const CONTRACT_VARIABLES = {
  '구매사.상호': {
    label: '구매사 상호',
    resolve: (c) => c.buyerCompany,
  },
  'PG사.상호': {
    label: 'PG사 상호',
    resolve: (c) => c.pgCompany,
  },
  '계약일': {
    label: '계약일',
    // 한국 시간 기준 — UTC 로 포맷하면 자정 근처 발송이 하루 밀린다.
    resolve: (c) => formatInTimeZone(c.contractDate, KST, 'yyyy년 M월 d일'),
  },
  '정산주기': {
    label: '정산주기',
    resolve: (c) => c.settleCycle,
  },
  '정산한도': {
    label: '월 정산한도',
    resolve: (c) => formatKRW(c.settleLimit),
  },
  '보증보험': {
    label: '보증보험',
    resolve: (c) => formatKRW(c.guaranteeInsurance),
  },
  '가입비': {
    label: '가입비',
    resolve: (c) => formatKRW(c.signupFee),
  },
} satisfies Record<string, VariableMeta>;

export type ContractVariableToken = keyof typeof CONTRACT_VARIABLES;

// 중첩 중괄호는 허용하지 않는다 — `{{a{{b}}c}}` 같은 입력이 애매하게 파싱되면
// 무엇이 치환됐는지 사람이 예측할 수 없다.
const TOKEN_RE = /\{\{([^{}]*)\}\}/g;

function isKnown(token: string): token is ContractVariableToken {
  return Object.prototype.hasOwnProperty.call(CONTRACT_VARIABLES, token);
}

// 순회는 `doc-text.ts` 가 단일 출처다 — 스캔(제목 포함 + 플래그)과 치환(제목 제외)의
// 비대칭이 왜 존재하는지도 그 파일에 적혀 있다.

/**
 * 등록되지 않은 토큰을 **등장 순서대로, 중복 없이** 돌려준다.
 *
 * 저장 시점 게이트다. 오타 토큰(`{{구매사.상후}}`)이 그대로 인쇄된 계약서가
 * 서명되면 되돌릴 수 없으므로, 저장을 막고 문제 토큰을 사용자에게 보여준다.
 */
export function collectUnknownTokens(doc: ContractDoc): string[] {
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const { text, substituted } of contractDocTokenSources(doc)) {
    for (const match of text.matchAll(TOKEN_RE)) {
      const token = match[1];
      // 치환되지 않는 자리(조항 제목)의 토큰은 등록돼 있어도 그대로 인쇄되므로 거부한다.
      if ((substituted && isKnown(token)) || seen.has(token)) continue;
      seen.add(token);
      unknown.push(token);
    }
  }
  return unknown;
}

export type ResolveContractDocResult =
  | { ok: true; doc: ContractDoc }
  | { ok: false; unknownTokens: string[] };

/**
 * **미리보기 전용** 해석 — 딜 값 대신 눈에 띄는 자리표시자를 넣는다.
 *
 * 편집 시점에는 딜이 없다(`rfp`/`bid` 가 존재하지 않는다). 그렇다고 토큰을 그대로
 * 두면 미리보기에 `{{구매사.상호}}` 가 찍혀 "이대로 나가나?" 싶고, 빈 문자열로
 * 지우면 문장이 무너져 조판을 판단할 수 없다. 라벨을 괄호로 감싸 **자리라는 것이
 * 보이게** 한다.
 *
 * ⚠️ 실제 값은 길이가 달라 **줄 수·쪽 나눔이 달라질 수 있다.** 화면이 그 사실을
 * 함께 알려야 사용자가 미리보기를 최종본으로 오해하지 않는다.
 */
export function previewContractDoc(doc: ContractDoc): ResolveContractDocResult {
  const unknownTokens = collectUnknownTokens(doc);
  if (unknownTokens.length > 0) return { ok: false, unknownTokens };

  const sub = (text: string): string =>
    text.replace(TOKEN_RE, (whole, token: string) =>
      isKnown(token) ? `〔${CONTRACT_VARIABLES[token].label}〕` : whole,
    );

  return { ok: true, doc: mapContractDocText(doc, sub) };
}

/**
 * 문서의 모든 토큰을 딜 값으로 치환한 **새 문서**를 돌려준다(원본 불변).
 *
 * 미등록 토큰이 하나라도 있으면 **아무것도 치환하지 않고 거부한다** — 저장 검증을
 * 우회해 들어온 문서(이 기능 이전 행·직접 호출)가 `{{오타}}` 를 인쇄한 채 발송되는
 * 것을 막는 심층 방어다. 부분 치환은 더 나쁘다: 어디까지 해석됐는지 알 수 없는
 * 계약서가 나간다.
 */
export function resolveContractDoc(
  doc: ContractDoc,
  ctx: ContractVariableContext,
): ResolveContractDocResult {
  const unknownTokens = collectUnknownTokens(doc);
  if (unknownTokens.length > 0) return { ok: false, unknownTokens };

  const sub = (text: string): string =>
    text.replace(TOKEN_RE, (whole, token: string) =>
      isKnown(token) ? CONTRACT_VARIABLES[token].resolve(ctx) : whole,
    );

  return { ok: true, doc: mapContractDocText(doc, sub) };
}
