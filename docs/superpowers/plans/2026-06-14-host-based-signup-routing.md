# 호스트 기반 가입 경로 분기 (RoleChooser 제거) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원가입 시 buyer/PG를 수동 선택하지 않고 요청 호스트로 자동 분기하여, `/signup`의 RoleChooser 중간 화면을 제거한다.

**Architecture:** 루트 랜딩(`app/page.tsx`)이 이미 쓰는 호스트 분기 규칙을 그대로 가입에 적용한다. `lib/site-routing.ts`에 순수 헬퍼 `signupTargetForHost(host, origins)`를 추가하고, `/signup`을 client RoleChooser 페이지에서 server redirect 페이지로 전환한다. `?next=` 복귀 경로는 redirect가 목적지로 전달하고, step-1 페이지가 URL에서 직접 흡수한다.

**Tech Stack:** Next.js App Router(server component + `redirect()`/`headers()`), React `Suspense` + `useSearchParams`, Vitest + Testing Library.

**기준 브랜치:** `origin/dev` (`18471d7`). 작업 worktree: `.claude/worktrees/feat+host-based-signup-routing` (브랜치 `worktree-feat+host-based-signup-routing`).

**참고 스펙:** `docs/superpowers/specs/2026-06-13-host-based-signup-routing-design.md`

---

## File Structure

| 파일 | 책임 | 작업 |
|---|---|---|
| `lib/site-routing.ts` | 호스트 → 워크스페이스/경로 매핑 (순수) | `signupTargetForHost` 추가 |
| `lib/__tests__/site-routing.test.ts` | site-routing 단위 테스트 | `signupTargetForHost` 테스트 추가 |
| `app/(public)/signup/page.tsx` | bare `/signup` 진입점 | client RoleChooser → server host redirect |
| `app/(public)/signup/buyer/page.tsx` | buyer step-1 (계정) | URL `next` 흡수, Suspense 래핑, `← 이전으로` 제거 |
| `app/(public)/signup/pg/page.tsx` | pg step-1 (계정) | URL `next` 흡수, Suspense 래핑, `← 이전으로` 제거 |
| `components/auth/__tests__/SignupEmailPage.test.tsx` | step-1 단위 테스트 | `useSearchParams` mock + `next` 흡수 테스트 추가 |
| `components/auth/RoleChooser.tsx` | (제거됨) 역할 선택 카드 | 삭제 |
| `components/auth/__tests__/RoleChooser.test.tsx` | (제거됨) | 삭제 |

---

## 사전 메모 (환경 함정 — 시작 전 1회 확인)

- **node_modules 심볼릭 링크**: 이 worktree의 `node_modules`는 메인 저장소로 심볼릭 링크돼야 vitest가 네이티브 바인딩을 찾는다. 이미 링크돼 있어야 하지만 vitest가 `rolldown-binding.darwin-arm64.node MODULE_NOT_FOUND`로 죽으면: `ln -s /Users/yeonseong/project/bidit/node_modules node_modules`.
- **`pnpm typecheck`는 clean HEAD에서도 RED**: 무관한 wizard 테스트 파일들이 vitest globals(`vi`/`describe`/`expect`)를 import 없이 써서 ~140개 에러가 난다. 본 작업과 무관. 우리 변경분만 보려면: `pnpm typecheck 2>&1 | grep -vE "Cannot find name '(vi|describe|it|expect|beforeEach)'"`.
- **전체 `pnpm test`는 느리고 플레이키**. RED/GREEN 게이트는 항상 **단일 파일 실행**으로 확인한다.
- **절대경로 함정**: 모든 Read/Write/Edit는 `.claude/worktrees/feat+host-based-signup-routing/` 아래 경로로. 실수로 메인 저장소를 건드리면 vitest가 수정 안 된 사본을 돌린다.

---

## Task 1: `signupTargetForHost` 순수 헬퍼 (TDD)

**Files:**
- Modify: `lib/site-routing.ts`
- Test: `lib/__tests__/site-routing.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/__tests__/site-routing.test.ts` 상단의 import에 `signupTargetForHost`를 추가한다. 현재(1-7행):

