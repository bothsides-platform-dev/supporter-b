# 프로필 가맹점 등급 선택기 제거 + 단일 컬럼 재정렬

**날짜**: 2026-06-21
**브랜치**: `worktree-feat+remove-grade-selector-profile-reflow`
**범위**: 구매사 프로필 화면 (`/settings/profile`) — UI 1개 컴포넌트 + 데드 액션 제거, 레이아웃 재정렬

## 배경 / 문제

`/settings/profile`의 구매사 워크스페이스 영역에는 가맹점 등급(영세 / 중소1·2·3 / 일반)을
라디오로 고르고 "등급 갱신"으로 저장하는 편집기(`WorkspaceBizProfileForm`)가 있다.

이 편집기를 제거하려는 이유:

- 등급은 **정보·표시·필터 용도일 뿐 입찰 가격 로직과 무관**하다. (PG 우대수수료 구간은
  입찰별로 독립 협상되며 구매사 등급을 참조하지 않는다 — `MerchantGrade` ≠ `MerchantTier`.)
- 등급은 **가입 시점**과 **견적 작성 위저드 step 6**(`GradeConfirmPanel`)에서도 설정되어
  프로필 편집기는 사실상 중복 경로다.
- 프로필에서 등급을 직접 바꾸는 기능을 없애 화면을 단순화하고, 비게 되는 공간을
  단일 컬럼으로 재정렬해 밀도를 높인다.

**제품 결정**: 프로필에서 등급은 **읽기 전용**으로만 노출한다. 프로필 화면에서는 등급을
**변경할 수 없다**(변경 안내 문구도 두지 않는다). 등급 값 자체와 다른 경로(가입 / 견적
위저드 / 필터 / 표시)는 모두 그대로 유지한다.

## 변경 대상

### 제거

1. **`components/settings/WorkspaceBizProfileForm.tsx`** — 등급 라디오 선택기 + "등급 갱신"
   버튼 컴포넌트. 파일 삭제.
2. **`components/settings/__tests__/WorkspaceBizProfileForm.test.tsx`** — 위 컴포넌트 전용
   테스트. 파일 삭제.
3. **`app/(app)/settings/profile/page.tsx`** — `WorkspaceBizProfileForm` import 및 사용
   지점(현재 line 5, line 156) 제거.

> **⚠️ 스펙 정정 (grep 검증 결과)**: 최초 설계는 `updateWorkspaceBizProfileAction`을
> "이 폼이 유일 소비처인 데드 액션"으로 보고 삭제 대상에 넣었으나, grep 결과 **틀렸다**.
> `components/settings/WorkspaceBizNoForm.tsx`(유지되는 사업자번호 폼)가 **사업자번호 저장에
> 같은 액션을 사용**한다(line 13 import, line 60 호출). 따라서:
>
> - **`lib/server/actions/rfp/updateWorkspaceBizProfileAction.ts`는 삭제하지 않는다.**
> - 액션 export(`lib/server/actions/rfp/index.ts`), 액션 테스트
>   (`lib/server/actions/rfp/__tests__/update-workspace-biz.test.ts`)도 **유지**한다.
> - 즉 백엔드는 손대지 않으며, 이번 작업은 **순수 프론트엔드 제거 + 레이아웃 재정렬**이다.

### 유지 (변경 없음)

- 읽기 전용 **"가맹점 등급" KV 행** (`GRADE_LABELS[grade]`, page.tsx line 61-63). 등급은
  계속 **표시**된다 — 편집만 사라진다.
- `grade` 데이터 모델, `biz_profiles.grade` 컬럼, `lib/types/biz-profile.ts`,
  `merchantGradeEnum`.
- **다른 등급 쓰기 경로**: 가입(`_createWorkspace.ts`), 견적 위저드 step 6
  (`GradeConfirmPanel` → `createRfpAction.gradeOverride` → `RfpService`).
- 등급 **필터/표시**: `filterRfps`/`pgInbox`/`RfpBriefPanel`/`InboxList`/
  `buildSubmittedSummaryRows` 등 모두 그대로.
- **PG 프로필**: 손대지 않는다. PG에는 등급 UI가 없고 이미 단일 컬럼이다.

## 레이아웃 변경 (구매사 워크스페이스 섹션 한정)

