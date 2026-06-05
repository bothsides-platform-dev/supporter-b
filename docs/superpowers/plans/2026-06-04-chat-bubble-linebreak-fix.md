# Chat Bubble Linebreak Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `max-w-[78%]` 순환 참조로 인해 non-self 말풍선이 글자 단위로 줄바꿈되는 버그를 수정한다.

**Architecture:** `components/messages/ThreadView.tsx` 한 파일만 수정. bubble row div에 `w-full` 추가, RFP Chip에 `w-full` wrapper 추가. 두 변경 모두 CSS 클래스 조정이며 로직·데이터·테스트 변경 없음.

**Tech Stack:** Next.js App Router, Tailwind CSS v4, React 19

---

## File Map

| 역할 | 파일 |
|---|---|
| Modify | `components/messages/ThreadView.tsx` (line 325–350) |

---

### Task 1: bubble row에 `w-full` 추가

**Files:**
- Modify: `components/messages/ThreadView.tsx:334`

`w-full`이 `items-start/items-end`의 content-sizing을 덮어써서 bubble row를 definite width로 고정. 이로써 bubble div의 `max-w-[78%]`가 컨테이너 전체 너비 기준으로 정상 계산됨.

- [ ] **Step 1: 변경 적용**

`components/messages/ThreadView.tsx` line 334를 다음과 같이 수정한다:

```tsx
// Before
<div className={cn('flex items-end gap-1.5', isSelf && 'flex-row-reverse')}>

// After
<div className={cn('flex items-end gap-1.5 w-full', isSelf && 'flex-row-reverse')}>
```

- [ ] **Step 2: 기존 테스트 통과 확인**

```bash
pnpm test components/messages/__tests__/ThreadView.test.tsx
```

Expected: 모든 테스트 PASS (구조·동작 변경 없음)

- [ ] **Step 3: 커밋**

```bash
git add components/messages/ThreadView.tsx
git commit -m "fix(messages): add w-full to bubble row to fix max-w-[78%] circular reference"
```

---

### Task 2: RFP Chip에 `w-full` wrapper 추가

**Files:**
- Modify: `components/messages/ThreadView.tsx:325–332`

RFP Chip도 동일한 순환 참조 구조를 가짐. `w-full` wrapper div가 올바른 containing block을 제공해 Chip의 `max-w-[78%]`가 컨테이너 너비 기준으로 동작하게 한다.

- [ ] **Step 1: 변경 적용**

`components/messages/ThreadView.tsx` line 325–331을 다음과 같이 수정한다:

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

- [ ] **Step 2: 기존 테스트 통과 확인**

```bash
pnpm test components/messages/__tests__/ThreadView.test.tsx
```

Expected: 모든 테스트 PASS

- [ ] **Step 3: 커밋**

```bash
git add components/messages/ThreadView.tsx
git commit -m "fix(messages): wrap RFP chip with w-full to fix max-w-[78%] circular reference"
```

---

### Task 3: 전체 테스트 및 타입 검사

- [ ] **Step 1: 전체 테스트 실행**

```bash
pnpm test
```

Expected: 기존 테스트 모두 PASS. ThreadView 관련 테스트 포함.

- [ ] **Step 2: 타입 검사**

```bash
pnpm tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 린트**

```bash
pnpm lint
```

Expected: 에러 없음
