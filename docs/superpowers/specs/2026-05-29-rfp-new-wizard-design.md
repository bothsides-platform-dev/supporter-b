# RFP 신규 작성 — 4단계 위저드 디자인

**Date:** 2026-05-29  
**Route:** `/rfp/new`  
**Scope:** `RfpCreateForm` 및 관련 컴포넌트 재구성

---

## Context

현재 `/rfp/new`는 모든 섹션(사업자 정보, 제안 내용 8개 필드, PG 선택, 발송 조건)이 한 페이지에 펼쳐진 단일 스크롤 형태다. 필드 수가 많고 구조적 흐름이 없어 사용자가 어디서부터 시작해야 할지, 발송 버튼이 어디 있는지 직관적으로 파악하기 어렵다. 4단계 위저드로 재구성해 각 단계의 책임을 분리하고, 발송 전 최종 검토 단계를 추가한다.

---

## Architecture

### 단계 구성

| Step | 제목 | 필수 조건 | 내용 |
|------|------|-----------|------|
| 1 | 사업자 확인 | 없음 (항상 통과) | 워크스페이스 bizProfile 읽기 전용 표시 |
| 2 | 제안 내용 | 제목 입력 | 제목*(필수) + 7개 선택 필드 + 메모 + 파일 첨부 |
| 3 | PG 선택 | ≥1개 PG 추가 | PG 검색 combobox + 선택 목록 |
| 4 | 발송 확인 | 마감일 선택 | 마감일 입력 + 전체 내용 요약 검토 + 발송 |

완료된 단계는 사이드바에서 ✓ 표시. 어느 완료 단계든 클릭 시 자유 이동 가능. 미완료 단계는 클릭 비활성화.

### 레이아웃

- **데스크탑 (lg+):** 기존 AppSidebarLayout 우측에 스텝 사이드바(160px) 추가. 스텝 사이드바 오른쪽이 단계별 콘텐츠 영역.
- **모바일 (<lg):** 상단 dot 진행 바(Step X/4 텍스트 포함). 콘텐츠는 단일 컬럼 스크롤.

### 상태 관리

기존 `useRfpDraftStore` (Zustand, localStorage 지속)를 그대로 사용. 현재 단계(`currentStep: 1|2|3|4`)는 **메모리 전용** (localStorage 미지속) — 페이지 새로고침 시 Step 1부터 재시작하되 입력 데이터는 복원됨.

현재 store의 `step: number` 필드가 이미 존재하나 미사용 상태이므로 이를 활성화.

---

## Components

### 신규/변경

**`RfpCreateWizard`** (기존 `RfpCreateForm` 대체)
- `currentStep` state 관리 (1~4)
- 스텝 사이드바(데스크탑) / 상단 진행 바(모바일) 렌더링
- 단계별 컴포넌트 조건부 렌더링
- `onStepClick(step)` — 완료된 단계로 자유 이동

**`WizardStepSidebar`** (신규, 데스크탑 전용)
- 4개 스텝 아이템 (번호 or ✓ + 레이블)
- 완료/현재/미완료 상태 스타일
- 클릭 핸들러

**`WizardProgressBar`** (신규, 모바일 전용)
- dot 4개 (done=green, active=accent pill, pending=muted)
- "Step X/4 — {단계명}" 텍스트

**`RfpStep1BizProfile`** (기존 Section 01 추출)
- bizProfile 읽기 전용 표시 (기존 로직 그대로)

**`RfpStep2Content`** (기존 Section 02 추출)
- 제목*(필수), 선택 필드 7개, 메모, 파일 첨부
- 제목 비어있으면 "다음" 버튼 비활성화

**`RfpStep3PgSelect`** (기존 Section 03 추출)
- PG 검색 combobox + 선택 목록
- PG 0개면 "다음" 버튼 비활성화

**`RfpStep4Review`** (신규)
- **마감일 입력** (date picker, min=내일) — 기존 Section 04에서 이동
- 전체 입력 내용 요약 테이블 (읽기 전용 grid)
- 선택된 PG 목록
- "← 이전" + "{N}개 PG사에 발송" 버튼
- 마감일 미선택 시 발송 버튼 비활성화

