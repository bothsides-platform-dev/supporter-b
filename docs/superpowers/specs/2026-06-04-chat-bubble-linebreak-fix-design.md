# Chat Bubble Linebreak Bug Fix — Design Spec

**Date:** 2026-06-04  
**File:** `components/messages/ThreadView.tsx`  
**Scope:** 버그 수정 (visual only, no data/logic change)

---

## 문제 요약

채팅 화면에서 상대방(non-self) 메시지가 글자 단위로 줄바꿈되는 버그.  
자신(self) 메시지는 정상. 동일 본문이 송신자 화면에서는 한 줄, 수신자 화면에서 줄바꿈됨 → 렌더링 문제(데이터 문제 아님).

## 근본 원인

`max-w-[78%]` CSS가 bubble div의 containing block인 bubble row를 참조하는데, bubble row의 너비가 자신의 유일한 자식(bubble div)에 의해 결정되는 순환 참조(circular reference)가 발생한다.

- **Non-self:** bubble row = bubble div만 포함 → 순환 → 브라우저가 bubble row min-content를 단일 문자 너비(~32px)로 계산 → `78% × 32px ≈ 25px` → 콘텐츠 영역 ≈ 1px → `overflow-wrap: break-word`로 모든 글자 줄바꿈
- **Self:** `shrink-0` timestamp 형제(~50px)가 bubble row min-content를 ~88px로 앵커 → `78% × 88px ≈ 69px` → 콘텐츠 영역 ~45px → 정상

**Tailwind v4 관련:** `break-words` 클래스는 Tailwind v4에서 `wrap-break-word`(`overflow-wrap: break-word`)의 alias. 이 속성이 min-content를 문자 단위로 축소시켜 순환 참조 붕괴를 유발한다.

## 수정 방법 (A안)

`w-full`을 bubble row에 추가해 순환 참조를 끊는다. `w-full`(`width: 100%`)은 `items-start/items-end`의 content-sizing을 덮어써서 bubble row를 definite width(컨테이너 전체 너비)로 고정한다. 이로써 `max-w-[78%]`가 full-width 기준의 78%로 정상 계산된다.

## 변경 사항

**파일:** `components/messages/ThreadView.tsx` 단 한 파일, +3줄.

### 변경 1 — bubble row (line 334)

```tsx
// Before
<div className={cn('flex items-end gap-1.5', isSelf && 'flex-row-reverse')}>

// After
<div className={cn('flex items-end gap-1.5 w-full', isSelf && 'flex-row-reverse')}>
```

### 변경 2 — RFP Chip (line 325–331)

Chip도 동일한 순환 참조 구조(`max-w-[78%]`가 content-sized parent 참조)이므로, `w-full` wrapper를 추가해 올바른 containing block을 제공한다.

```tsx
// Before
{rfp && (
  <Chip
    color="surface"
    icon={<span className="md-numeric">{rfp.code}</span>}
    label={rfp.title}
    className="max-w-[78%]"
  />
)}

// After
{rfp && (
  <div className="w-full">
    <Chip
      color="surface"
      icon={<span className="md-numeric">{rfp.code}</span>}
      label={rfp.title}
      className="max-w-[78%]"
    />
  </div>
)}
```

## 사이드 이펙트 없음

- **Self 메시지:** `flex-row-reverse`로 항목이 오른쪽부터 채워지므로 `w-full` 추가 후에도 시각 변화 없음
- **읽음 영수증, 날짜 구분선, 타이핑 인디케이터:** bubble row 외부 요소라 영향 없음
- **다른 파일:** 변경 없음

## 테스트

jsdom은 CSS layout을 실행하지 않으므로 별도 regression test 추가 없이 시각 확인으로 검증한다. 기존 `ThreadView.test.tsx`의 구조 테스트는 영향 없이 통과해야 한다.
