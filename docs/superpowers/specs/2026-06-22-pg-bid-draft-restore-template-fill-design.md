# PG 견적 작성 — 초안 자동 복원 + 템플릿 채우기 개선 설계

**Date**: 2026-06-22
**Scope**: PG 전용 — 견적 작성 위저드(`BidWizard`)의 UX 정리. 서버 액션·DB 스키마·이메일/알림 팬아웃 변경 **없음**. 클라이언트 + 테스트만.

---

## 1. 목표

PG가 견적 작성 위저드를 열 때의 "불러오기" 경험을 마찰 없이 정리한다.

1. **초안 자동 복원** — 저장된 초안이 있으면 묻는 배너 없이 폼을 바로 채우고, 복원했음을 **토스트**로만 알린다.
2. **사이드바 초기화** — 자동 복원으로 사라지는 "무시"(처음부터) 수단을 사이드바의 작은 `초기화` 버튼으로 대체한다.
3. **템플릿 채우기 상시 노출** — 1단계의 템플릿 불러오기를 저장 템플릿이 0개여도 항상 보이게 하고, 0개일 때는 빈 상태 안내를 띄운다.

전제: 두 기능(초안 복원·템플릿 불러오기)은 **이미 구현되어 있다**. 본 작업은 신규 기능이 아니라 노출/상호작용 방식의 개선이다.

---

## 2. 현재 상태 (변경 대상)

`components/inbox/bid-wizard/BidWizard.tsx`

| 위치 | 현재 동작 |
|---|---|
| `:95–99` | `fields` 초기값 = `initialBid`(재요청 prefill) 또는 빈 기본값. **초안은 초기값에 반영 안 됨** |
| `:113–127` | `useBidDraft(rfpId)` 훅 + `showRestoreBanner` state + `handleRestore`/`handleDismiss` |
| `:115–117` | `useEffect(() => saveDraft(fields), [fields])` — 매 변경 시 무조건 저장(빈 폼도 저장됨) |
| `:348–356` | 배너 JSX "이전에 작성 중이던 내용이 있습니다" + `불러오기`/`무시` |
| `:363–376` | 사이드바(`WizardStepSidebar`) — `footer` 슬롯에 `자동저장됨 · HH:MM`만 |
| `:389–406` | 1단계 상단: `templates.length > 0 &&` 게이트로 가려진 템플릿 드롭다운 → 그 아래 정산 입력 |
| `:173–189` | `applyTemplate(t)` — `clearDraft()` 후 정산주기·한도·보증보험·수수료 채움 |

관련 인프라:
- 초안 저장소: `components/inbox/useBidDraft.ts` — localStorage `bid-draft:{rfpId}`, 500ms 디바운스, `__v: 3` 스키마. `{ draft, saveDraft, clearDraft, savedAt }` 반환. `draft`는 훅 init 시 localStorage에서 1회 읽음(마운트 전 상태 반영).
- 토스트: `lib/toast.ts` → `toast(message, { id?, type?: 'info'|'error'|'success', timeout? })`. `ToasterProvider`는 `app/(app)/layout.tsx`에 마운트되어 딜룸/위저드에서 바로 사용 가능. `id` 지정 시 중복 토스트가 합쳐짐(StrictMode·리렌더 안전).
- 사이드바 footer: `components/rfp/WizardStepSidebar.tsx:89` — `footer?: ReactNode`를 그대로 렌더(버튼 등 인터랙티브 요소 가능).
- 위저드 내 "템플릿으로 저장"은 **4단계**(`components/inbox/bid-wizard/BidStepReview.tsx:136`)에 존재. 템플릿 관리 페이지는 `/quote-templates`.

---

## 3. A — 초안 자동 복원 (배너 제거)

### 동작
1. 위저드를 열 때 **의미 있는** 초안이 있으면 폼을 바로 채운다. 배너·클릭 없음.
2. 마운트 시 토스트 **1회**: `이전에 작성하던 내용을 그대로 불러왔어요`
3. 묻는 배너(`:348–356`)와 `showRestoreBanner`/`handleRestore`/`handleDismiss`는 삭제.

### "의미 있는 초안"만 복원 (`복원한 내용이 있다면`)
현재는 빈 폼도 마운트 직후 자동저장되어, 다음 방문 때 빈 초안에도 배너가 뜨는 선결함이 있다. 이를 함께 고친다.

- **기준 상태(baseline)** = 위저드가 처음 열렸을 때의 폼: `initialBid ? bidToDraft(initialBid) : EMPTY_BID_DRAFT`.
- 저장 로직 변경: 폼이 baseline과 동일(pristine)하면 저장하지 않고 `clearDraft()`, 다를 때만 `saveDraft(fields)`.
  ```ts
  useEffect(() => {
    if (isPristineDraft(fields, baseline)) clearDraft();
    else saveDraft(fields);
  }, [fields]); // baseline은 안정 참조(useMemo)
  ```
