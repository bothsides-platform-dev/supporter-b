# RFP "배송 및 서비스 기간" 필드 추가

Date: 2026-06-05

## 개요

RFP 작성 폼(Step 2)에 "배송 및 서비스 기간" 텍스트 입력 필드를 추가한다.
PG사가 거래 리스크를 평가할 때 활용하는 정보이며, `현재 정산주기` 바로 아래에 위치한다.
필드 옆에는 `NDX` 용어 설명 InfoTip을 붙이고, 용어집(`lib/glossary.ts`)에 새 항목을 등록한다.

## 변경 파일 목록

| 파일 | 변경 내용 |
|---|---|
| `lib/db/schema/rfps.ts` | `delivery_service_period text` nullable 컬럼 추가 |
| `lib/types/rfp.ts` | `deliveryServicePeriod?: string` 추가 |
| `lib/stores/rfp-draft.ts` | 필드 추가, version 2→3 bump, migrate v<3 백필, partialize 포함 |
| `components/rfp/RfpStep2Content.tsx` | `currentSettlementCycle` 블록 바로 아래 입력 필드 + `<InfoTip term="NDX" />` |
| `lib/server/actions/rfp/createRfpAction.ts` | zod Input에 `deliveryServicePeriod` 추가, `rfps` insert에 포함 |
| `components/inbox/RfpBriefPanel.tsx` | "사업 운영 정보" 목록에 `['배송 및 서비스 기간', rfp.deliveryServicePeriod]` 추가 |
| `lib/glossary.ts` | `NDX` 신규 항목 추가 |

## 세부 설계

### DB 스키마

```ts
deliveryServicePeriod: text('delivery_service_period'),
```

nullable, 서버 default 없음 — 기존 모든 `current_*` 필드와 동일한 패턴.

### RFP 타입

```ts
deliveryServicePeriod?: string;
```

### Zustand 스토어

- `RfpDraftStore` 타입에 `deliveryServicePeriod: string` 추가
- `defaultState`에 `deliveryServicePeriod: ''` 추가
- `version` 2 → 3 bump
- `migrate` — `version < 3` 분기에서 `deliveryServicePeriod: state.deliveryServicePeriod ?? ''` 백필
- `partialize`에 포함

### 폼 (RfpStep2Content)

`현재 정산주기` 블록(`currentSettlementCycle`) 바로 아래에 동일한 구조로 추가:

```tsx
<div className="space-y-1">
  <div className="flex items-center gap-1">
    <Label size="md" muted={false}>배송 및 서비스 기간</Label>
    <InfoTip term="NDX" />
  </div>
  <input
    type="text"
    value={draft.deliveryServicePeriod}
    onChange={(e) => draft.setField('deliveryServicePeriod', e.target.value)}
    placeholder="D+3"
    className={underlineInputClass}
  />
</div>
```

### Server Action (createRfpAction)

zod `Input` 스키마에 추가:
```ts
deliveryServicePeriod: z.string().max(100).optional(),
```

`rfps.insert` 값 객체에 추가:
```ts
deliveryServicePeriod: parsed.data.deliveryServicePeriod?.trim() ?? null,
```

### PG 브리프 패널 (RfpBriefPanel)

`사업 운영 정보` 섹션의 노출 조건 배열 및 행 목록에 추가:

```ts
// 노출 조건 (.some(Boolean) 체크)
rfp.deliveryServicePeriod

// 행 목록
['배송 및 서비스 기간', rfp.deliveryServicePeriod],
```

### 용어집

```ts
NDX: {
  label: '배송 및 서비스 기간',
  description:
    '결제 후 실제 배송이나 서비스 제공까지 걸리는 기간이에요. D+1은 다음 영업일 배송, D+7은 최대 7일 처리를 뜻해요. PG는 이 기간을 리스크 평가에 참고해요.',
},
```

## 테스트 전략

기존 `currentSettlementCycle` 테스트 패턴을 그대로 확장:

- `components/rfp/__tests__/RfpStep2Content.test.tsx` — 필드 렌더 + 값 변경 반영 확인
- `components/inbox/__tests__/RfpBriefPanel.test.tsx` — 값 있을 때 행 노출, 없을 때 숨김 확인
- `lib/server/actions/rfp/__tests__/create.test.ts` — `deliveryServicePeriod` 전달 시 DB에 저장, 미전달 시 null 저장 확인

## 확정 결정

- DB 컬럼명: `delivery_service_period` (snake_case)
- TS 키: `deliveryServicePeriod` (camelCase)
- 용어집 키: `NDX`
- 폼 위치: `현재 정산주기` 바로 아래
- placeholder: `D+3`
- 최대 길이: 100자 (zod)
- 필수 여부: 선택 입력
