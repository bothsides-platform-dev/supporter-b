# 견적(bid) 작성 실시간 검증 피드백 — Design Spec

- **Date**: 2026-06-29
- **Status**: 설계 승인됨 / 스펙 리뷰 대기
- **Scope**: PG 견적 작성 위저드(`components/inbox/bid-wizard/**`) 한정

## 1. 문제 (Problem)

PG가 견적을 제출할 때 "입력이 안 맞아 제출이 안 되는" 상황에서 즉시·구체적인 피드백이 없다. 코드상 두 갈래로 갈린다.

**Mode A — 막힌 보내기 버튼(침묵).**
`BidWizard.tsx`의 검증은 두 개의 boolean뿐이다:

```
canSubmit = !pending && !proposalUploading
            && cycleNum !== '' && parseInt(cycleNum) > 0   // 정산주기
            && anyFeeFilled                                 // 수수료 1칸 이상
```

`견적 보내기` 버튼은 `disabled={!canSubmit}`라 미충족이면 그냥 회색이 되고, **왜·어디가 비었는지 아무 설명이 없다.** `bid-wizard-validation.ts`는 hint 문자열(`'정산 주기를 입력해주세요'`, `'수수료를 1개 이상 입력해주세요'`)을 계산하지만 **어디에도 렌더되지 않는다**(호출부는 `.complete`만 사용). `handleSubmit` 안의 "미충족 단계로 이동" 코드(`getFirstIncompleteBidStep`)는 버튼이 disabled라 **호출될 수 없는 죽은 코드**다.

**Mode B — 범위 밖 값 → 뒤늦은 서버 거부.**
공유 입력 `PercentInput`/`FeeRateCell`은 `NumericFormat`에 `decimalScale`/`allowNegative`만 두고 **상한이 없다.** 그래서 `150`(=150%)을 받아준다. `canSubmit`은 통과(값이 있으니), 사용자는 보내기→확인까지 누르고, 서버 `PaymentFeesSchema`(요율 0~1, 가상계좌 정수 ≤100,000)가 거부 → `INVALID_INPUT` → step4 하단에 작은 일반 문구로만 표시. **어느 필드가 문제인지 안 알려준다.**

## 2. 목표 / 비목표

**목표**
- 입력 오류면 사례를 가리지 않고 **즉시·구체적으로**(어느 필드가 왜) 피드백.
- 보내기가 막히면 **왜·어디가** 비었는지 보이고 그 단계로 데려간다.
- 범위 밖 값은 **애초에 입력되지 않게** 한다.

**비목표 (YAGNI)**
- 구매사 RFP 작성 위저드는 건드리지 않는다(이미 이 패턴 보유).
- 위저드 네비게이션 모델(자유 점프)은 유지한다. 검증 피드백만 더한다.
- 새로운 검증 개념을 만들지 않는다 — 기존 buyer 패턴 재사용.

## 3. 미러할 선례 (Precedent)

구매사 위저드(`RfpCreateWizard` + `RfpStep2Content` + `lib/rfp/required-fields.ts`)가 **동일한 문제를 이미 해결**해 두었다. 이 설계는 그 패턴을 견적 위저드로 포팅하는 것이 본질이다.

선례가 쓰는 메커니즘:
- **SSOT predicate** (`lib/rfp/required-fields.ts`) — 필드 검증 순수함수 + `MarkerState = 'empty' | 'filled' | 'error'` + `markerState({ valid, attempted })`.
- **`attempted` 모델** — 필수 필드는 평소 중립 '필수' 칩, 사용자가 제출/다음을 **시도한 뒤에만** 빨강으로 escalate(`RfpStep2Content`의 `localAttempted || showFieldErrors`).
- **submit이 막지 않고 안내** — `RfpCreateWizard.handleSubmit`은 버튼을 disable하지 않는다. 누른 시점에 `getFirstIncompleteStep`이 있으면 `toast(hint)` + `markFailed(step)` + 그 단계로 이동.
- **`failedSteps: Set<number>` → `failedAt`** — `WizardProgressBar`/`WizardStepSidebar`가 실패 이력 있는 단계에 **빨간 오류 점**(`data-error`)을 찍는다.
- **서버 거부 → 필드 매핑** — `INVALID_WEBSITE` → `markFailed(2)` + step2 이동 + 필드 에러(`websiteRejected`). 그 외 일반 에러만 `serverError`로 표시.
- **입력단 상한** — `RfpStep2Content`의 현재 카드 수수료는 `isAllowed={({ floatValue }) => floatValue === undefined || floatValue <= MAX_FEE_RATE_PCT}`(=100)로 100% 초과 키 입력 자체를 거부. **견적의 공유 입력이 이걸 안 물려받은 게 Mode B의 직접 원인.**