- 복원 판정: 마운트 시 `draft && !isPristineDraft(draft, baseline)` 이면 → 초안을 초기값으로 사용 + 복원 토스트. (레거시로 남아 있는 빈 초안도 이 검사로 무시됨.)

### 초기값 우선순위
```
fields 초기값 = (draft && !isPristineDraft(draft, baseline)) ? draft : baseline
```
- 일반: 의미 있는 초안 우선 → 없으면 빈 기본값.
- 재요청: baseline = 직전 라운드 prefill. 그 위에 편집분이 있으면 초안(편집분)이 우선. (초안은 제출 시 `clearDraft`되므로 두 값이 충돌하는 경우는 드묾.)
- 재요청 직후(편집 전)에는 초안이 baseline과 동일(pristine) → 저장/복원/토스트 모두 발생 안 함. 편집을 시작해야 초안이 생긴다.

### 헬퍼/상수 (`useBidDraft.ts`로 추출, 테스트 위해 export)
- `EMPTY_BID_DRAFT: BidDraft` — 현재 `:98` 인라인 기본값을 상수화.
- `isPristineDraft(a: BidDraft, baseline: BidDraft): boolean` — 직렬화 비교(`JSON.stringify`로 충분; `fees`는 키 순서 영향 적으나 정렬 후 비교로 안전).

### 토스트 호출
```ts
toast('이전에 작성하던 내용을 그대로 불러왔어요', { id: `bid-draft-restored:${rfpId}` });
```
마운트 전용 `useEffect`(빈 deps)에서 위 복원 판정이 참일 때만 호출. `id`로 중복 방지.

---

## 4. B — 사이드바 초기화

### 동작
1. 사이드바 `footer`(현재 `자동저장됨` 표시 자리)에 저강조 텍스트 버튼 **`초기화`** 추가.
2. 클릭 → 확인 다이얼로그(되돌릴 수 없는 동작):
   - 제목: `작성 중인 내용을 지울까요?`
   - 설명: `지금까지 입력한 정산조건·수수료·견적서가 모두 사라져요.`
   - 확인 라벨: `처음부터 다시` / 취소 라벨: `취소`
   - variant: `destructive` (없으면 `default` + 에러색 확인 버튼 — 구현 시 `ConfirmDialog` props 확인)
3. 확인 시:
   - `clearDraft()`
   - `setFields(baseline)` (일반=빈 기본값, 재요청=직전 라운드 prefill로 되돌림 = "처음 열었을 때 상태")
   - `setProposal(null)` (업로드한 견적서 선택 해제 — 서버 blob 삭제는 아님)
   - `setCurrentStep(1)`
4. footer는 **복원할/저장된 내용이 있을 때만** `초기화`를 노출(`savedAt != null` 또는 의미 있는 초안 복원됨). `자동저장됨 · HH:MM` 칩은 기존대로 `savedAt`이 있을 때.

> 구현 메모: `ConfirmDialog`는 이미 import됨(`:7`, 제출 확인에 사용). 리셋용 `resetConfirmOpen` state 추가.

---

## 5. C — 템플릿 채우기 상시 노출 + 빈 상태

### 동작
1. 1단계 상단 템플릿 섹션의 `templates.length > 0` 게이트(`:391`) 제거 → **항상 렌더**.
   - 템플릿 ≥ 1: 기존 드롭다운(`견적 템플릿 불러오기`).
   - 템플릿 0개: 한 줄 빈 상태 안내.
     - 문구: `저장된 견적 템플릿이 없어요. 자주 쓰는 정산조건·수수료를 템플릿으로 저장하면 다음부터 한 번에 불러올 수 있어요.`
     - 링크: `템플릿 관리` → `/quote-templates` (next `Link`). 위저드 4단계 "템플릿으로 저장"으로도 만들 수 있음(안내문에는 굳이 노출 안 함, 링크로 충분).
   - 스타일: Linear 저대비. `outline-variant` 보더 1px 박스 + `on-surface-variant` 본문, 링크는 accent. 일러스트 없음.
2. `applyTemplate`에 토스트 추가(복원 토스트와 일관):
   ```ts
   toast(`‘${t.name}’ 템플릿을 불러왔어요`);
   ```
   - `applyTemplate`은 기존대로 `clearDraft()` 후 필드 덮어쓰기(명시적 사용자 동작이므로 초안 폐기 정상).
   - 이벤트(onChange) 기반 1회 호출이라 `id` 불필요.

