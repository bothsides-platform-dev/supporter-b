# PG 견적 — 카드·간편결제 구간별(영세/중소/일반) 수수료 제안 설계

**작성일**: 2026-06-09
**상태**: 설계 확정 (구현 전)

## 배경 / 목적

PG(결제대행사 영업담당)가 견적을 작성할 때, 지금은 결제수단마다 **단일 요율** 하나만 입력한다(`BidStepFees`의 평평한 2열 그리드 → `bids.paymentFees: { card: 0.0125, ... }`).

현실의 카드·간편결제 수수료는 **여신금융협회 영세·중소가맹점 우대수수료 구간**(영세 / 중소1 / 중소2 / 중소3 / 일반)에 따라 가맹점 규모별로 차등 적용된다. 구매사는 플랫폼/프랜차이즈처럼 여러 규모의 하위 가맹점을 온보딩하거나 관행상 표준 우대수수료표 전체를 받기를 원하므로, PG는 **5구간 전체 요율표**를 제안해야 한다.

이 스펙은 **카드 카테고리와 간편결제 카테고리를 묶어 5구간 매트릭스로 입력**받고, 계좌·기타 카테고리는 기존 단일요율을 유지하며, 구매사 쪽 상세·비교·견적 템플릿까지 구간을 반영하는 변경을 정의한다.

## 확정 결정 (브레인스토밍 합의)

1. **구간 = 고정 상수 5종**: 영세 / 중소1 / 중소2 / 중소3 / 일반. 구매사·PG 모두 변경 불가.
2. **구간 적용 카테고리 = 카드 + 간편결제** (`PAYMENT_METHOD_CATEGORIES`의 `카드`·`간편결제`). 계좌·기타는 **단일요율 유지**(구간 없음).
3. **세분화 단위 = 수단별 매트릭스**: 요청된 카드/간편결제 수단마다 5구간 행. (카테고리 묶음 단일행이 아님 — 수단별 요율 차이를 담는다.)
4. **구매사 범위 = 5구간 전체 요율표**: 단일 구간만 보는 게 아니라 전 구간을 받고/보여준다.
5. **저장 형태 = Approach A**: `paymentFees` 값 타입을 `number | TierRates` union으로. 구간 수단이면 구간맵, 아니면 number. "구간 수단인지"는 **카테고리 상수로 판별**(값 모양으로 판별하지 않음). **DDL 변경 없음**(JSONB 그대로), 구버전 데이터는 관대한 접근자로 호환.
6. **입력 보조 없음**: "전 구간 동일" 빠른채움 등 편의기능은 넣지 않는다(YAGNI). 순수 매트릭스.
7. **빈 칸/부분 제출 허용**: 기존 "1칸 이상 채우면 발송" 규칙 유지. 구간 일부만 채워도 됨.
8. **구매사 RFP 작성 화면은 변경 없음**: 구간은 카드/간편결제에 자동 적용되므로 별도 요청 항목이 아니다.

## 데이터 모델

`lib/types/bid.ts`:

```ts
export const MERCHANT_TIERS = ['sole', 'sme1', 'sme2', 'sme3', 'general'] as const;
export type MerchantTier = (typeof MERCHANT_TIERS)[number];
export const MERCHANT_TIER_LABELS: Record<MerchantTier, string> = {
  sole: '영세', sme1: '중소1', sme2: '중소2', sme3: '중소3', general: '일반',
};

// 소수 요율의 구간맵 (부분 허용)
export type TierRates = Partial<Record<MerchantTier, number>>;

// 구간이 적용되는 카테고리 라벨 (PAYMENT_METHOD_CATEGORIES.label 기준)
export const TIERED_CATEGORY_LABELS = ['카드', '간편결제'] as const;

// 카테고리 상수로만 판별 — 값의 모양에 의존하지 않는다
export function isTieredMethod(m: PaymentMethod): boolean;

// 관대한 접근자: value가 number면 구버전 단일요율로 해석(전 구간 동일값처럼 취급)
export function getMethodRate(
  value: number | TierRates | undefined,
  tier: MerchantTier,
): number | undefined;
```

`Bid` 타입 변경:

```ts
// before: paymentFees: Partial<Record<PaymentMethod, number>>;
paymentFees: Partial<Record<PaymentMethod, number | TierRates>>;
// customFees는 그대로 단일요율 Record<string, number>
```

- **DB**: `bids.payment_fees` JSONB 그대로. 구간 수단은 `{ card: { sole: 0.005, sme1: 0.01, ..., general: 0.018 } }`, 단일 수단은 `{ virtual_account: 0.005 }`. DDL/마이그레이션 없음.
- **하위호환**: 기존 bid의 `{ card: 0.0125 }`(number)는 `getMethodRate`가 구간 무관 단일값으로 해석. 읽기 사이트는 항상 `getMethodRate`를 거친다.

## PG 입력 (inbox/bid-wizard)

### `useBidDraft.ts`
- `BidDraft.fees: Record<string, string>` 구조 유지. 단, **복합 키** 사용:
  - 구간 수단: `"card:sole"`, `"card:sme1"`, … `"naver_pay:general"`
  - 단일 수단/커스텀: `"virtual_account"`, `"<customId>"` (기존 그대로)
- `BidDraft.__v` 2 → **3** 범프. 구버전(`__v !== 3`) draft는 `readDraft`에서 폐기(기존 가드 패턴 그대로).

### `BidStepFees.tsx`
- 요청수단(`feeInputMethods`)을 카테고리로 분류:
  - **카드 그룹 매트릭스**: 요청된 카드 카테고리 수단(카드/해외카드) × 5구간
  - **간편결제 그룹 매트릭스**: 요청된 간편결제 수단(네이버/카카오/토스) × 5구간
  - **계좌·기타 + 커스텀**: 기존 단일 `PercentInput`
- 매트릭스 셀은 `PercentInput`, `value={fees['card:sole'] ?? ''}`, `onChange→onFee('card:sole', v)`
- 진행 카운터(`fees-count`): "1칸 이상 채우면 발송" 기준 그대로(구간 셀·단일 입력 통합 카운트). 정확한 카운트 표기는 구현 시 결정(가짜 정밀도 피함).

### `BidWizard.tsx`
- `buildPaymentFees(): Partial<Record<PaymentMethod, number | TierRates>>`
  - 구간 수단: 복합 키들을 모아 `TierRates` 맵 조립(채워진 구간만 포함). 맵이 비면 해당 수단 생략.
  - 단일 수단: 기존대로 `number`.
- `anyFeeFilled`: 구간 셀 또는 단일 입력 중 하나라도 유효값(`>= 0`)이면 true.
- `applyTemplate`: 템플릿의 `number | TierRates`를 복합 키/단일 키로 역전개.

### `BidStepReview.tsx` (검토 단계)
- 발송 전 검토 요약에서 구간 수단은 **압축 매트릭스**(또는 수단별 "영세~일반" 한 줄 요약)로, 단일 수단은 기존 `라벨 N%` 행으로 표시. 값은 `getMethodRate` 경유.

## 서버

### `lib/server/services/bid.ts`
- `SubmitBidServiceInput.paymentFees: Record<string, number | TierRates>`
- "요청되지 않은 결제수단 거부" 검증 유지 — 값이 맵이든 number든 **키(수단)** 기준으로 검사.

### `lib/server/actions/bid` (submit) + zod
- `PaymentFeesSchema`를 union 허용으로 확장: 각 값이 `number` **또는** `MerchantTier 부분맵(number)`.
- 구간 수단인데 number가 와도(구버전 클라/템플릿) 거부하지 않고 허용(접근자가 호환).

### `lib/server/repositories/drizzle/bid.ts`
- JSONB 저장/투영 그대로. 타입 시그니처만 `number | TierRates` 반영. (BID_COLUMNS 명시 투영 유지.)

### `lib/server/rfp-detail-loader.ts`
- bid 타입이 흘러가므로 타입만 갱신. 화이트리스트/실데이터 로직 변경 없음.

## 구매사 화면

### 견적 상세 (`RfpDetailContent` / `components/rfp/bid-detail/*`)
- 구간 수단: **5×N 읽기전용 매트릭스**(행=수단, 열=영세…일반), 값은 `getMethodRate`로 표시. 미입력 구간은 `—`.
- 단일 수단/커스텀: 기존 단일행 유지.
- 모든 수치 `.md-numeric`.

