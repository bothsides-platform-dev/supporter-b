# RFP Step 3 PG사 선택 — 칩 토글 UI 설계

**Date:** 2026-06-04  
**Scope:** `components/rfp/RfpStep3PgSelect.tsx` + 관련 테스트  
**Status:** Approved

---

## 1. 배경 및 문제

현재 Step 3는 Radix Popover + cmdk Command 조합으로 PG사를 한 번에 하나씩 선택해야 한다. 팝업을 열고 → 검색하고 → 선택하고 → 팝업이 닫히는 과정을 PG사마다 반복해야 하므로 여러 PG사를 선택할 때 UX가 불편하다.

---

## 2. 목표

- PG사를 한 화면에서 한 번에 다중 선택할 수 있도록 개선
- 전체 선택 / 전체 해제를 버튼 하나로 처리
- Popover + cmdk 의존성 제거

---

## 3. 설계

### 3.1 컴포넌트 구조

`RfpStep3PgSelect` 단일 컴포넌트를 수정한다. 신규 컴포넌트 추가 없음.

### 3.2 데이터 로딩

기존 `useLazyPgWorkspaces` 훅을 유지한다. 단, 로드 트리거를 팝업 `onOpenChange` 에서 컴포넌트 마운트 시 `useEffect`로 교체한다.

```ts
useEffect(() => { loadPg(); }, [loadPg]);
```

### 3.3 인터랙션

| 동작 | 결과 |
|---|---|
| 칩 클릭 (미선택) | 해당 PG 선택 → `allowedPgWorkspaceIds`에 추가 |
| 칩 클릭 (선택됨) | 해당 PG 해제 → `allowedPgWorkspaceIds`에서 제거 |
| "전체 선택" 클릭 | 전체 PG를 `allowedPgWorkspaceIds`에 추가 |
| "전체 해제" 클릭 | `allowedPgWorkspaceIds`를 빈 배열로 초기화 |

"전체 선택" / "전체 해제"는 하나의 버튼이 상태에 따라 라벨을 전환한다:
- 전체가 선택된 상태 → "전체 해제"
- 그 외 → "전체 선택"

### 3.4 시각 디자인 (Linear 디자인 시스템)

**칩 (선택됨):** `background: var(--md-sys-color-primary)`, `color: var(--md-sys-color-on-primary)`, border 동일색  
**칩 (미선택):** `background: transparent`, `color: var(--md-sys-color-on-surface)`, `border: var(--md-sys-color-outline-variant)`  
**border-radius:** `shape-small` (6px)  
**칩 크기:** `py-[5px] px-3 text-[13px]`  
**전체 선택 버튼:** 우상단, `font-mono text-[10px] uppercase tracking-[0.08em]`, primary 색  
**선택 카운트:** 칩 목록 하단, `font-mono text-[10px] primary 색`, `N개 선택됨`  
**로딩 상태:** `LOADING…` 텍스트 (spinner 없음)

### 3.5 에러 처리

- 로드 실패 시 `pgError` 문자열을 칩 영역 대신 표시
- 이미 추가됨 에러(`wsInputError`)는 칩 방식으로 전환되므로 제거

### 3.6 제거 항목

- `@radix-ui/react-popover` import (Step 3에서)
- `cmdk` import (Step 3에서)
- `pgOpen` / `setPgOpen` 상태
- `wsInputError` / `setWsInputError` 상태 및 에러 메시지 UI
- 기존 "PG사 검색…" 트리거 버튼
- 기존 번호 리스트(01, 02 …) + "제거" 버튼 UI

---

## 4. 검증 (TDD)

기존 테스트 4개는 제거하고 새 동작에 맞게 재작성한다.

| 케이스 | 검증 내용 |
|---|---|
| 마운트 시 loadPg 호출 | `load` 함수가 마운트 직후 1회 호출됨 |
| 칩 클릭 → 선택 | store에 해당 PG 추가됨 |
| 칩 클릭 → 해제 | store에서 해당 PG 제거됨 |
| 전체 선택 | store에 전체 PG 추가됨 |
| 전체 해제 | store가 빈 배열이 됨 |
| 전체 선택 버튼 라벨 토글 | 전체 선택 시 "전체 해제" 표시 |
| 로딩 상태 | LOADING… 텍스트 표시 |
| 이전/다음 버튼 동작 | onBack / onNext 호출됨 |

---

## 5. 범위 외

- `useLazyPgWorkspaces` 훅 로직 변경 없음
- `wizard-validation.ts` 변경 없음 (Step 3 완료 조건 = `allowedPgWorkspaceIds.length > 0` 동일)
- 다른 Step 컴포넌트 변경 없음