```ts
import {
  hostServes,
  resolveHostRedirect,
  workspaceSwitchTarget,
  type AppOrigins,
} from '../site-routing';
```

다음으로 교체:

```ts
import {
  hostServes,
  resolveHostRedirect,
  workspaceSwitchTarget,
  signupTargetForHost,
  type AppOrigins,
} from '../site-routing';
```

그리고 파일 맨 끝(83행 마지막 `});` 다음)에 새 describe 블록을 추가한다:

```ts

describe('signupTargetForHost', () => {
  it('routes the partner host to the pg signup flow', () => {
    expect(signupTargetForHost('partner.supporter-b.com', PROD)).toBe('/signup/pg');
  });
  it('routes the buyer host to the buyer signup flow', () => {
    expect(signupTargetForHost('supporter-b.com', PROD)).toBe('/signup/buyer');
  });
  it('falls back to the buyer flow for an unknown host or null (mirrors the landing)', () => {
    expect(signupTargetForHost('52.78.126.178', PROD)).toBe('/signup/buyer');
    expect(signupTargetForHost(null, PROD)).toBe('/signup/buyer');
  });
  it('falls back to the buyer flow in single-host local/dev', () => {
    expect(signupTargetForHost('localhost', LOCAL)).toBe('/signup/buyer');
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm test lib/__tests__/site-routing.test.ts`
Expected: FAIL — `signupTargetForHost is not a function` (또는 import 해석 실패).

- [ ] **Step 3: 최소 구현 작성**

`lib/site-routing.ts` 파일 맨 끝(55행 `}` 다음)에 추가한다:

```ts

/** Which signup entry path a request host should land on. Unknown host → buyer (mirrors the root landing in app/page.tsx). */
export function signupTargetForHost(
  host: string | null,
  origins: AppOrigins,
): '/signup/buyer' | '/signup/pg' {
  return hostServes(host, origins) === 'pg' ? '/signup/pg' : '/signup/buyer';
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `pnpm test lib/__tests__/site-routing.test.ts`
Expected: PASS (기존 + 신규 4개 모두 green).

- [ ] **Step 5: 커밋**

```bash
git add lib/site-routing.ts lib/__tests__/site-routing.test.ts
git commit -m "feat(site-routing): add signupTargetForHost host→signup-path resolver

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `/signup`을 server host redirect로 전환 + RoleChooser 삭제

이 태스크는 page shell 전환 + 컴포넌트 삭제다 (스펙 §7 TDD 면제). 검증은 Task 1의 헬퍼 테스트 + typecheck로 한다.

**Files:**
- Modify(전체 교체): `app/(public)/signup/page.tsx`
- Delete: `components/auth/RoleChooser.tsx`
- Delete: `components/auth/__tests__/RoleChooser.test.tsx`

- [ ] **Step 1: `app/(public)/signup/page.tsx` 전체 교체**

파일 전체를 다음으로 교체한다 (`'use client'` 제거 → server component):

```tsx
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { appOrigins, signupTargetForHost } from '@/lib/site-routing';
import { safeInternalNext } from '@/lib/auth/safe-next';

/**
 * bare `/signup` 진입점. 사용자에게 역할 선택을 묻지 않고 요청 호스트로 분기한다.
 *   - partner 호스트            → /signup/pg
 *   - 그 외(buyer·단일호스트·미상) → /signup/buyer  (루트 랜딩 app/page.tsx와 동일 규칙)
 * CTA 복귀 경로(?next=)는 목적지로 전달하고, step-1 페이지가 흡수한다.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const host = (await headers()).get('host');
  const target = signupTargetForHost(host, appOrigins());

  const sp = await searchParams;
  const next = safeInternalNext(typeof sp.next === 'string' ? sp.next : null);

  redirect(next ? `${target}?next=${encodeURIComponent(next)}` : target);
}
```

- [ ] **Step 2: RoleChooser와 그 테스트 삭제**

```bash
git rm components/auth/RoleChooser.tsx components/auth/__tests__/RoleChooser.test.tsx
```

- [ ] **Step 3: RoleChooser 잔여 참조가 없는지 확인**