### 제거

- 기존 `RfpCreateForm`의 2-column grid 레이아웃 (`lg:grid-cols-[1fr_300px]`)
- 우측 사이드바 Section 04 (발송 조건) — Step4로 이동

### 유지

- `RfpAttachmentDropzone` — Step 2에 그대로 포함
- `useLazyPgWorkspaces` hook — Step 3에 그대로 사용
- `createRfpAction` server action — 변경 없음
- `useRfpDraftStore` — 변경 없음 (step 필드만 활성화)
- Cmd+S 임시 저장 shortcut — 유지 (UX 일관성)

---

## Toast

발송 성공 시 기존 `ToasterProvider`를 통해 toast 표시:

```
✓ 3개 PG사에 제안서가 발송되었습니다
  P-2606-0042 · 마감 2026-06-20
```

- 스타일: success variant (green left border)
- duration: 5000ms
- 발송 성공 후 `/rfp/{code}`로 이동 (기존과 동일)
- **구매자 확인 이메일 없음** — `createRfpAction`의 buyer confirmation email 제거

---

## Data Flow

```
RfpCreateWizard
  ├─ currentStep (memory state)
  ├─ draft (Zustand ← localStorage)
  │
  ├─ Step 1: draft.bizProfile 표시 (읽기 전용)
  ├─ Step 2: draft.{title, websiteUrl, mainProducts, ...} 편집
  ├─ Step 3: draft.allowedPgWorkspaceIds 편집
  └─ Step 4: draft.deadline 편집 + 전체 요약 표시
               → createRfpAction() 호출
               → ok: toast() + draft.reset() + router.push(/rfp/code)
               → error: 인라인 에러 메시지
```

---

## 단계 전환 조건 및 가드

```
canProceedFrom(step):
  1 → 항상 true
  2 → draft.title.trim() !== ''
  3 → draft.allowedPgWorkspaceIds.length > 0
  4 → draft.deadline !== '' (발송 버튼 조건)

// maxReachedStep: 세션 중 도달한 가장 높은 단계 번호 (memory state)
// 예) step 4까지 갔다가 step 2로 돌아온 경우 maxReachedStep=4 유지

canJumpTo(targetStep):
  targetStep <= maxReachedStep → true
  targetStep > maxReachedStep → false

// "다음" 버튼 클릭 성공 시: maxReachedStep = max(maxReachedStep, nextStep)
```

---

## 파일 변경 범위

| 파일 | 변경 |
|------|------|
| `components/rfp/RfpCreateForm.tsx` | `RfpCreateWizard`로 rename + 재구성 |
| `components/rfp/WizardStepSidebar.tsx` | 신규 |
| `components/rfp/WizardProgressBar.tsx` | 신규 |
| `components/rfp/RfpStep1BizProfile.tsx` | 신규 (기존 Section 01 추출) |
| `components/rfp/RfpStep2Content.tsx` | 신규 (기존 Section 02 추출) |
| `components/rfp/RfpStep3PgSelect.tsx` | 신규 (기존 Section 03 추출) |
| `components/rfp/RfpStep4Review.tsx` | 신규 |
| `app/rfp/new/page.tsx` | import 경로 변경 (`RfpCreateForm` → `RfpCreateWizard`) |
| `lib/server/actions/rfp/createRfpAction.ts` | buyer confirmation email 제거 |

---

## Verification

1. `pnpm dev` 실행 후 `/rfp/new` 접속
2. 4단계가 좌측 사이드바에 표시되는지 확인
3. 각 단계의 "다음" 버튼 활성화 조건 테스트
4. Step 4에서 발송 후 toast 출력 + `/rfp/{code}` 리다이렉트 확인
5. 완료된 단계 클릭 시 자유 이동 확인
6. 브라우저 창 좁히면 상단 dot 진행 바로 전환 확인
7. 페이지 새로고침 → Step 1 복귀, 입력 데이터 유지 확인