## 4. 설계 (Design)

### 4.1 동작 / UX

1. **보내기 버튼이 침묵하지 않는다.**
   `disabled={!canSubmit}` → `disabled={pending || proposalUploading}`. 즉 **진행 상태만** 버튼을 막고, **입력 미충족은 막지 않는다.** `견적 보내기`를 누르면 `handleSubmit`이 첫 미충족 단계를 찾아 `toast(hint)` + `markFailed(step)` + 그 단계로 이동(현재 죽은 jump 코드를 살리고 toast/markFailed를 추가). `getFirstIncompleteBidStep`은 이미 `{ num, complete, hint }`를 반환하므로 hint를 그대로 쓴다.

2. **정산주기(필수) 인라인 마커 + 에러 — step 1.**
   `BidStepSettlement`의 `DayOffsetInput`(정산 주기)에 `RequiredMark` 칩과 `FieldError`를 단다. 라벨의 임시 `" *"`는 제거하고 칩으로 대체. 평소 중립 '필수', 시도 후 빨강 + `'정산 주기를 입력해주세요'`. 정산한도·보증보험은 필수가 아니므로 마커 없음(현행 유지).

3. **수수료(≥1) 단계-레벨 메시지 — step 2.**
   `BidStepFees` 상단의 `filledUnits/totalUnits` 카운터 옆/아래에, 시도-후-0칸이면 빨간 `FieldError` `'수수료를 1칸 이상 입력해주세요'`. **셀마다 '필수' 칩은 붙이지 않는다**(전부 채울 필요 없음 — 요구는 "1칸 이상").

4. **범위 밖 값은 입력 단계에서 차단(buyer와 동일).**
   - 공유 `PercentInput`·`FeeRateCell`에 `isAllowed` 상한(기본 `max = 100`) 추가 → 100% 초과 키 입력 거부. `MAX_FEE_RATE_PCT`는 buyer가 쓰는 상수를 공용 위치(예: `lib/rfp/...` 또는 inputs 인접)로 끌어와 단일 출처로.
   - 가상계좌(정액, `CurrencyInput`)는 호출부에서 `max = 100_000`을 넘겨 `isAllowed`로 한도 강제.
   - 결과: `150%`·과도 금액이 **폼 상태에 들어오지 못한다** → Mode B의 흔한 경로가 소멸.

5. **그래도 서버가 거부하면 필드/단계로 매핑.**
   `doSubmit` 실패 분기에서 에러코드를 단계로 매핑(§4.4). 매핑되면 `markFailed` + 그 단계로 이동(+ 가능하면 필드 메시지). 매핑 불가한 전역 실패는 기존대로 `submitError`(step4 메시지)로 둔다.

### 4.2 아키텍처 — SSOT (드리프트 불가)

기존 `components/inbox/bid-wizard/bid-wizard-validation.ts`를 **확장**한다(새 모듈 신설 대신 — 이미 SSOT 역할이고 `getFirstIncompleteBidStep`을 export 중).

- 단계 완료(`getBidWizardValidity`), 보내기 게이트(`getFirstIncompleteBidStep`), 필드 마커가 **같은 predicate**에서 파생되도록 한다. 필요한 필드 predicate(예: `isCycleValid(cycleNum)`)를 export하고, 마커/단계점/게이트가 이를 공유.
- `MarkerState`/`markerState`(`lib/rfp/required-fields.ts`), `RequiredMark`, `FieldError`는 **그대로 재사용**(buyer와 공유). 새 시각 컴포넌트 없음.

### 4.3 파일별 변경

| 파일 | 변경 |
|---|---|
| `components/forms/inputs.tsx` | `PercentInput`·`FeeRateCell`에 `max?`(기본 100) + `isAllowed` 상한; 둘 다에 선택적 `markerState?`/`error?` 슬롯(+`FieldError` 렌더). `CurrencyInput`에 선택적 `max?`(→`isAllowed`). `DayOffsetInput`에 선택적 `markerState?`/`error?` 슬롯. **모든 신규 prop은 optional → 기존(buyer) 호출부 무변경.** |
| `bid-wizard-validation.ts` | hint를 실제 소비 가능하게 유지/노출; 필드 단위 predicate(`isCycleValid` 등) export. |
| `bid-wizard-context.tsx` | 컨텍스트에 단계별 attempt 신호 추가(`settlementAttempted`, `feesAttempted` = `failedSteps.has(1|2)`). |
| `BidWizard.tsx` | ① `disabled` 식 교체. ② `failedSteps: Set<number>` state + `failedAt` 배열을 `WizardStepSidebar`/`WizardProgressBar`에 전달(progress bar는 `failedAt` prop 이미 보유; sidebar도 동일 prop 수용). ③ `handleSubmit`에 `toast(hint)` + `markFailed` 추가. ④ `doSubmit` 실패 분기에 서버에러→단계 매핑. ⑤ 컨텍스트에 attempt 신호 공급. |
| `BidStepSettlementContainer.tsx` / `BidStepSettlement.tsx` | 정산주기 `DayOffsetInput`에 `markerState`/`error` 와이어링(`markerState({ valid: isCycleValid(cycleNum), attempted: settlementAttempted })`), 라벨 `" *"` 제거. |
| `BidStepFeesContainer.tsx` / `BidStepFees.tsx` | `feesAttempted`를 받아 0칸일 때 단계-레벨 `FieldError` 표시. |
| `BidStepReview.tsx` | 서버 에러 표시는 유지(매핑 안 되는 전역 실패용). 동작 변화는 거의 없음. |