Run: `grep -rn "RoleChooser" app components lib --include="*.ts" --include="*.tsx"`
Expected: 결과 없음 (빈 출력). 만약 남아 있으면 해당 import를 제거한다.

- [ ] **Step 4: 타입체크로 회귀 없음 확인**

Run: `pnpm typecheck 2>&1 | grep -vE "Cannot find name '(vi|describe|it|expect|beforeEach)'" | grep -iE "signup|site-routing|RoleChooser"`
Expected: 빈 출력 (우리 변경 파일에 새 타입 에러 없음). 다른 사전존재 에러는 무시.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(signup): redirect bare /signup by host, remove RoleChooser

bare /signup is now a server component that resolves buyer/pg by request
host (mirrors the root landing) and forwards ?next=. The manual role
chooser screen is deleted.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: step-1 페이지가 URL `next`를 흡수 + `← 이전으로` 제거 (TDD)

`next` 흡수가 핵심 회귀 방지 포인트다(스펙 §5). 테스트를 먼저 빨갛게 만든 뒤 buyer/pg 페이지를 고친다.

**Files:**
- Modify: `components/auth/__tests__/SignupEmailPage.test.tsx`
- Modify: `app/(public)/signup/buyer/page.tsx`
- Modify: `app/(public)/signup/pg/page.tsx`

- [ ] **Step 1: 테스트 mock 갱신 + 실패 테스트 추가**

`components/auth/__tests__/SignupEmailPage.test.tsx`를 세 군데 수정한다.

(a) `next/navigation` mock(12-16행)을 교체한다. 현재:

```ts
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));
```

다음으로 교체:

```ts
const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));
```

(b) 기존 두 describe(`BuyerSignupEmailPage — 새 step 1 흐름`, `PgSignupEmailPage — 새 step 1 흐름`)의 `beforeEach`가 `render(...)`를 호출하기 **직전에** searchParams를 비운다. 각 `beforeEach`에서 `mockCheckEmailAvailable.mockResolvedValue({ ok: true });` 줄 바로 다음, `render(...)` 줄 바로 앞에 다음 줄을 추가한다:

```ts
    mockSearchParams = new URLSearchParams();
```

(초대 모드 describe는 `render`를 각 `it` 안에서 호출하므로 동일하게 `beforeEach` 끝에 위 한 줄을 추가한다.)

(c) 파일 맨 끝(마지막 `});` 다음)에 새 describe를 추가한다:

```ts

describe('SignupEmailPage — next 파라미터 흡수', () => {
  beforeEach(() => {
    mockDraftData = {};
    mockPush.mockReset();
    mockReplace.mockReset();
    mockWriteDraft.mockReset();
    mockCheckEmailAvailable.mockReset();
    mockCheckEmailAvailable.mockResolvedValue({ ok: true });
    mockSearchParams = new URLSearchParams('next=/rfp/abc');
  });

  it('buyer: URL의 next를 draft에 저장한다', async () => {
    render(<BuyerSignupEmailPage />);
    await fillAndSubmit();
    await waitFor(() => expect(mockWriteDraft).toHaveBeenCalled());
    const drafted = mockWriteDraft.mock.calls[0][0] as Record<string, unknown>;
    expect(drafted.next).toBe('/rfp/abc');
  });

  it('pg: URL의 next를 draft에 저장한다', async () => {
    render(<PgSignupEmailPage />);
    await fillAndSubmit({ email: 'sales@toss.im' });
    await waitFor(() => expect(mockWriteDraft).toHaveBeenCalled());
    const drafted = mockWriteDraft.mock.calls[0][0] as Record<string, unknown>;
    expect(drafted.next).toBe('/rfp/abc');
  });

  it('안전하지 않은 next(프로토콜-상대 URL)는 흡수하지 않는다', async () => {
    mockSearchParams = new URLSearchParams('next=//evil.com');
    render(<BuyerSignupEmailPage />);
    await fillAndSubmit();
    await waitFor(() => expect(mockWriteDraft).toHaveBeenCalled());
    const drafted = mockWriteDraft.mock.calls[0][0] as Record<string, unknown>;
    expect(drafted.next).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm test components/auth/__tests__/SignupEmailPage.test.tsx`