`app/(app)/settings/profile/page.tsx`의 워크스페이스 `<section>`에서 `lg:grid-cols-2` 2컬럼
분할을 제거하고, 좌·우 컬럼을 하나의 `divide-y` 스택으로 합친다.

**현재 (2컬럼, 구매사)**

```
워크스페이스   [구매사]
┌─────────────────────────┬─────────────────────────┐
│ [로고] 워크스페이스 이름   │ 사업자번호 [____] 등록     │
│ 업태            일반과세    │ ┌── 가맹점 등급 갱신 ──┐  │  ← 제거
│ 가맹점 등급      중소2      │ │ ○영세 ◉중소2 …  [갱신]│  │
│ 생성일       2026-06-21   │ └─────────────────────┘  │
└─────────────────────────┴─────────────────────────┘
```

**변경 후 (단일 컬럼, 구매사)**

```
워크스페이스   [구매사]
─────────────────────────────
[로고]  워크스페이스 이름  [편집]
사업자번호   [____________] 등록
업태                      일반과세
가맹점 등급                 중소2     ← 읽기 전용 유지
생성일                  2026-06-21
```

**스택 순서**: 로고 폼 → 이름 폼 → (`biz_required` 안내 블록) → 사업자번호 폼 →
KV(업태·가맹점 등급·생성일).

**구현 메모**

- 워크스페이스 섹션의 바깥 `<div className={ws.type === 'buyer' ? 'grid grid-cols-1
  lg:grid-cols-2 lg:gap-x-12' : ''}>` 래퍼를 제거하고, 좌측 `divide-y` 컨테이너 하나에
  모든 행을 직렬로 둔다.
- 사업자번호 폼과 `biz_required` 토스트/알림 블록은 **구매사 전용** 조건(`ws.type ===
  'buyer'`)을 유지한 채 단일 컬럼 안으로 이동한다.
- `WorkspaceBizNoForm`은 폼 행이지만 `WorkspaceLogoForm`/`WorkspaceNameForm`도 이미
  `divide-y` 안의 폼 행이므로 한 컬럼에 섞여도 시각적으로 일관된다.
- 우측 컬럼 래퍼(`mt-6 pt-6 border-t … lg:mt-0 …`)는 사라지고, 그 안의 buyer 전용
  요소들이 단일 컬럼으로 흡수된다.
- PG의 경우 기존에도 grid 클래스가 비어 있어 단일 컬럼이었으므로 **렌더 결과 동일**해야
  한다 (회귀 확인 포인트).

## 테스트 / 검증

- `app/(app)/settings/profile/page.tsx`는 **서버 컴포넌트 셸**(단순 조립)이라 프로젝트
  TDD 규칙상 면제 대상. 신규 테스트를 추가하지 않는다.
- `WorkspaceBizProfileForm.test.tsx`는 컴포넌트와 함께 **삭제**한다 (제거된 코드의 테스트).
- 검증 = 삭제·재정렬 후 **기존 전체 스위트가 그대로 green**임을 확인:
  - `pnpm tsc --noEmit` (제거된 컴포넌트 import으로 인한 타입 에러 0)
  - `pnpm lint` (미사용 import 0)
  - `pnpm test` (전체 green — 삭제된 테스트 외 회귀 없음)
- 시각 확인(선택): 구매사 프로필 단일 컬럼 렌더, PG 프로필 무변화.

## 비범위 (Out of Scope)

- 스키마 변경 없음 (`grade` 컬럼·enum 유지).
- 등급 데이터 마이그레이션·백필 없음.
- 견적 위저드 step 6 등급 설정·가입 등급 설정 변경 없음.
- 등급 필터/표시 로직 변경 없음.
- PG 프로필 변경 없음.
- "여기서 등급 바꾸세요" 안내 문구 추가 **안 함** (제품 결정: 프로필에서 변경 불가).

## 순효과

컴포넌트 1개 삭제 · 테스트 파일 1개 삭제 · 페이지 1개 재정렬. **백엔드(액션·스키마·데이터)
변화 없음** (`updateWorkspaceBizProfileAction`은 사업자번호 폼이 계속 사용하므로 유지).
유일한 동작 변화는 "프로필에서 가맹점 등급을 더는 편집할 수 없다"이다.
