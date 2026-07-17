import {
  MERCHANT_TIERS,
  MERCHANT_TIER_LABELS,
  PAYMENT_METHOD_CATEGORIES,
  PAYMENT_METHOD_LABELS,
  getMethodRate,
  isFlatFeeMethod,
  isTieredMethod,
  type PaymentMethod,
  type TierRates,
} from '@/lib/types/bid';
import { fmtPct } from '@/lib/quote/template-fees';
import { formatKRW } from '@/lib/utils/format';
import type { ContractPartiesV1, ContractTermsSnapshotV1 } from '@/lib/types/contract-doc';
import {
  CONTENT_W,
  COLOR,
  type Sheet,
  type TableCell,
  drawKeyValueRows,
  drawParagraph,
  drawSectionTitle,
  drawTable,
  drawText,
} from './layout';

/**
 * 이 별지가 그리는 **모든 정적 문자열**의 단일 출처.
 *
 * 드로잉은 반드시 이 객체를 거친다 — 리터럴을 인라인하면 코퍼스에서 누락되고,
 * layout 의 `assertDrawable` 가드가 그 자리에서 던진다(공백 렌더 대신 빨간 테스트).
 */
const L = {
  title: '별지 1. 계약 개요',
  docNo: '문서번호',
  docTitle: '계약서 제목',
  sectionParties: '계약 당사자',
  colBuyer: '갑 (구매사)',
  colPg: '을 (결제대행사)',
  rowName: '상호',
  rowRep: '대표자',
  rowBizNo: '사업자등록번호',
  sectionTerms: '견적 조건',
  rfpCode: '견적요청 번호',
  rfpTitle: '견적요청 제목',
  settleCycle: '정산주기',
  settleLimit: '월 정산한도',
  guarantee: '보증보험',
  sectionFees: '결제수단별 수수료',
  colMethod: '결제수단',
  colTier: '구간',
  colRate: '수수료',
  appliedTier: '적용 구간',
  flatPrefix: '건당',
  empty: '-',
  disclaimer:
    '본 개요는 서포트비에 등록된 선정 견적 정보의 요약이며, 계약 본문과 상이한 경우 계약 본문이 우선합니다.',
} as const;

/** 코퍼스 조각 — compose 가 폰트 서브셋 전에 합산한다. */
export const OVERVIEW_STATIC_TEXT: readonly string[] = [
  ...Object.values(L),
  ...Object.values(PAYMENT_METHOD_LABELS),
  ...Object.values(MERCHANT_TIER_LABELS),
];

/** 저장 순서에 의존하지 않는 안정적 표시 순서 — 카테고리 상수를 따른다. */
const METHOD_ORDER: readonly PaymentMethod[] = PAYMENT_METHOD_CATEGORIES.flatMap((c) => c.methods);

/**
 * 한 결제수단이 차지하는 표 행들. 단위 분기는 값의 모양이 아니라 **수단 상수**로
 * 판별한다(lib/types/bid.ts 의 계약):
 *  · 정액 수단        → `건당 300원`
 *  · number 값        → 구간 미적용 단일 정률 `3.5%`
 *  · 구간맵(object)   → 값이 있는 구간만 한 줄씩. buyerTier 행은 semibold + `적용 구간` 병기.
 */
function methodRows(
  method: PaymentMethod,
  value: number | TierRates,
  buyerTier: ContractTermsSnapshotV1['buyerTier'],
): TableCell[][] {
  const label = PAYMENT_METHOD_LABELS[method];

  if (isFlatFeeMethod(method) || typeof value === 'number') {
    const rate =
      isFlatFeeMethod(method) && typeof value === 'number'
        ? `${L.flatPrefix} ${formatKRW(value)}`
        : `${fmtPct(getMethodRate(value, 'general') ?? 0)}%`;
    return [[{ text: label }, { text: L.empty, color: COLOR.label }, { text: rate }]];
  }

  const tiers = MERCHANT_TIERS.filter((t) => getMethodRate(value, t) !== undefined);
  return tiers.map((tier, i) => {
    const applied = isTieredMethod(method) && buyerTier === tier;
    return [
      { text: i === 0 ? label : '' },
      {
        text: applied ? `${MERCHANT_TIER_LABELS[tier]} · ${L.appliedTier}` : MERCHANT_TIER_LABELS[tier],
        bold: applied,
        color: applied ? COLOR.value : COLOR.label,
      },
      { text: `${fmtPct(getMethodRate(value, tier) ?? 0)}%`, bold: applied },
    ];
  });
}

export type OverviewSheetArgs = {
  docCode: string;
  title: string;
  parties: ContractPartiesV1;
  terms: ContractTermsSnapshotV1;
};

/** [별지1] 계약 개요 — 선정 견적 조건 스냅샷의 사람이 읽는 면. */
export function drawOverviewSheet(s: Sheet, args: OverviewSheetArgs): void {
  const { docCode, title, parties, terms } = args;

  drawText(s, L.title, { size: 16, bold: true });
  s.y -= 26;
  drawKeyValueRows(s, [
    { label: L.docNo, value: docCode },
    { label: L.docTitle, value: title },
  ]);
  s.y -= 10;

  // ── 당사자 ──
  drawSectionTitle(s, L.sectionParties);
  const partyCols = [120, (CONTENT_W - 120) / 2, (CONTENT_W - 120) / 2];
  drawTable(s, partyCols, [
    [
      { text: '' },
      { text: L.colBuyer, bold: true },
      { text: L.colPg, bold: true },
    ],
    [
      { text: L.rowName, color: COLOR.label },
      { text: parties.buyer.name },
      { text: parties.pg.name },
    ],
    [
      { text: L.rowRep, color: COLOR.label },
      { text: parties.buyer.repName },
      { text: parties.pg.repName },
    ],
    [
      { text: L.rowBizNo, color: COLOR.label },
      { text: parties.buyer.bizNo ?? L.empty },
      { text: parties.pg.bizNo ?? L.empty },
    ],
  ]);
  s.y -= 12;

  // ── 견적 조건 ──
  drawSectionTitle(s, L.sectionTerms);
  drawKeyValueRows(s, [
    { label: L.rfpCode, value: terms.rfpCode },
    { label: L.rfpTitle, value: terms.rfpTitle },
    { label: L.settleCycle, value: terms.settleCycle },
    { label: L.settleLimit, value: formatKRW(terms.settleLimit) },
    { label: L.guarantee, value: formatKRW(terms.guaranteeInsurance) },
  ]);
  s.y -= 12;

  // ── 결제수단별 수수료 ──
  drawSectionTitle(s, L.sectionFees);
  const feeCols = [180, 150, CONTENT_W - 330];
  const feeRows: TableCell[][] = [
    [
      { text: L.colMethod, bold: true },
      { text: L.colTier, bold: true },
      { text: L.colRate, bold: true },
    ],
  ];
  for (const method of METHOD_ORDER) {
    const value = terms.paymentFees[method];
    if (value === undefined) continue;
    feeRows.push(...methodRows(method, value, terms.buyerTier));
  }
  // 커스텀 수단 — id→label 매핑은 스냅샷 안에서만 성립하므로 여기서 해소한다.
  for (const custom of terms.customPaymentMethods) {
    const rate = terms.customFees[custom.id];
    if (rate === undefined) continue;
    feeRows.push([
      { text: custom.label },
      { text: L.empty, color: COLOR.label },
      { text: `${fmtPct(rate)}%` },
    ]);
  }
  drawTable(s, feeCols, feeRows);

  s.y -= 10;
  drawParagraph(s, L.disclaimer, { size: 8, color: COLOR.label });
}