Expected: FAIL — `buyer: URL의 next를 draft에 저장한다`, `pg: URL의 next를 draft에 저장한다`에서 `drafted.next`가 `undefined`라 `toBe('/rfp/abc')` 실패. (기존 테스트와 "안전하지 않은 next" 테스트는 통과.)

- [ ] **Step 3: buyer 페이지 구현 — `app/(public)/signup/buyer/page.tsx`**

(a) import 수정. 3-4행:

```ts
import { useState } from 'react';
import { useRouter } from 'next/navigation';
```
→
```ts
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
```

`checkEmailAvailableAction` import(16행) 바로 다음 줄에 추가:

```ts
import { safeInternalNext } from '@/lib/auth/safe-next';
```

(b) 기본 export 함수를 내부 컴포넌트로 이름 변경. 20행:

```ts
export default function BuyerSignupEmailPage() {
```
→
```ts
function BuyerSignupEmailForm() {
```

(c) `const router = useRouter();`(21행) 바로 다음 줄에 추가:

```ts
  const searchParams = useSearchParams();
```

(d) handleSubmit 내부 `writeSignupDraft` 호출(71-78행)을 교체한다. 현재:

```ts
    const draft = readSignupDraft();
    writeSignupDraft({
      ...draft,
      email,
      password,
      agreedAt,
      workspaceType: 'buyer',
    });
```
→
```ts
    const draft = readSignupDraft();
    const nextParam = safeInternalNext(searchParams.get('next'));
    writeSignupDraft({
      ...draft,
      email,
      password,
      agreedAt,
      workspaceType: 'buyer',
      ...(nextParam ? { next: nextParam } : {}),
    });
```

(e) `← 이전으로` 링크 제거. 151-157행의 다음 블록을 삭제한다 (`<div className="text-center space-y-2">`와 `/login` 링크는 유지):

```tsx
        <Link
          href="/signup"
          className="block font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
        >
          ← 이전으로
        </Link>
```

(f) 파일 맨 끝, 닫는 `}` 다음에 새 기본 export(Suspense 래퍼)를 추가한다:

```tsx

export default function BuyerSignupEmailPage() {
  return (
    <Suspense
      fallback={
        <p className="font-mono text-[12px] tracking-[0.16em] uppercase text-center">
          LOADING…
        </p>
      }
    >
      <BuyerSignupEmailForm />
    </Suspense>
  );
}
```

- [ ] **Step 4: pg 페이지 구현 — `app/(public)/signup/pg/page.tsx`**

(a) import 수정. 3-4행:

```ts
import { useState } from 'react';
import { useRouter } from 'next/navigation';
```
→
```ts
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
```

`checkEmailAvailableAction` import(16행) 바로 다음 줄에 추가:

```ts
import { safeInternalNext } from '@/lib/auth/safe-next';
```

(b) 기본 export 함수를 내부 컴포넌트로 이름 변경. 20행:

```ts
export default function PgSignupEmailPage() {
```
→
```ts
function PgSignupEmailForm() {
```

(c) `const router = useRouter();`(21행) 바로 다음 줄에 추가:

```ts
  const searchParams = useSearchParams();
```

(d) handleSubmit 내부 `writeSignupDraft` 호출(83-89행)을 교체한다. 현재:

```ts
    writeSignupDraft({
      ...draft,
      email,
      password,
      agreedAt,
      workspaceType: 'pg',
    });
```
→
```ts
    const nextParam = safeInternalNext(searchParams.get('next'));
    writeSignupDraft({
      ...draft,
      email,
      password,
      agreedAt,
      workspaceType: 'pg',
      ...(nextParam ? { next: nextParam } : {}),
    });
```

(`draft`는 이미 25행에서 읽으므로 재선언하지 않는다.)

(e) `← 이전으로` 링크 제거. 186-191행의 다음 블록을 삭제한다 (`{!isInvited && (...)}` 컨테이너와 `/login` 링크는 유지):

```tsx
          <Link
            href="/signup"
            className="block font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
          >
            ← 이전으로
          </Link>
```

