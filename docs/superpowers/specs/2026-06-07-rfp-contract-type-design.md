# RFP 계약 유형(신규/갱신) 선택 기능 설계

**작성일**: 2026-06-07  
**상태**: 승인됨

---

## Context

구매사가 견적 요청(RFP)을 보낼 때 해당 건이 신규 계약인지 기존 계약 갱신인지 표시할 수 없었다. PG사 영업담당자 입장에서는 동일한 견적 요청이라도 신규 수주와 갱신 유지는 영업 전략이 달라지므로, 이 맥락을 인박스·보드에서 즉시 파악하는 것이 중요하다.

---

## 요구사항 확정 사항

- 구매사는 RFP 작성 위저드 Step 2에서 "신규 계약" / "갱신 계약" 중 선택 가능
- 선택은 **선택사항** (미선택 시 null — 유형 미표시)
- 현재 PG사 이름 등 추가 입력 없음 — 단순 레이블
- PG 화면 3곳 전면 노출: 오픈 보드 카드 / 인박스 목록 / RFP 상세

---

## 데이터 모델

### 새 enum

```typescript
// lib/db/schema/_enums.ts
export const contractTypeEnum = pgEnum('contract_type', ['new', 'renewal']);
```

### rfps 테이블 컬럼 추가

```typescript
// lib/db/schema/rfps.ts
contractType: contractTypeEnum('contract_type'),  // nullable
```

기존 데이터 영향 없음 (nullable additive 컬럼). DB 반영: `drizzle-kit push`.

### TypeScript 타입 변경

```typescript
// lib/types/rfp.ts  (Rfp 인터페이스)
contractType?: 'new' | 'renewal' | null;
```

---

## 구매사 위저드 — Step 2

**파일**: `components/rfp/RfpStep2Content.tsx`

Step 2 "견적 내용" 폼 최상단에 세그먼트 토글 추가. 기존 `제목 *` 필드 위.

```
견적 유형  (선택)
┌──────────────┐  ┌──────────────┐
│  신규 계약   │  │  갱신 계약   │
└──────────────┘  └──────────────┘
```

- 선택된 버튼을 재클릭하면 선택 해제 (null 복귀)
- 스타일: Linear 토글 그룹 — `shape-small` 6px radius, 1px border, selected 시 배경 강조
- `@base-ui/react` 없이 `<button>` 그룹으로 직접 구현 (Toggle Group 패턴)

### Draft Store

```typescript
// lib/stores/rfp-draft.ts
contractType: 'new' | 'renewal' | null  // 기본값 null
```

- localStorage 버전 bump (version 5)
- hydration 시 null fallback 처리

### 서버 액션 / Zod 스키마

- `lib/server/actions/rfp/createRfpAction.ts` — Zod 스키마 + INSERT에 `contractType` 포함 (`boardVisible`과 동일 패턴)
- Zod: `z.enum(['new', 'renewal']).nullable().optional()`

---

## PG 화면 — Chip 표시

### UX Writing

| 값 | 화면 레이블 | Chip color |
|----|-------------|------------|
| `'new'` | 신규 계약 | `primary` (파란색) |
| `'renewal'` | 갱신 계약 | `surface` (중립) |
| `null` | (미표시) | — |

색상 구분 근거: `primary`는 신규/활성 강조, `surface`는 정보성 레이블 (grade, role과 동일 패턴).

### 1. 오픈 보드 (`/opportunities`)

**파일**: `components/opportunities/OpportunityList.tsx`  
**타입 변경**: `lib/types/pg-request.ts` — `OpportunityListing.contractType` 추가  
**쿼리 변경**: `lib/server/repositories/drizzle/rfp-pg-request.ts` — SELECT에 `rfps.contractType` 추가

카드 내 마감일 Chip 옆 (또는 payment method 태그 행 앞):
```tsx
{contractType && (
  <Chip label={CONTRACT_TYPE_LABELS[contractType]} color={contractType === 'new' ? 'primary' : 'surface'} />
)}
```

### 2. 인박스 목록 (`/inbox`)

**파일**: `components/inbox/InboxList.tsx`  
**타입 변경**: `InboxRow` 타입(InboxList.tsx:21)에 `contractType?: 'new' | 'renewal' | null` 추가  
**조립 변경**: `app/(app)/inbox/page.tsx:82` — `allRows` 매핑 시 `rfp.contractType` 포함  
(쿼리 자체는 `lib/server/repositories/drizzle/invitation.ts` 가 rfp를 JOIN하므로, `Rfp` 타입에 contractType이 추가되면 자동 포함)

