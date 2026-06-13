# 호스트 기반 가입 경로 분기 (RoleChooser 제거)

- 작성일: 2026-06-13
- 상태: 설계 승인됨, 구현 대기
- 기준 브랜치: `origin/dev` (`18471d7`)

## 1. 목표

회원가입 시 사용자가 buyer/PG 역할을 **수동으로 선택하지 않게** 한다. 역할은 **요청 호스트**로 결정하며, 루트 랜딩 페이지(`app/page.tsx`)가 이미 사용하는 호스트 분기 규칙과 정확히 일치시킨다.

현재는 `/signup` 진입 시 `RoleChooser`("어떤 계정으로 시작할까요?")로 buyer/PG를 고른 뒤 `/signup/buyer` 또는 `/signup/pg`로 이동한다. 이 중간 선택 화면을 제거한다.

## 2. 배경 — 현재 구조

- `/signup` (`app/(public)/signup/page.tsx`) — client 컴포넌트. `RoleChooser`로 역할 선택 → draft에 `workspaceType`·`next` 기록 → `/signup/{buyer,pg}`로 `router.push`.
- `/signup/buyer`, `/signup/pg` — **이미 분리된 역할별 흐름**. 각자 step-1 제출 시 `setWorkspaceType('buyer'|'pg')` + `writeSignupDraft({...})`로 역할을 직접 확정한다 (`buyer/page.tsx:69`, `pg/page.tsx:81`). 즉 RoleChooser의 역할 설정은 **이미 중복**이며, 제거해도 draft 상태 손실 없음.
- 루트 랜딩 `app/page.tsx`가 이미 호스트로 분기한다:
  ```ts
  if (hostServes(host, appOrigins()) === 'pg') return <PgLanding/>;
  // 그 외 → buyer 랜딩
  ```
- 호스트 판별은 `lib/site-routing.ts`의 `hostServes(host, origins)`가 담당. `partner` 호스트 → `'pg'`, `buyer` 호스트 → `'buyer'`, 그 외/단일호스트 → `null`.
- 환경변수는 **이미 2-host로 설정됨**:
  - `.env` (local dev): `NEXT_PUBLIC_BUYER_ORIGIN=http://lvh.me:3000`, `NEXT_PUBLIC_PARTNER_ORIGIN=http://partner.lvh.me:3000` — 둘 다 127.0.0.1로 풀리는 공개 DNS이므로 **local에서도 진짜 two-host로 동작**.
  - prod: `supporter-b.com` / `partner.supporter-b.com`.
  - `.env.example`만 `localhost`(단일호스트)로 적혀 있음 — 본 작업과 무관.

## 3. 핵심 규칙 (단일)

```
hostServes(host) === 'pg'  →  /signup/pg
그 외 (buyer 호스트 · 단일호스트 host=null · 알 수 없는 호스트)  →  /signup/buyer
```

랜딩 페이지와 동일하게 **"호스트를 모르면 buyer"**. 별도의 null 폴백 분기를 두지 않는다. 이 한 규칙으로 prod·local·알 수 없는 호스트가 모두 결정론적으로 처리된다.

근거: prod에서 PG는 항상 partner 호스트(PgLanding CTA → `/signup/pg` 직접, 또는 partner 호스트 bare `/signup` → pg)로 진입하므로, 알 수 없는 호스트의 bare `/signup`을 buyer로 떨어뜨려도 실사용자에게 안전하다.

## 4. 변경 사항

### 4.1 새 순수 헬퍼 — `lib/site-routing.ts`

```ts
/** Which signup entry path a request host should land on. Unknown host → buyer (mirrors the root landing). */
export function signupTargetForHost(
  host: string | null,
  origins: AppOrigins,
): '/signup/buyer' | '/signup/pg' {
  return hostServes(host, origins) === 'pg' ? '/signup/pg' : '/signup/buyer';
}
```

- `app/page.tsx`의 랜딩 분기와 동일 의미. 순수 함수이므로 단위 테스트 용이.

### 4.2 `app/(public)/signup/page.tsx` — server 컴포넌트로 전환

- client `RoleChooser` 페이지 → **server 컴포넌트**.
- `headers()`로 `host`를 읽고 `signupTargetForHost(host, appOrigins())`로 목적지 계산 → `redirect(target + 원본 쿼리스트링)`.
- **쿼리스트링 보존 필수**: `/signup?next=…` → `/signup/buyer?next=…`. (회귀 방지, §5 참조)
  - `searchParams`(async, Next 16)에서 원본 쿼리를 재구성해 목적지에 부착한다.
- UI 렌더 없음. 기존 `Suspense`/`RoleChooser`/draft 기록 로직 전부 제거.

### 4.3 step-1 페이지가 `next`를 직접 흡수 — `signup/buyer/page.tsx`, `signup/pg/page.tsx`

- 지금까지 RoleChooser가 `?next=`를 읽어 draft에 넣던 일을 step-1로 이관한다.
- `useSearchParams()`로 `next`를 읽어 `safeInternalNext`(`lib/auth/safe-next.ts`)를 통과시킨 뒤, 제출 시 `writeSignupDraft({ ...draft, next, ... })`에 병합.
- 이미 두 페이지 모두 `const draft = readSignupDraft(); writeSignupDraft({ ...draft, ... })` 패턴이므로 `next` 한 필드 추가로 충분.
- **이것이 핵심 회귀 방지 포인트** (§5).

