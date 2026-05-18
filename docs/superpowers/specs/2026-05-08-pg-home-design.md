# PG Home Page Design

**Date**: 2026-05-08
**Status**: Approved

## Problem

PG 사용자가 로그인하면 `/home`이 `/inbox`로 리다이렉트한다. PG 전용 홈(대시보드) 화면이 없어서 수신 현황을 한눈에 파악할 수 없다.

## Decision Summary

- **라우팅**: `/home` = PG 대시보드 (신규), `/inbox` = 상세 전체 목록 (기존 유지)
- **컴포넌트 구조**: `home/page.tsx`에서 workspaceType에 따라 `<BuyerHome />` / `<PgHome />` 분기
- **KPI**: 전체 수신 · 응답 대기 · 제출 완료 · 수주 (4개)
- **리스트**: 2컬럼 — 왼쪽 응답 대기(마감 임박순), 오른쪽 최근 제출(3건)

## Architecture

### 컴포넌트 구조

```
app/(app)/home/page.tsx          — RSC, auth 후 workspaceType 분기
components/home/BuyerHome.tsx    — 기존 buyer home 콘텐츠 이전
components/home/PgHome.tsx       — 신규 PG 대시보드 (RSC)
```

`page.tsx`는 데이터 없이 세션만 읽고 각 컴포넌트에 `session`을 전달한다. 각 컴포넌트가 자체적으로 repo를 호출해 데이터를 가져온다.

### 데이터 흐름

```
page.tsx
  auth() → session
  workspaceType === 'pg'  → <PgHome userId workspaceId />
  workspaceType === 'buyer' → <BuyerHome workspaceId />

PgHome (RSC)  — 두 repo 병렬 호출
  getInvitationRepo().findByPgUser(userId)
    → pairs (invitation + rfp)
  getBidRepo().findByPgWs(workspaceId)
    → bids (submitted 상태, submittedAt 내림차순)

  pendingPairs  = pairs.filter(status: sent | opened), deadline 오름차순
  recentBids    = bids.filter(status: submitted).slice(0, 3)
  KPI 집계: total, pending, submitted, won
```

`won` KPI: `bids`에서 `rfp.awardedBidId === bid.id`인 것의 개수. `findByPgWs` 반환값에 RFP 정보가 없으면 `won = 0` 플레이스홀더로 처리 후 추후 연결.

"최근 제출" 섹션은 `Bid.submittedAt`(정렬 기준)과 `Bid.buyerStage`(상태 표시)가 필요하므로 invitation repo가 아닌 bid repo 데이터를 사용한다.

### KPI 정의

| 라벨 | 시리얼 | 값 |
|---|---|---|
| 전체 수신 | A | `pairs.length` |
| 응답 대기 | B | `pairs.filter(p => ['sent','opened'].includes(p.invitation.status)).length` |
| 제출 완료 | C | `pairs.filter(p => p.invitation.status === 'accepted').length` |
| 수주 | D | RFP `awardedBidId`가 자사 bid인 건 수 (v0 플레이스홀더 가능) |

### 리스트 섹션

**왼쪽 — 응답 대기** (status: `sent` | `opened`, `deadline` 오름차순, 전체 표시)

각 행:
- 제목 (13px medium)
- 서브: `rfpId · grade` (mono 11px, ink-soft)
- 우측: deadline D-day (≤3일이면 terracotta, 나머지 ink-muted)

빈 상태: `EmptyState` — "응답 대기 중인 제안이 없습니다." / "구매사가 초대한 RFP가 /inbox에 표시됩니다."

**오른쪽 — 최근 제출** (status: `accepted`, `submittedAt` 내림차순, 최근 3건)

각 행:
- 제목 (13px medium)
- 서브: `rfpId · 제출일` (mono 11px, ink-soft)
- 우측: buyerStage 텍스트 태그 (`[ 검토중 ]` / `[ 수주 ]` / `[ 미선정 ]`, 괄호 텍스트 컬러만, 필드 플레이스홀더)

빈 상태: `EmptyState` — "제출한 제안이 없습니다."

각 행은 `/inbox/[rfpId]`로 링크.

### `home/page.tsx` 변경

```tsx
// 기존: workspaceType !== 'buyer' → redirect('/inbox')
// 변경: PG는 <PgHome /> 렌더링, buyer는 <BuyerHome /> 렌더링

if (workspaceType === 'pg') return <PgHome userId={session.user.id} workspaceId={session.user.workspaceId} />;
if (workspaceType === 'buyer') return <BuyerHome workspaceId={session.user.workspaceId} />;
redirect('/login');
```

redirect('/inbox') 라인 제거. `/inbox`는 여전히 독립된 상세 목록 페이지로 유지.

### 로그인 리다이렉트

이전 작업(2026-05-08)에서 `loginAction`이 `workspaceType`을 반환하도록 수정 완료. PG 로그인 → `/inbox`가 아닌 `/home`으로 이동하도록 `login/page.tsx`를 추가 수정해야 함:

```tsx
// login/page.tsx — 현재
router.push(r.workspaceType === 'pg' ? '/inbox' : next);

// 변경 후 (PG home이 생기므로)
router.push(next);  // 모든 워크스페이스 타입이 /home으로 가도 됨
```

## Visual Design

Korean Editorial Modernism 규칙 준수:

- KPI 숫자: `font-mono tabular-nums`, 72–84px, font-weight 300
- 시리얼(A/B/C/D): `font-mono text-[10px] text-[var(--color-ink-faint)]`
- 섹션 라벨: `font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--color-ink-soft)]`
- 구분선: `border-[var(--color-hair)]`
- 행 hover: `hover:bg-[var(--color-paper-warm)]` + 좌측 2px ink 바 (기존 inbox/buyer home 패턴 동일)
- D-day 임박(≤3일): `text-[var(--color-terracotta)]`
- 상태 태그: 괄호 텍스트 컬러만 — `[ 검토중 ]` `[ 수주 ]` `[ 미선정 ]` (filled pill 금지)

## Files to Create/Modify

| 파일 | 변경 |
|---|---|
| `app/(app)/home/page.tsx` | 분기 로직으로 교체 (redirect 제거) |
| `components/home/BuyerHome.tsx` | 신규 — 기존 page.tsx 콘텐츠 이전 |
| `components/home/PgHome.tsx` | 신규 — PG 대시보드 구현 |
| `app/(public)/login/page.tsx` | PG redirect를 `/home`으로 통일 |

## Verification

1. PG 계정 로그인 → `/home` 직접 진입, KPI 4개 + 2컬럼 리스트 렌더링 확인
2. Buyer 계정 로그인 → 기존 buyer home 정상 렌더링 확인 (regression 없음)
3. PG 사용자 `/inbox` 직접 접근 → 기존 전체 목록 정상 렌더링 확인
4. 응답 대기 0건일 때 EmptyState 렌더링 확인
5. 최근 제출 0건일 때 EmptyState 렌더링 확인
6. `pnpm tsc --noEmit` — 타입 에러 없음
7. `pnpm lint` — 신규 파일 lint 에러 없음