제목 행의 stage Chip 앞에 배치 (좌→우: contractType Chip → stage Chip → 제목):
```tsx
{contractType && <Chip label={...} color={...} />}
```

### 3. RFP 상세 (`/inbox/[rfpId]`)

**파일**: `components/inbox/RfpBriefPanel.tsx`  
헤더 섹션 — 제목 아래, 마감일 Chip 옆에 배치.

---

## 상수/라벨 모듈

```typescript
// 관련 파일 상단 또는 lib/glossary.ts 근처 위치
export const CONTRACT_TYPE_LABELS: Record<'new' | 'renewal', string> = {
  new: '신규 계약',
  renewal: '갱신 계약',
};
```

---

## TDD 계획

아래 순서로 **RED → GREEN** 진행. 시각/스타일 변경만인 경우 TDD 면제, 상태·조건 분기가 있는 경우 테스트 필수.

| # | 테스트 대상 | 파일 | 면제 여부 |
|---|-------------|------|-----------|
| T1 | contractType null 시 보드 카드에 Chip 미렌더 | OpportunityList.test.tsx | 필수 |
| T2 | contractType 'new' 시 "신규 계약" Chip 렌더 | OpportunityList.test.tsx | 필수 |
| T3 | contractType 'renewal' 시 "갱신 계약" Chip 렌더 | OpportunityList.test.tsx | 필수 |
| T4 | 인박스 목록 동일 조건 | InboxList.test.tsx | 필수 |
| T5 | RfpBriefPanel null 시 미렌더 | RfpBriefPanel.test.tsx | 필수 |
| T6 | RfpBriefPanel 'renewal' 시 렌더 | RfpBriefPanel.test.tsx | 필수 |
| T7 | Step2 토글 클릭 → store 업데이트 | RfpStep2Content.test.tsx | 필수 |
| T8 | Step2 선택 후 재클릭 → null 복귀 | RfpStep2Content.test.tsx | 필수 |
| T9 | createRfpAction contractType 포함 저장 | rfp-actions.test.ts | 필수 |

---

## 검증 방법

1. `pnpm test components/rfp/RfpStep2Content` — RED 확인 후 구현 → GREEN
2. `pnpm test components/opportunities/OpportunityList` — 동일
3. `pnpm test components/inbox/InboxList` — 동일
4. `pnpm test components/inbox/RfpBriefPanel` — 동일
5. `pnpm test` — 전체 그린 확인
6. `pnpm tsc --noEmit` — 타입 에러 없음
7. `pnpm lint` — lint 클린
8. 로컬 브라우저: 구매사로 로그인 → 위저드 Step 2에서 토글 확인, PG로 로그인 → 인박스·보드 Chip 확인

---

## 변경 파일 목록

| 파일 | 변경 유형 |
|------|-----------|
| `lib/db/schema/_enums.ts` | contractTypeEnum 추가 |
| `lib/db/schema/rfps.ts` | contractType 컬럼 추가 |
| `lib/types/rfp.ts` | contractType 필드 추가 |
| `lib/stores/rfp-draft.ts` | contractType 필드 + 버전 bump |
| `components/rfp/RfpStep2Content.tsx` | 세그먼트 토글 UI 추가 |
| `lib/server/actions/rfp/createRfpAction.ts` | Zod 스키마 + INSERT에 contractType 포함 |
| `lib/server/repositories/drizzle/rfp-pg-request.ts` | SELECT에 contractType 추가 |
| `lib/types/pg-request.ts` | OpportunityListing 타입 업데이트 |
| `components/opportunities/OpportunityList.tsx` | Chip 렌더링 추가 |
| `components/inbox/InboxList.tsx` (InboxRow 타입) | contractType 필드 추가 |
| `app/(app)/inbox/page.tsx` (allRows 조립부) | rfp.contractType 포함 |
| `components/inbox/InboxList.tsx` | Chip 렌더링 추가 |
| `components/inbox/RfpBriefPanel.tsx` | 헤더 Chip 추가 |
| 각 `__tests__/*.test.tsx` | T1–T9 테스트 작성 |
