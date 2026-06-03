# RFP Step 3 PG사 선택 — 칩 토글 UI 설계

**Date:** 2026-06-04  
**Scope:** `app/rfp/new/page.tsx`, `components/rfp/RfpCreateWizard.tsx`, `components/rfp/RfpStep3PgSelect.tsx`, `hooks/useLazyPgWorkspaces.ts` (삭제)  
**Status:** Approved

---

## 1. 배경 및 문제

현재 Step 3는 Radix Popover + cmdk Command 조합으로 PG사를 한 번에 하나씩 선택해야 한다. 팝업을 열고 → 검색하고 → 선택하고 → 팝업이 닫히는 과정을 PG사마다 반복해야 하므로 여러 PG사를 선택할 때 UX가 불편하다.

PG 목록은 `useLazyPgWorkspaces` 훅이 팝업 오픈 시 클라이언트에서 API를 호출해 가져왔다. `page.tsx`가 이미 서버 컴포넌트(`force-dynamic`)이고 PG 목록 조회는 인증 불필요이므로, 서버에서 직접 가져와 prop으로 전달하는 것이 더 단순하다.

---

## 2. 목표

- PG사를 한 화면에서 한 번에 다중 선택할 수 있도록 개선
- 전체 선택 / 전체 해제를 버튼 하나로 처리
- Popover + cmdk 의존성 제거
- 클라이언트 사이드 PG 목록 fetch 제거 (`useLazyPgWorkspaces` 훅 삭제)

---

## 3. 설계

### 3.1 데이터 흐름

```
page.tsx (Server Component)
  └─ DB 직접 쿼리: SELECT id, name FROM workspaces WHERE type = 'pg'
  └─ pgList: PgWorkspace[] prop → RfpCreateWizard
       └─ pgList prop → RfpStep3PgSelect
            └─ 바로 렌더링 (로딩 없음)
```

`page.tsx`에서 기존 `/api/workspaces/search` 라우트의 쿼리 로직을 그대로 인라인한다. 게스트 모드도 동일하게 처리 (`type=pg`는 인증 불필요이므로).

### 3.2 타입

`PgWorkspace` 타입은 `useLazyPgWorkspaces.ts`에 정의되어 있었다. 훅 삭제 후에는 `lib/types/` 또는 `RfpStep3PgSelect.tsx`에 옮겨 `RfpCreateWizard`와 공유한다.

```ts
export type PgWorkspace = { id: string; name: string; displayName: string };
```

### 3.3 컴포넌트 변경

**`RfpCreateWizard`** — `pgList: PgWorkspace[]` prop 추가, Step 3에 전달.

**`RfpStep3PgSelect`** — `pgList: PgWorkspace[]` prop 수신. 클라이언트 fetch 제거. 로딩/에러 상태 제거.

### 3.4 인터랙션

| 동작 | 결과 |
|---|---|
| 칩 클릭 (미선택) | 해당 PG 선택 → `allowedPgWorkspaceIds`에 추가 |
| 칩 클릭 (선택됨) | 해당 PG 해제 → `allowedPgWorkspaceIds`에서 제거 |
| "전체 선택" 클릭 | 전체 PG를 `allowedPgWorkspaceIds`에 추가 |
| "전체 해제" 클릭 | `allowedPgWorkspaceIds`를 빈 배열로 초기화 |

"전체 선택" / "전체 해제"는 하나의 버튼이 상태에 따라 라벨을 전환한다:
- 전체가 선택된 상태(`allowedPgWorkspaceIds.length === pgList.length && pgList.length > 0`) → "전체 해제"
- 그 외 → "전체 선택"

### 3.5 시각 디자인 (Linear 디자인 시스템)

**칩 (선택됨):** `background: var(--md-sys-color-primary)`, `color: var(--md-sys-color-on-primary)`, border 동일색  
**칩 (미선택):** `background: transparent`, `color: var(--md-sys-color-on-surface)`, `border-color: var(--md-sys-color-outline-variant)`  
**border-radius:** `shape-small` (6px)  
**칩 크기:** `py-[5px] px-3 text-[13px]`  
**전체 선택/해제 버튼:** 헤더 우측, `font-mono text-[10px] uppercase tracking-[0.08em]`, primary 색  
**선택 카운트:** 칩 목록 하단, `font-mono text-[10px]`, primary 색, `N개 선택됨`

### 3.6 제거 항목

- `hooks/useLazyPgWorkspaces.ts` — 파일 전체 삭제
- `@radix-ui/react-popover` import (Step 3에서)
- `cmdk` import (Step 3에서)
- `pgOpen` / `setPgOpen` 상태
- `wsInputError` / `setWsInputError` 상태 및 에러 메시지 UI
- 기존 "PG사 검색…" 트리거 버튼
- 기존 번호 리스트(01, 02 …) + "제거" 버튼 UI

---

## 4. 검증 (TDD)

기존 테스트 4개는 제거하고 새 동작에 맞게 재작성한다. `pgList`는 prop으로 주입하므로 훅 mock 불필요.

| 케이스 | 검증 내용 |
|---|---|
| 칩 렌더링 | pgList 각 항목이 버튼으로 렌더링됨 |
| 칩 클릭 → 선택 | store에 해당 PG 추가됨 |
| 칩 클릭 → 해제 | store에서 해당 PG 제거됨 |
| 전체 선택 | store에 pgList 전체 추가됨 |
| 전체 해제 | store가 빈 배열이 됨 |
| 전체 선택 버튼 라벨 토글 | 전체 선택 시 "전체 해제" 표시, 그 외 "전체 선택" |
| 이전/다음 버튼 동작 | onBack / onNext 호출됨 |

---

## 5. 범위 외

- `/api/workspaces/search` 라우트 — 다른 용도로 쓰일 수 있으므로 유지
- `wizard-validation.ts` 변경 없음 (Step 3 완료 조건 = `allowedPgWorkspaceIds.length > 0` 동일)
- 다른 Step 컴포넌트 변경 없음
