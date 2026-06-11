# 견적 템플릿 재배치 + 기능 개선 설계

**Date**: 2026-06-10  
**Scope**: PG 전용 기능 — 구매사에게는 노출되지 않음

---

## 1. 목표

1. 견적 템플릿을 설정 하위 링크에서 홈·알림·메시지와 같은 nav 최상위 레이어로 승격
2. URL을 `/settings/quote-templates` → `/quote-templates`로 변경 (기존 라우트 삭제, redirect 없음)
3. 세 가지 기능 개선:
   - **A** — 구간 수수료(TierRates) 템플릿 편집기에서 직접 입력 지원
   - **B** — 목록 카드에 수수료 미리보기 chip 표시
   - **C** — 복제 기능 추가

---

## 2. Nav · Route 변경

### nav-config.ts

- `QUOTE_TEMPLATES_LINK`를 `SETTINGS_SECTION.links`에서 제거
- `top` 배열(홈·알림·메시지 다음)에 NavLeaf로 추가 — PG 워크스페이스에서만 포함
- 아이콘: `LayoutTemplateIcon` (lucide-react 신규 추가 → `components/icons/index.tsx`)
- 단축키: 기존 `G → Q` 유지
- `getBreadcrumbSegments`: `/quote-templates` 케이스 추가 (`[{ label: '견적 템플릿' }]`), `/settings/quote-templates` 케이스 제거

### 라우트

| 경로 | 처리 |
|---|---|
| `app/(app)/quote-templates/page.tsx` | 신규 RSC |
| `app/(app)/settings/quote-templates/page.tsx` | **삭제** |

---

## 3. 페이지 구조 (`/quote-templates`)

RSC (`QuoteTemplatesPage`):
- PG guard: `workspaceType !== 'pg'` → `/home` redirect
- `listByWorkspace(wsId)` + `findById(wsId)` 병렬 로드
- `<QuoteTemplateList>` (client)에 `initialTemplates` + `workspaceName` props 전달

---

## 4. 컴포넌트 설계

### `components/quote-templates/QuoteTemplateList.tsx` (신규, client)

**역할**: 목록 렌더링 + 복제·삭제 이벤트 처리 + 드로어 열기/닫기 상태 관리

**목록 카드 구조** (아이템당):
- 이름 (14px, font-weight 600)
- 부제: `정산 {settleCycle} · 한도 {settleLimit}원` (11px, monospace)
- 미리보기 chips (B):
  - 구간 수단(`isTieredMethod`): `"{method} 구간별"` chip
  - 일반 수단 (값 있는 경우만): `"{method} {rate}%"` chip
  - 최대 4개 chip 표시 (초과 시 `+N` chip)
- 버튼: 편집 · 복제 · 삭제

**빈 상태**: "아직 저장된 템플릿이 없어요." 문구

**헤더 영역**: 페이지 제목 + 설명 + 우상단 "새 템플릿" 버튼

**템플릿 수 표시**: `{n} / 20개` (목록 하단)

### `components/quote-templates/QuoteTemplateDrawer.tsx` (신규, client)

**역할**: 생성·편집 폼을 담는 우측 슬라이드인 드로어

**드로어 너비**: 480px (데스크탑), full-width (모바일)

**폼 필드**:
1. 템플릿 이름 (필수, maxLength 80)
2. 정산 주기 (D/W/M Select + 숫자 input)
3. 정산한도 (CurrencyInput)
4. 월 보증보험 (CurrencyInput)
5. 결제수단별 수수료:
   - `isTieredMethod(m)` = true → **5-구간 그리드** (영세/중소1/중소2/중소3/일반), 항상 펼침
   - 그 외 → 기존 단일 `PercentInput`

**드로어 footer**: 저장 버튼(primary) + 취소 버튼(text)

**저장 흐름**: `saveQuoteTemplateAction` → ok → 드로어 닫기 + `router.refresh()` → error → 에러 메시지 표시

**편집 진입**: 기존 템플릿의 TierRates는 `editorFromTemplate`으로 로드해 각 구간 입력에 채움

### 기존 파일 처리

| 파일 | 처리 |
|---|---|
| `components/settings/QuoteTemplatesPanel.tsx` | **삭제** — 기능이 위 두 컴포넌트로 분리됨 |
| `components/settings/__tests__/QuoteTemplatesPanel.test.tsx` | **삭제** — 새 컴포넌트 테스트로 대체 |

---

## 5. 신규 Server Action

### `duplicateQuoteTemplateAction`

```ts
input: { templateId: string }
// 기존 템플릿 조회 → 전체 필드 복사 + name에 " 복제" suffix → 새 레코드 INSERT
output: ServiceResult<{ id: string }>
```

- 20개 한도 체크 (기존 `saveQuoteTemplateAction`의 `LIMIT_REACHED` 동일 규칙)
- 워크스페이스 소유권 검증 필수

---

## 6. TierRates 편집기 상세

### 편집기 EditorState 변경

현재 `EditorState.tieredFees`는 저장된 값을 읽기 전용으로 보존만 했음. 변경 후:

- `fees` map에 `"{method}:{tier}"` 키로 저장 (예: `"card:sole"`, `"card:sme1"`)
- `editorFromTemplate`에서 TierRates를 `fees["card:sole"]`, `fees["card:sme1"]` 등으로 풀어서 로드
- 저장 시 `isTieredMethod(m)`인 수단은 `fees["{m}:{tier}"]`를 모아 `TierRates` 객체로 재조립

이렇게 하면 `tieredFees` 별도 필드 없이 `fees` 단일 map으로 통일됨.

---

## 7. 아이콘 추가

`components/icons/index.tsx`에 `LayoutTemplateIcon` 추가. lucide-react에서 `LayoutTemplate`을 직접 re-export하는 방식으로 구현:

```tsx
import { LayoutTemplate } from 'lucide-react';
export function LayoutTemplateIcon({ size = 20, ...p }: IconProps) {
  return <LayoutTemplate width={size} height={size} {...p} />;
}
```

---

## 8. 테스트 계획

### 유닛 테스트 (Vitest + PGlite)

| 테스트 파일 | 커버리지 |
|---|---|
| `components/quote-templates/__tests__/QuoteTemplateList.test.tsx` | 목록 렌더, chip 표시 (구간/단일/빈), 복제·삭제 클릭 |
| `components/quote-templates/__tests__/QuoteTemplateDrawer.test.tsx` | 폼 입력, TierRates 5구간 입력, 저장·취소 |
| `lib/server/actions/quote-template/__tests__/quoteTemplateCrud.test.ts` | 기존 + `duplicateQuoteTemplateAction` 추가 |
| `lib/nav/__tests__/nav-config.test.ts` | 기존 + `/quote-templates` 경로 검증 |

### 변경 없는 항목

- `saveQuoteTemplateAction` / `deleteQuoteTemplateAction` — 로직 변경 없음
- `BidWizard` — 템플릿 불러오기 로직 변경 없음 (TierRates 풀기는 이미 구현됨)
- DB 스키마 — 변경 없음 (JSONB paymentFees가 TierRates를 이미 수용함)

---

## 9. 작업 범위 외

- 검색/필터 (20개 한도라 불필요)
- 정렬 변경 (createdAt DESC 유지)
- 구매사 견적 요청 연동 변경 없음