### 4.4 삭제

- `components/auth/RoleChooser.tsx`
- `components/auth/__tests__/RoleChooser.test.tsx`
- step-1의 `← 이전으로` 링크 2곳 (`signup/buyer/page.tsx:152`, `signup/pg/page.tsx:187`) — 호스트 분기 후 자기 자신으로 되돌아오는 무의미한 루프가 됨. 바로 아래 `/login` 링크가 "잘못 왔어요"를 이미 커버하므로 제거.

### 4.5 그대로 유지 (영향 없음)

- 직접 CTA: `GuestHeader → /signup/buyer`, `RfpCreateWizard → /signup/buyer`, `invite/page → /signup/pg?token=`.
- `auth/verify`의 `/signup` 링크 ("다른 이메일로 변경" `:74`, "재발송" `:97`) — 이제 호스트 기준 자기 역할 step-1로 정확히 떨어지므로 오히려 개선. 변경 없음.
- step-1 각자의 `setWorkspaceType` / `writeSignupDraft` 역할 확정 로직 — 이미 존재, 유지.

## 5. 회귀 위험 — `next` 파라미터 스레딩

CTA → `/login?next=` → `/signup?next=` 경로로 복귀 경로(`next`)가 주입된다 (`components/auth/LoginSignupCallout.tsx:12`가 `/signup?next=…`로 링크하는 유일한 출처). 현재 이 `next`를 draft에 기록하는 주체는 **RoleChooser 뿐**이고, step-1 페이지는 `useSearchParams`로 `next`를 읽지 않는다.

따라서 RoleChooser를 제거하면 다음 둘을 반드시 함께 해야 `next` 스레딩이 깨지지 않는다:
1. server `/signup` redirect가 **쿼리스트링을 목적지로 전달** (§4.2).
2. step-1 페이지가 **URL의 `next`를 직접 흡수**해 draft에 병합 (§4.3).

## 6. 데이터 흐름 검증

| 진입 | 결과 |
|---|---|
| `supporter-b.com/signup` | → `/signup/buyer` |
| `partner.supporter-b.com/signup` | → `/signup/pg` |
| `lvh.me:3000/signup` (dev) | → `/signup/buyer` |
| `partner.lvh.me:3000/signup` (dev) | → `/signup/pg` |
| `localhost:3000/signup` (dev, 알 수 없는 호스트) | → `/signup/buyer` |
| `/signup?next=/rfp/x` (callout) | → `/signup/buyer?next=/rfp/x` → step-1이 `next` 흡수 |
| `/invite` → `/signup/pg?token=` | 변경 없음 (직접 진입) |
| `GuestHeader` / `RfpCreateWizard` → `/signup/buyer` | 변경 없음 (직접 진입) |

## 7. 테스트 (TDD)

RED → GREEN 순으로 진행한다. 각 단위 테스트가 빨갛게 떨어지는 것을 먼저 확인한다.

1. **`signupTargetForHost` 순수 단위 테스트** — `lib/__tests__/site-routing.test.ts`에 추가:
   - partner 호스트 → `/signup/pg`
   - buyer 호스트 → `/signup/buyer`
   - `null` / 알 수 없는 호스트 → `/signup/buyer`
2. **step-1 `next` 흡수 회귀 테스트** — `/signup/buyer?next=…` (그리고 pg) 마운트 → 제출 → `writeSignupDraft`에 `safeInternalNext`를 통과한 `next`가 포함되는지 확인. 안전하지 않은 `next`는 누락되는지도 확인.
3. **`RoleChooser.test.tsx` 삭제** — 컴포넌트 제거에 동반.

`app/**/page.tsx` shell의 server redirect 자체는 TDD 면제 범위(단순 컴포넌트 조립)지만, redirect를 구동하는 `signupTargetForHost`는 순수 함수로 추출해 테스트로 커버한다.

## 8. 영향 받는 파일 요약

| 파일 | 작업 |
|---|---|
| `lib/site-routing.ts` | `signupTargetForHost` 추가 |
| `lib/__tests__/site-routing.test.ts` | 헬퍼 테스트 추가 |
| `app/(public)/signup/page.tsx` | client RoleChooser → server redirect로 전환 |
| `app/(public)/signup/buyer/page.tsx` | `next` URL 흡수, `← 이전으로` 링크 제거 |
| `app/(public)/signup/pg/page.tsx` | `next` URL 흡수, `← 이전으로` 링크 제거 |
| `components/auth/RoleChooser.tsx` | 삭제 |
| `components/auth/__tests__/RoleChooser.test.tsx` | 삭제 |

## 9. 비목표 (YAGNI)

- env 변수 추가/변경 없음 (이미 2-host 설정됨).
- `.env.example`의 단일호스트 표기 변경은 본 작업 범위 밖.
- 워크스페이스 전환·로그인의 호스트 분기 로직은 손대지 않음 (`resolveHostRedirect` 등 그대로).
- bare `/signup`에 대한 별도 안내/에러 UI 없음 (즉시 redirect).