### 제안 비교 (`comparison/FocusComparison` + `MetricComparePopover` + `ImprovementSummary`)
- **구간 셀렉터** 추가: 세그먼트 컨트롤(영세/중소1/중소2/중소3/일반), 기본값 `일반`(general).
- 선택 구간 기준으로:
  - 수단별 metric row의 `getValue`가 `getMethodRate(bid.paymentFees[m], selectedTier)` 반환.
  - 정렬 키(현재 `paymentFees.card`)도 선택 구간의 카드 요율 사용.
  - peek/요약 행 동일.
- 계좌/기타 단일 수단은 구간 셀렉터와 무관하게 항상 같은 값 표시.

## 견적 템플릿

- `QuoteTemplateOption.paymentFees: Partial<Record<PaymentMethod, number | TierRates>>`
- `saveQuoteTemplateAction` 스키마: 위 `PaymentFeesSchema`와 동일 union.
- `repositories/drizzle/bid-quote-template.ts`: JSONB 그대로, 타입만.
- `components/settings/QuoteTemplatesPanel.tsx`: 템플릿 미리보기에서 구간 수단은 대표값(`일반`) 또는 "구간별" 뱃지 표기(구현 시 단순화).
- `BidWizard.applyTemplate`: 위 역전개 로직으로 매트릭스 채움.

## 테스트 계획 (TDD — RED 먼저)

단위(Vitest):
1. `lib/types/bid` — `isTieredMethod`(카드/간편결제 true, 계좌/기타 false), `getMethodRate`(맵·number·undefined·미입력 구간 호환).
2. `buildPaymentFees` 조립 — 복합 키 → `TierRates`, 부분 구간, 빈 맵 생략, 단일 수단 number.
3. `BidStepFees` — 요청수단별 매트릭스/단일입력 렌더, 셀 입력 반영, 요청 안 된 수단 미표시.
4. `bid-wizard-validation` / `anyFeeFilled` — 구간 셀 하나만 채워도 발송 가능.
5. `services/bid` submit — `number | TierRates` 저장, 요청외 수단 거부(맵 케이스 포함).
6. zod `PaymentFeesSchema` — union 수용·악성 입력 거부.
7. `FocusComparison` — 구간 셀렉터 전환 시 값/정렬 변화, 구버전 number bid 호환, 단일 수단 불변.
8. 견적 템플릿 저장→적용 라운드트립(구간 보존).

면제: `app/**/page.tsx` 단순 조립, 순수 타입 상수 파일.

## 비범위 (이번 스펙 밖)

- 구간 경계(연매출 기준액) 표기/툴팁 — 라벨만 노출, 금액 안내는 추후.
- 구간별 거래액 가중 비교(어느 구간이 구매사에 실제로 적용되는지 산정) — 비교는 셀렉터 수동 전환까지만.
- 카드사별 세분 요율(현재 모델은 `card`/`overseas_card` 단위 유지).

## 블래스트 레이디어스 요약

| 영역 | 파일 | 변경 성격 |
|---|---|---|
| 타입/도메인 | `lib/types/bid.ts` | 상수·타입·접근자 추가, `Bid.paymentFees` union |
| PG 입력 | `useBidDraft.ts`, `BidStepFees.tsx`, `BidWizard.tsx`, `bid-wizard-validation.ts`, `BidStepReview.tsx` | 매트릭스 입력·조립·검증·검토표시 |
| 서버 | `services/bid.ts`, `actions/bid/*`(zod), `repositories/drizzle/bid.ts`, `rfp-detail-loader.ts` | union 타입·검증 |
| 구매사 | `RfpDetailContent.tsx`, `bid-detail/*`, `comparison/{FocusComparison,MetricComparePopover,ImprovementSummary}.tsx` | 매트릭스 표시·구간 셀렉터 |
| 템플릿 | `saveQuoteTemplateAction.ts`, `bid-quote-template.ts`, `QuoteTemplatesPanel.tsx` | union 타입 |
| DB | — | **변경 없음** (JSONB 그대로, 마이그레이션 불필요) |