### 4.4 서버 에러 → 단계 매핑

`BidStepReview`의 `ERROR_LABELS`를 단일 메시지 출처로 유지하되, `doSubmit` 실패 시 코드별로 분기:

| 서버 에러 | 처리 |
|---|---|
| `PAYMENT_METHOD_NOT_REQUESTED` | `markFailed(2)` + step2 이동 (UI상 정상 발생 불가 — 변조/직접호출 안전망) |
| `INVALID_ATTACHMENT` | `markFailed(3)` + step3(견적서) 이동 + 메시지 |
| `INVALID_INPUT` | 클라 검증+isAllowed 도입 후 정상 UI에선 발생 불가 — 폴백으로 step4 일반 메시지 유지(임의 점프 안 함) |
| `RFP_NOT_OPEN` / `BID_ALREADY_SUBMITTED` / `INVITATION_NOT_FOUND` / `RFP_NOT_FOUND` / `FORBIDDEN*` | 필드 문제 아님 → 기존대로 명확한 전역 메시지(step4 유지, 토스트 병행 가능) |

(buyer의 `INVALID_WEBSITE → step2` 미러.)

## 5. 엣지케이스 / 결정

- **타이밍**: 범위 상한은 `isAllowed`라 **키 입력 즉시(진짜 live)** 반영(값이 안 들어옴). 빈 필수값의 빨강 escalate는 **시도 후**(attempted 모델) — 도달도 안 한 칸을 미리 빨갛게 만들지 않기 위함. 필수 상태 자체는 중립 칩으로 항상 보임 → "live 인지 + 시도 후 강조".
- **자유 점프 유지**: `goToStep`/`back`은 그대로 자유 이동. 막는 건 buyer처럼 하지 않는다(범위 밖 변경). `advance`("다음")는 선택적으로 hint를 줄 수 있으나 MVP에선 submit-bounce만으로 충분.
- **`pending`/`proposalUploading`**: 입력 오류가 아니라 진행 상태 → 버튼 비활성 유지(중복 제출/업로드 중 방지).
- **재요청 prefill(`initialBid`)**: 직전 라운드 값으로 시드 → 보통 유효하므로 마커는 'filled'로 시작.
- **샘플 온보딩 흐름**: `samplePhase`/`simulateSampleAward` 경로 불변 — 제출 성공 분기만 사용하므로 영향 없음(회귀 테스트로 고정).

## 6. 테스트 (TDD, RED-first)

**순수 로직(먼저)**
- `bid-wizard-validation` 확장: `isCycleValid`, `getFirstIncompleteBidStep`이 hint 포함 반환, 단계 완료 파생.

**컴포넌트**
- 보내기 버튼이 미충족 상태에서도 **클릭 가능**하고, 누르면 첫 미충족 단계로 이동 + hint 토스트 + 해당 progress dot `data-error="true"`.
- 정산주기 빈 채 시도 → `DayOffsetInput` 마커 'error' + `'정산 주기를 입력해주세요'`.
- 수수료 0칸 채 시도 → step2 단계 메시지 노출.
- `PercentInput`/`FeeRateCell`에 `100` 초과 입력 시 값이 거부됨(isAllowed).
- mock 서버 거부(`INVALID_ATTACHMENT`) → step3 이동 + 메시지; `RFP_NOT_OPEN` → 전역 메시지 유지.

**회귀**
- 기존 `BidWizard.test.tsx`, `BidWizard.sample.test.tsx`, `BidStepFees.test.tsx`, `BidStepSettlement.test.tsx`, `bid-wizard-validation.test.ts` green 유지.
- buyer 호출부(신규 optional prop 미전달) 무변경 확인.

## 7. 범위 밖 (Out of scope)

- 구매사 RFP 작성 위저드 변경.
- 위저드 forward-navigation 차단(자유 점프 유지).
- 서버 스키마/DB 변경 — 없음(DDL 0). 클라 검증을 서버에 맞추는 작업이라 서버는 trust boundary로 그대로 둔다.