(f) 파일 맨 끝, 닫는 `}` 다음에 새 기본 export(Suspense 래퍼)를 추가한다:

```tsx

export default function PgSignupEmailPage() {
  return (
    <Suspense
      fallback={
        <p className="font-mono text-[12px] tracking-[0.16em] uppercase text-center">
          LOADING…
        </p>
      }
    >
      <PgSignupEmailForm />
    </Suspense>
  );
}
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `pnpm test components/auth/__tests__/SignupEmailPage.test.tsx`
Expected: PASS — 기존 테스트 + 신규 3개 모두 green.

- [ ] **Step 6: 커밋**

```bash
git add app/\(public\)/signup/buyer/page.tsx app/\(public\)/signup/pg/page.tsx components/auth/__tests__/SignupEmailPage.test.tsx
git commit -m "feat(signup): absorb ?next= in step-1 pages, drop back-to-chooser link

step-1 buyer/pg pages now read next from the URL (sanitized) into the
draft — the job the removed RoleChooser used to do. The '← 이전으로'
links pointing at bare /signup are removed (host routing makes them a
self-loop).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 전체 검증 (typecheck · lint · 관련 테스트 · build)

`useSearchParams` + server component 전환은 빌드 단계에서만 드러나는 함정(Suspense 경계 누락)이 있으므로 `next build`까지 돌린다. (유닛 green ≠ build green.)

**Files:** 없음 (검증만)

- [ ] **Step 1: 변경 관련 단위 테스트 일괄 실행**

Run: `pnpm test lib/__tests__/site-routing.test.ts components/auth/__tests__/SignupEmailPage.test.tsx`
Expected: 전부 PASS.

- [ ] **Step 2: 타입체크 (사전존재 에러 필터)**

Run: `pnpm typecheck 2>&1 | grep -vE "Cannot find name '(vi|describe|it|expect|beforeEach)'"`
Expected: 우리가 만진 파일(`signup`, `site-routing`)에 대한 새 에러 없음. (남는 출력은 사전존재 wizard-globals 외 항목이 없어야 한다.)

- [ ] **Step 3: lint**

Run: `pnpm lint`
Expected: 변경 파일에 에러 없음.

- [ ] **Step 4: build (Suspense 경계 검증)**

Run: `pnpm build`
Expected: 성공. 특히 `/signup/buyer`·`/signup/pg`에서 `useSearchParams() should be wrapped in a suspense boundary` 에러가 **없어야** 한다 (Task 3에서 Suspense로 감쌌으므로). `/signup`은 동적 라우트로 빌드되어야 한다.

- [ ] **Step 5: (선택) 수동 스모크**

`.env`로 dev 서버를 띄우고 다음을 확인한다 (자동 테스트의 대체가 아닌 시각 확인용):
- `http://lvh.me:3000/signup` → `/signup/buyer`로 이동
- `http://partner.lvh.me:3000/signup` → `/signup/pg`로 이동
- `http://lvh.me:3000/signup?next=/rfp/x` → `/signup/buyer?next=/rfp/x`, 가입 1단계 제출 후 draft에 next 보존

---

## Self-Review (작성자 체크 — 구현 시작 전 참고)

- **Spec 커버리지**: §4.1 헬퍼 → Task 1. §4.2 server redirect → Task 2. §4.3 next 흡수 → Task 3. §4.4 삭제(RoleChooser+테스트, 백링크 2곳) → Task 2(컴포넌트)·Task 3(백링크). §5 회귀(쿼리 전달+흡수) → Task 2 Step1 + Task 3. §7 테스트(헬퍼·흡수·RoleChooser 삭제) → Task 1·3·2. 빌드 함정 → Task 4. 누락 없음.
- **Placeholder 스캔**: 모든 코드 스텝에 실제 코드 포함. TBD/TODO 없음.
- **타입 일관성**: `signupTargetForHost(host, origins)` 시그니처가 Task 1 정의 ↔ Task 2 사용 동일. `safeInternalNext`(기존 함수) 시그니처 `(string|null|undefined) → string|null` 그대로 사용. `next` draft 필드는 `SignupClientDraft.next?: string`(기존 정의)와 일치.
