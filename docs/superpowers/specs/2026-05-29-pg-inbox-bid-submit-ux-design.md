# PG Inbox 제출 UX 개선 설계

**날짜**: 2026-05-29  
**대상 화면**: P3 `/inbox/[rfpId]` — BidForm  
**범위**: 두 가지 독립 개선 — 임시 저장 + 수수료 환산 힌트

---

## 배경

PG 담당자가 `BidForm`을 작성하다 다른 RFP를 클릭하거나 탭을 닫으면 입력 내용이 모두 사라진다. 또한 수수료 `%` 입력값이 실제로 얼마를 의미하는지 즉각적인 피드백이 없어 오입력 위험이 있다.

---

## 개선 1 — 수수료 실시간 환산 힌트

### 문제

`PctInput`에 `%` suffix는 이미 있으나, 입력값이 실제 결제 금액 대비 얼마인지 즉시 알 수 없다.  
`0.50`을 입력했을 때 "50원/만원"인지 "500원/만원"인지 확인하려면 직접 계산해야 한다.

### 설계

`PctInput` 컴포넌트(`components/inbox/BidForm.tsx`)의 입력란 하단에 실시간 환산 힌트 추가.

```
value가 유효한 양수 → "= 1만원 결제 시 {Math.round(parseFloat(value) * 100).toLocaleString()}원" 표시
value가 비어있거나 0 → 힌트 숨김
```

**예시**
| 입력값 | 힌트 |
|--------|------|
| 0.50 | = 1만원 결제 시 50원 |
| 1.25 | = 1만원 결제 시 125원 |
| 1.50 | = 1만원 결제 시 150원 |

**스타일**: `font-mono text-[11px] text-[var(--md-sys-color-tertiary)]` (성공 계열 색상)

**변경 파일**: `components/inbox/BidForm.tsx` — `PctInput` 함수만 수정. 서버 액션·스키마 변경 없음.

---

## 개선 2 — localStorage 임시 저장

### 문제

`BidForm`은 모든 상태를 React `useState`로만 관리하므로, 페이지 이탈 시 입력 내용이 전부 사라진다.  
제안서 PDF 업로드까지 완료한 뒤 실수로 다른 RFP를 클릭하면 처음부터 다시 작성해야 한다.

### 설계

#### 저장 키
```
bid-draft:{rfpId}
```
RFP별로 격리. 다른 RFP의 드래프트와 섞이지 않는다.

#### 저장 대상
```ts
type BidDraft = {
  cycleUnit: 'D' | 'W' | 'M';
  cycleNum: string;
  settleLimit: string;
  guaranteeInsurance: string;
  bankPct: string;
  cardPct: string;
  memo: string;
};
```
제안서 PDF(`proposal`)는 제외 — attachment ID는 서버에 이미 업로드된 파일이지만 세션 간 재사용 보장 불가.

#### 동작 흐름

```
[입력 변경 시]
  필드 변경 → useEffect (deps: 7개 필드) → debounce 500ms
  → localStorage.setItem('bid-draft:{rfpId}', JSON.stringify(draft))

[컴포넌트 mount 시]
  → localStorage.getItem('bid-draft:{rfpId}')
  → null이면 → 아무것도 하지 않음
  → 값이 있으면 → showRestoreBanner = true

[복원 배너 — "불러오기" 클릭]
  → 7개 필드 상태 일괄 덮어쓰기
  → showRestoreBanner = false

[복원 배너 — "무시" 클릭]
  → localStorage.removeItem('bid-draft:{rfpId}')
  → showRestoreBanner = false

[제출 성공 시]
  → localStorage.removeItem('bid-draft:{rfpId}')
  → router.push(`/inbox/${rfpCode}/submitted`)
```

#### 복원 배너 위치

`BidForm` 폼 최상단 (StatutoryCardFeeNotice / 등급 미입력 배너보다 위).

```
┌──────────────────────────────────────────────────────┐
│ ↩ 이전에 작성 중이던 내용이 있습니다   [불러오기] [무시] │
└──────────────────────────────────────────────────────┘
```

스타일: `bg-[var(--md-sys-color-secondary-container)]` 계열, Linear 디자인 — 1px border, 6px radius, shadow 없음.

#### 구현 분리

`useBidDraft(rfpId)` 커스텀 훅으로 localStorage 로직 분리 → 단위 테스트 용이.

```ts
// 반환값
{
  draft: BidDraft | null;           // mount 시 읽은 값 (JSON.parse 실패 시 null)
  saveDraft: (d: BidDraft) => void; // 내부적으로 debounce 500ms 처리
  clearDraft: () => void;
}
```

`localStorage.getItem` 결과를 `JSON.parse`할 때 예외가 발생하면 `null`을 반환하고 항목을 삭제한다 (손상된 데이터 자동 정리).

**변경 파일**:
- `components/inbox/BidForm.tsx` — 훅 호출 + 배너 렌더링
- `components/inbox/useBidDraft.ts` (신규) — localStorage 훅

---

## 변경 범위 요약

| 파일 | 변경 종류 |
|------|-----------|
| `components/inbox/BidForm.tsx` | 수정 — `PctInput` 힌트 추가, `useBidDraft` 훅 연결, 복원 배너 렌더링 |
| `components/inbox/useBidDraft.ts` | 신규 — localStorage 읽기/쓰기/지우기 훅 |

서버 액션, DB 스키마, 타입 변경 없음.

---

## 검증 계획

### 단위 테스트

**`useBidDraft.test.ts`**
- mount 시 드래프트 없으면 `null` 반환
- mount 시 드래프트 있으면 파싱된 값 반환
- `saveDraft` 호출 시 localStorage에 저장
- `clearDraft` 호출 시 항목 제거

**`BidForm.test.tsx`** (기존 확장)
- 드래프트 있을 때 복원 배너 렌더링
- "불러오기" 클릭 시 필드 값 복원
- "무시" 클릭 시 배너 숨김 + localStorage 제거
- 제출 성공 시 localStorage 제거
- `PctInput` 값 입력 시 환산 힌트 표시

### 수동 확인
1. BidForm 일부 입력 → 다른 RFP 클릭 → 다시 돌아오면 복원 배너 표시
2. "불러오기" → 이전 값 복원 확인
3. 제출 완료 후 `/submitted` → 브라우저 뒤로가기 → 배너 없음 확인
4. 수수료 입력 시 환산 힌트 실시간 업데이트 확인