---

## 6. UX 문구 (해요체 · 능동형, `UX_WRITING.md` 준수)

| 상황 | 문구 |
|---|---|
| 초안 복원 토스트 | `이전에 작성하던 내용을 그대로 불러왔어요` |
| 템플릿 적용 토스트 | `‘{이름}’ 템플릿을 불러왔어요` |
| 초기화 확인 제목 | `작성 중인 내용을 지울까요?` |
| 초기화 확인 설명 | `지금까지 입력한 정산조건·수수료·견적서가 모두 사라져요.` |
| 초기화 확인 버튼 | `처음부터 다시` |
| 사이드바 버튼 | `초기화` |
| 템플릿 빈 상태 | `저장된 견적 템플릿이 없어요. 자주 쓰는 정산조건·수수료를 템플릿으로 저장하면 다음부터 한 번에 불러올 수 있어요.` / 링크 `템플릿 관리` |

---

## 7. 변경 파일

| 파일 | 변경 |
|---|---|
| `components/inbox/bid-wizard/BidWizard.tsx` | 배너 삭제, 자동 복원 + 복원 토스트, baseline/pristine 기반 저장 게이트, 사이드바 `초기화`(+확인), 템플릿 섹션 상시 노출 + 빈 상태, `applyTemplate` 토스트 |
| `components/inbox/useBidDraft.ts` | `EMPTY_BID_DRAFT` 상수 + `isPristineDraft()` 헬퍼 export (저장 로직은 그대로 둠) |
| `components/inbox/bid-wizard/__tests__/BidWizard.test.tsx` | "드래프트 복원" 스위트 교체 + 템플릿 빈 상태/토스트 테스트 추가, `@/lib/toast` mock |
| `components/inbox/__tests__/useBidDraft.test.ts` | `isPristineDraft`/`EMPTY_BID_DRAFT` 단위 테스트 추가 |

서버/스키마/액션/이메일: **변경 없음**.

---

## 8. 테스트 계획 (TDD: RED → GREEN)

`@/lib/toast`는 `vi.mock('@/lib/toast', () => ({ toast: vi.fn() }))` 패턴(기존 `RfpCreateWizard.test.tsx` 선례) 재사용.

### `BidWizard.test.tsx`
- (교체) 의미 있는 초안 존재 → 마운트 시 폼이 초안 값으로 채워짐 + **배너 없음** + `toast('이전에 작성하던 내용을 그대로 불러왔어요', ...)` 호출.
- (신규) 빈/pristine 초안만 있을 때 → 복원 안 함, 토스트 없음.
- (신규) `초기화` → 확인 → 폼이 baseline으로 리셋 + `proposal` 해제 + 1단계 이동 + `clearDraft` 호출.
- (신규) 템플릿 0개 → 빈 상태 안내 + `/quote-templates` 링크 렌더.
- (유지/보강) 템플릿 ≥1 → 드롭다운 렌더, 선택 시 `applyTemplate` + 토스트.

### `useBidDraft.test.ts`
- `isPristineDraft(EMPTY_BID_DRAFT, EMPTY_BID_DRAFT) === true`.
- 한 필드라도 다르면 `false` (fees 키 순서 무관).
- 기존 save/clear/디바운스 테스트는 유지.

### 변경 없음 확인
- `submitBidAction` 등 제출 경로 — 무변경.
- `bidToDraft` — 무변경(재요청 prefill 그대로).

---

## 9. 엣지 케이스

- **StrictMode 이중 마운트**: 복원 토스트는 `id` 고정으로 1개만 보임. `setFields` 멱등.
- **재요청 + 미편집**: 초안 pristine → 저장/복원/토스트 없음.
- **재요청 + 편집 후 새로고침**: 편집분 초안 복원 + 토스트(정상 — 이어쓰기).
- **레거시 빈 초안(이전 버전이 저장한 것)**: `isPristineDraft`로 무시되어 복원/토스트 없음.
- **초기화 후 새로고침**: 리셋으로 baseline 저장(또는 pristine이면 clear) → 일반 케이스는 빈 폼, 토스트 없음.

---

## 10. 작업 범위 외 (YAGNI)

- 서버 측 초안 영속화(여전히 localStorage 단일).
- 초안 만료/TTL, 다중 라운드 초안 분리.
- 템플릿 검색/미리보기 강화(별도 `/quote-templates` 화면 소관).
- 업로드된 견적서 blob의 서버 삭제(초기화는 선택만 해제).
- 구매사 위저드(`RfpCreateWizard`)에는 적용하지 않음(PG 한정 요청).
