# bidit — 기술 스펙 (Next.js 16)

> 짝 문서: [SCREEN_DESIGN.md](./SCREEN_DESIGN.md) (화면·IA·UX) · [DESIGN.md](./DESIGN.md) (디자인 시스템) · [IMPLEMENTATION.md](./IMPLEMENTATION.md) (구현 계획)
> 본 문서: 기술 스택, 디렉토리, 도메인 타입, 라우팅 전략

---

## 1. 목적과 범위

`PG_RFP_SPEC.md`의 PG 비공개 1:N RFP 흐름과 `DESIGN.md`의 디자인 시스템을 **Next.js 16 기반 프로덕션 코드**로 구현하기 위한 기술 스펙. M0~M5 범위는 구매사 RFP 작성 → PG 초대/응답 → 구매사 비교/수주 처리까지를 mock 데이터로 클릭스루하고, API/DB 연결 시에도 동일한 도메인 계약을 유지하는 것이 1차 목표다.

- 미적 방향·토큰·컴포넌트 시각 원칙은 [DESIGN.md](./DESIGN.md) 참조
- 마일스톤·부트스트랩 절차·검증 체크리스트는 [IMPLEMENTATION.md](./IMPLEMENTATION.md) 참조

**범위 외**
- v0 결재선/승인 워크플로우 (단일 결정자)
- 정산·매출 추적, 계약서 전자서명, 결제 연동
- SMS/Slack/KakaoWork/Push 알림
- 실제 PDF 생성·다운로드 (미리보기는 HTML로 모사, 첨부 PDF는 mock)
- 모바일 전용 작성 흐름 (데스크톱 우선)
- i18n (한국어 단일)

---

## 2. 기술 스택

| 레이어 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | **Next.js 16 (App Router)** | RSC + 라우트 그룹 + Turbopack 기본 |
| 언어 | **TypeScript (strict)** | 도메인 타입(제안·거래처·결재) 안전성 |
| 스타일 | **Tailwind CSS v4** + CSS Variables | 토큰을 `@theme`로 노출, 의미 변수 + 유틸리티 균형 |
| UI 구성 방식 | **shadcn/ui (코드 소유)** + **Radix UI Primitives** | Radix 접근성 기반 + 컴포넌트 소스 직접 소유/수정으로 디자인 시스템 일관성 유지 |
| 상태 (UI) | **Zustand** | Drawer/Cmdk 전역 토글, 폼 임시 저장 |
| 폼 | **react-hook-form** + **zod** | 제안 작성 폼 검증 |
| 테이블 엔진 | **TanStack Table v8** | 헤드리스 구조로 헤어라인 테이블/비교 매트릭스 커스텀 구현 용이 |
| 커맨드 팔레트 | **cmdk** | 키보드 중심 탐색 UX, `CommandPalette` 요구사항과 높은 적합도 |
| 폰트 | `next/font/local` 로 Pretendard Variable + JetBrains Mono | 자체 호스팅, FOIT/FOUT 방지 |
| 아이콘 | 자체 SVG 컴포넌트 (선형 1.4 stroke) | 시각 통일 |
| 모션 | **Motion** (구 Framer Motion) | 페이지 stagger·drawer 슬라이드 |
| Unit/Component Test | **Vitest** + **Testing Library** | 수수료·토큰·상태 전이·폼 검증과 컴포넌트 동작 |
| E2E Test | **Playwright** | 인증, RFP 발송, PG 응답, 비교·수주 클릭스루 |
| Lint/Format | ESLint + Prettier + `prettier-plugin-tailwindcss` | 클래스 정렬 자동화 |
| 패키지 매니저 | **pnpm** | workspace 확장 여지, 디스크 절감 |

### 권장 조합 채택안 (2026-05-05)

- 기본 UI: `shadcn/ui + Radix` 를 기준으로 시작하고, `DESIGN.md` 토큰에 맞게 로컬 컴포넌트에서 직접 수정한다.
- 테이블: `TanStack Table` 을 `components/primitives/DataTable.tsx` 와 `components/rfp/RfpDetail/BidComparisonTable.tsx` 의 공통 엔진으로 사용한다.
- 검색/액션: `cmdk` 를 `components/shell/CommandPalette.tsx` 의 핵심 엔진으로 사용한다.
- 원칙: 외부 라이브러리는 "행동/로직"만 빌리고, 시각 표현은 `DESIGN.md` 규칙에 맞춰 로컬 컴포넌트에서 통제한다.

### Next.js 16 적용 포인트 (부트스트랩 시 공식 문서 재확인)
- **Turbopack** 이 dev/build 기본 — `next dev` / `next build` 그대로 사용
- **`async params` / `async searchParams`** — 동적 라우트의 `params`, `searchParams`는 Promise 로 받아 `await` 필요
  ```ts
  export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
  }
  ```
- **`cacheComponents` (옵트인)** — `next.config.ts` 의 `experimental.cacheComponents: true` 활성화 후 `'use cache'` 디렉티브로 RSC 캐시 제어
- **React 19** 기반 — Actions, `useOptimistic`, `useFormStatus` 활용 가능

---

## 3. 디렉토리 구조 (M7+ 실제 상태, 2026-05-08)

```
bidit/
├─ app/
│  ├─ layout.tsx                       # 루트 레이아웃 (폰트, providers, Toaster)
│  ├─ globals.css                      # Tailwind v4 + styles/tokens.css 임포트
│  ├─ (public)/                        # 비인증 라우트 그룹
│  │  ├─ layout.tsx                    # 좁은 컬럼 + 워드마크 헤더 (DESIGN §5.11)
│  │  ├─ login/page.tsx                # P2 로그인
│  │  ├─ signup/                       # P3~P11 가입 + 검증 + 워크스페이스 생성
│  │  │  ├─ buyer/{verify,profile,workspace}/page.tsx
│  │  │  └─ pg/{verify,profile,workspace}/page.tsx
│  │  ├─ password/{forgot,reset}/page.tsx
│  │  ├─ auth/{verify,email-change}/page.tsx
│  │  └─ invite/, invite/rfp/[token]/page.tsx
│  ├─ (app)/                           # 인증 영역, AppShell 래핑
│  │  ├─ layout.tsx                    # AppShell + 서버 redirect 인증 가드 (middleware 없음)
│  │  ├─ home/page.tsx                 # buyer/pg 워크스페이스 대시보드
│  │  ├─ rfp/                          # B2~B5
│  │  │  ├─ layout.tsx, page.tsx, new/page.tsx
│  │  │  ├─ [id]/page.tsx              # 비교
│  │  │  └─ [id]/award/page.tsx
│  │  ├─ inbox/                        # P2~P4
│  │  │  ├─ layout.tsx, page.tsx
│  │  │  ├─ [rfpId]/page.tsx           # 제안 작성
│  │  │  └─ [rfpId]/submitted/page.tsx
│  │  └─ settings/{profile,members,notifications}/page.tsx
│  ├─ api/                             # 서버 핸들러 (auth, sse, outbox 등)
│  ├─ logout/route.ts                  # POST 핸들러
│  └─ sentry-example-page/             # Sentry 검증
│
├─ components/
│  ├─ shell/                           # AppShell, IconSidebar, Topbar, Subnav, Footer,
│  │                                   # CommandPalette, GlobalShortcuts,
│  │                                   # NotificationDrawer, Toaster
│  ├─ primitives/                      # 16종: Avatar, Button, Chip, DataTable,
│  │                                   # EmptyState, Eyebrow, IconButton, KpiCell,
│  │                                   # Logo, PageEnter, PermissionGate, RoleBadge,
│  │                                   # Select, Serial, Tabs, Tag
│  ├─ icons/index.tsx                  # 자체 SVG (line, 1.4 stroke)
│  ├─ ui/                              # shadcn-derived (sidebar 등)
│  ├─ auth/                            # 가입 폼·검증 위젯
│  ├─ rfp/                             # 작성·비교·award (BidBoard 포함)
│  ├─ inbox/                           # 제안 작성·제출 상태
│  ├─ settings/                        # 워크스페이스 프로필·멤버·알림
│  └─ landing/                         # 마케팅 영역
│
├─ lib/                                # mock/ 제거됨 (M8 완료)
│  ├─ auth/                            # Auth.js v5 헬퍼
│  ├─ db/                              # Drizzle schema·client·queries
│  ├─ server/                          # repositories, outbox, token, rfp-state
│  ├─ integrations/                    # Resend, NTS enrichment, Sentry 어댑터
│  ├─ stores/                          # Zustand UI 토글, RFP draft
│  ├─ hooks/                           # 서버·클라 공용 훅
│  ├─ validation/                      # zod 스키마
│  ├─ landing/                         # 랜딩 콘텐츠 데이터
│  ├─ format.ts, site-config.ts, toast.ts, utils.ts
│  └─ types/ (deprecated — types/ 루트로 이동)
│
├─ types/                              # 도메인 타입 (workspace, rfp, bid, ...)
├─ hooks/                              # 클라이언트 훅 (sse 구독 등)
├─ styles/tokens.css                   # 디자인 토큰 (DESIGN.md §2~4 sync)
├─ drizzle/                            # 마이그레이션 SQL
├─ e2e/                                # Playwright 시나리오 (A/B/C)
├─ scripts/                            # seed, codegen, NTS 등
├─ public/                             # fonts/, images/, og 메타
│
├─ auth.ts, auth.config.ts             # Auth.js v5 (node + edge)
├─ next.config.ts                      # Sentry, Turbopack
├─ tsconfig.json, package.json, pnpm-lock.yaml
└─ (Tailwind v4 — tailwind.config 파일 없음, @theme 블록만)
```

---

## 4. 디자인 시스템

토큰 정의·타이포·컬러·컴포넌트 시각 원칙·모션·금지 목록은 모두 [DESIGN.md](./DESIGN.md) 에서 관리한다. 본 스펙은 그 토큰을 **어디에 어떻게 배치할지**만 다룬다.

- `styles/tokens.css` — `@theme {}` 블록에 DESIGN.md §2~4 의 토큰을 그대로 정의
- `tailwind.config.ts` — `theme.extend` 에서 `var(--color-...)` 참조
- `app/globals.css` — `@import "tailwindcss"; @import "../styles/tokens.css";`
- `next/font/local` — `public/fonts/` 의 Pretendard Variable / JetBrains Mono Variable 로드 후 CSS 변수 `--font-sans`, `--font-mono` 에 바인딩

DESIGN.md 가 변경되면 `tokens.css` 만 동기화하면 되도록 단방향 의존을 유지한다.

### 4.1 디자인 컴포넌트 검토 반영 (우선 구현 대상)

`DESIGN.md §5`(컴포넌트 시각 원칙) 기준으로, 구현 우선순위와 수용 기준을 아래처럼 고정한다.

| 컴포넌트 | 구현 파일 | 필수 규칙 (Acceptance) |
|---|---|---|
| Tag | `components/primitives/Tag.tsx` | 브래킷 + mono + uppercase, 상태는 텍스트 컬러 중심, 풀 배경 금지 |
| DataTable | `components/primitives/DataTable.tsx` | 행 배경 기본 없음, 1px hairline, hover 시 첫 셀 좌측 8px 마커 + warm 배경 |
| KpiCell | `components/primitives/KpiCell.tsx` | 숫자 84px/300, 라벨 mono uppercase, 델타(↑/↓/—) 모노 표기 |
| Form Section | `components/rfp/RfpCreateForm.tsx`, `components/inbox/BidForm.tsx` | 카드 박스 금지, 하단선 입력 패턴, 포커스 시 하단선 강조 |
| PDF Preview A4 | `components/rfp/RfpDetail/ProposalPdfPreview.tsx` | A4 비율, 허용 그림자 1종만 사용, 선택 Bid 변경 시 즉시 전환 |
| Notification Drawer | `components/shell/NotificationDrawer.tsx` | 우측 슬라이드(폭 420), 진입 `translateX(100%)→0` → [NOTIFICATION.md](./NOTIFICATION.md) |
| Command Palette | `components/shell/CommandPalette.tsx` | 폭 620, 12vh top, 그룹 헤더 mono uppercase, 우측 메타 모노 |
| EmptyState | `components/primitives/EmptyState.tsx` | 컬러 일러스트 금지, 라인 SVG + 본문 + CTA 1개 |

### 4.2 PG 비교 도메인 컴포넌트 계약

M0~M5의 비교 UI는 `PG_RFP_SPEC.md §6` 시나리오 C 기준으로 6개 정형 수치 비교, 정렬, 제안서 PDF 프리뷰, 수주 처리에 집중한다. 차트·시나리오 시뮬레이션·신뢰도 점수는 v0 이후 분석 기능으로 미룬다.

- **BidComparisonTable**
  - 목적: 공급사별 핵심 조건을 동일 축으로 비교
  - 규칙: 숫자 셀 전부 `font-mono + tabular-nums + right-align`
- **DecisionTimeline**
  - 목적: 요청→수신→검토→결재→확정 이력 추적
  - 규칙: 각 이벤트는 시각 + 주체 + 근거 코멘트 포함
- **ProposalPdfPreview**
  - 목적: 선택한 Bid의 제안서 PDF를 같은 화면에서 확인
  - 규칙: Bid 행 선택 시 300ms 이내 프리뷰 전환

### 4.3 화면 배치 원칙 (PG 비교)

- `/rfp`: RFP 상태 탭 + 초대 PG 진행 상태 요약
- `/rfp/[id]`: `BidComparisonTable` + `ProposalPdfPreview` + `DecisionTimeline`
- `/rfp/new`: `BizLookupField` + `GradeConfirmPanel` + `PgEmailAllowlist`
- `/inbox/[rfpId]`: `RfpBriefPanel` + `BidForm` + `StatutoryCardFeeNotice`

비교 화면의 CTA(요청/결재/확정)는 동일 viewport 내에 유지하여, 비교 후 추가 이동 없이 행동으로 이어지게 한다.

---

## 5. 도메인 타입 (lib/types)

```ts
// lib/types/common.ts
export type Attachment = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  url: string;
};
```

```ts
// lib/types/workspace.ts
import type { BizProfile } from './biz-profile';
import type { User } from './user';

export type WorkspaceType = 'buyer' | 'pg';

export type Workspace = {
  id: string;
  type: WorkspaceType;
  name: string;
  domain?: string;          // pg 워크스페이스만. toss.im, inicis.com 등
  bizProfile?: BizProfile;  // buyer 워크스페이스의 사업자 프로필
  members: User[];
  createdAt: string;
};
```

```ts
// lib/types/user.ts
export type Role = 'admin' | 'member';

export type User = {
  id: string;
  name: string;
  email: string;
  avatarColor: 'lavender' | 'amber' | 'moss' | 'accent' | 'terra' | 'ink';
  role: Role;
  status: 'active' | 'paused';
  groupId?: string;
  joinedAt: string;
  lastSeenAt?: string;
};
```

```ts
// lib/types/biz-profile.ts
export type MerchantGrade = 'small' | 'sme1' | 'sme2' | 'sme3' | 'general';

// 슬림화 (BACKEND_MIGRATION 반영): name/ceoName/ksic/mailOrderNo/estimatedRevenue/revenueYear/niceLookedUpAt 제거.
// 회사명은 Workspace.name 사용. NICE/공정위 enrichment 는 v0 제외.
// 사업자번호·등급 모두 옵셔널. 둘 다 NULL 인 row 는 DB CHECK 로 금지.
export type BizProfile = {
  bizNo?: string;
  taxType?: 'general' | 'simple' | 'exempt';
  status?: 'active' | 'suspended' | 'closed';
  grade?: MerchantGrade;
  gradeSource: 'user_confirmed' | 'user_overridden' | 'unset';
  gradeConfirmedBy?: string;
  gradeConfirmedAt?: string;
};
```

```ts
// lib/types/rfp.ts
import type { Attachment } from './common';
import type { BizProfile } from './biz-profile';

export type RfpStatus = 'draft' | 'sent' | 'closed' | 'cancelled' | 'awarded';

export type RFP = {
  id: string;                 // RFP-2605-0001
  buyerWsId: string;
  bizProfile?: BizProfile;    // 발송 시점 스냅샷. bizNo·grade 모두 미입력 시 undefined.
  title: string;
  memo: string;
  rfpFiles: Attachment[];
  allowedPgEmails: string[];
  deadline: string;
  status: RfpStatus;
  awardedBidId?: string;
  createdBy: string;
  createdAt: string;
  sentAt?: string;
};
```

```ts
// lib/types/invitation.ts
export type InvitationStatus = 'sent' | 'opened' | 'accepted' | 'declined' | 'expired';

export type RfpInvitation = {
  id: string;
  rfpId: string;
  pgEmail: string;
  pgWsId?: string;
  acceptedByUserId?: string; // v0 RFP 접근 권한 주체
  uniqueToken: string;        // 원문은 발송 시점에만 사용. 저장은 해시.
  sentAt: string;
  openedAt?: string;
  expiresAt: string;          // RFP.deadline
  status: InvitationStatus;
};
```

```ts
// lib/types/bid.ts
import type { Attachment } from './common';
import type { MerchantGrade } from './biz-profile';

export type SettlementCycle = 'D+0' | 'D+1' | 'D+2' | 'weekly' | 'monthly';
export type CardIssuer =
  | 'BC' | 'SHINHAN' | 'SAMSUNG' | 'HYUNDAI' | 'KB'
  | 'LOTTE' | 'NH' | 'HANA' | 'WOORI';

export const STATUTORY_CARD_FEE: Record<MerchantGrade, number> = {
  small: 0.005,
  sme1: 0.011,
  sme2: 0.0125,
  sme3: 0.015,
  general: Number.NaN,
};

export type Bid = {
  id: string;
  rfpId: string;
  pgWsId: string;
  invitationId: string;
  settleCycle: SettlementCycle;
  deposit: number;
  setupFee: number;
  monthlyMin: number;
  bankTransferFeePct: number;
  easyPayFeePct: number;
  cardFeesByIssuer?: Record<CardIssuer, number>; // general 등급 전용
  overseasCardFeePct?: number;
  proposalPdf: Attachment;
  memo?: string;
  status: 'draft' | 'submitted' | 'withdrawn';
  submittedBy: string;
  submittedAt?: string;
};
```

```ts
// lib/types/contract.ts
export type Contract = {
  id: string;
  rfpId: string;
  bidId: string;
  awardedAt: string;
  awardedBy: string;
};
```

상태 전이와 서버 강제 규칙은 `SPEC.md §8.2~8.3` 이 authoritative 하다. 특히 영세/중소1~3 카드 수수료는 `STATUTORY_CARD_FEE` 로만 표시하고 PG 입력 UI와 API 입력을 모두 무시한다.

### 5.1 RFP 접근 권한 원칙

PG 워크스페이스는 이메일 도메인 기반 인증/소속 컨테이너다. 그러나 v0 RFP 접근권은 워크스페이스 전체가 아니라 `RfpInvitation.acceptedByUserId` 에 묶는다.

```
RFP invitation
  ├─ pgEmail matches authenticated user email
  ├─ domain creates/joins pg workspace
  ├─ invitation.acceptedByUserId = user.id
  └─ `/inbox/:rfpId` allows only acceptedByUserId for this invitation
```

같은 PG 도메인의 다른 멤버는 해당 RFP를 자동으로 볼 수 없다. 공유/위임은 v0 이후 별도 기능으로 설계한다.

---

## 6. AppShell 라우팅 전략

App Router 라우트 그룹 `(app)`에 공통 레이아웃을 두고, 워크스페이스 타입(`buyer`/`pg`)에 따라 `rfp/` 또는 `inbox/` 네비게이션을 보여준다. 섹션 디렉토리 자체 `layout.tsx`는 **Subnav만 교체**하고, 홈은 Subnav 없는 변형이다.

```tsx
// app/(app)/layout.tsx
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <IconSidebar />
      <Topbar />
      {children}
      <NotificationDrawer />
      <CommandPalette />
    </AppShell>
  );
}
```

```tsx
// app/(app)/rfp/layout.tsx
export default function RfpLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RfpSubnav />
      <main className="main">{children}</main>
    </>
  );
}
```

CSS Grid 영역 `sidebar / topbar / subnav / main` 4 영역. 자식 레이아웃이 `subnav` 자리에 렌더.

PG 워크스페이스는 같은 `AppShell`을 쓰되 `inbox/` 중심 Subnav를 렌더한다. buyer 사용자가 `/inbox/*`, pg 사용자가 `/rfp/*`로 직접 접근하면 워크스페이스 타입 가드가 403 또는 `/home` redirect를 반환한다.

---

## 7. Public 영역 라우팅 (인증/가입)

화면 명세는 [SCREEN_DESIGN.md §1](./SCREEN_DESIGN.md), 시각 규칙은 [DESIGN.md §5.11](./DESIGN.md), 토큰 정책·마일스톤은 [IMPLEMENTATION.md §8](./IMPLEMENTATION.md).

### 7.1 라우트 그룹 분리

```
app/
├─ (public)/                            # 비인증 영역, AuthShell
│  ├─ layout.tsx                        # 좁은 컬럼 레이아웃
│  ├─ login/page.tsx                    # P1
│  ├─ signup/
│  │  ├─ page.tsx                       # Rs1 — 가입 유형 선택
│  │  ├─ buyer/
│  │  │  ├─ page.tsx                    # Bs1 — 구매사 이메일 + 약관
│  │  │  ├─ verify/page.tsx             # Bs2 — 인증 대기
│  │  │  ├─ profile/page.tsx            # Bs3 — 프로필
│  │  │  └─ workspace/page.tsx          # Bs4 — 워크스페이스 생성
│  │  └─ pg/
│  │     ├─ page.tsx                    # Gs1 — PG사 이메일 + 약관
│  │     ├─ verify/page.tsx             # Gs2 — 인증 대기
│  │     ├─ profile/page.tsx            # Gs3 — 프로필
│  │     └─ workspace/page.tsx          # Gs4 — 도메인 자동 합류 확인
│  ├─ password/
│  │  ├─ forgot/page.tsx                # P7
│  │  └─ reset/page.tsx                 # P8
│  ├─ invite/
│  │  ├─ page.tsx                       # P9 워크스페이스 초대(후속)
│  │  └─ rfp/[token]/page.tsx           # C3 RFP 초대 진입점
│  └─ auth/
│     ├─ verify/page.tsx                # P4
│     └─ email-change/page.tsx          # P10
├─ (app)/                               # 인증 영역 (PG RFP AppShell)
├─ logout/route.ts                      # P11 (POST handler)
└─ middleware.ts                        # 세션 가드

components/auth/
├─ AuthShell.tsx                        # 워드마크 + 카드 + serial
├─ Stepper.tsx                          # 01 / 04 — EMAIL (workspaceType별 단계 수 분기)
├─ EmailField.tsx
├─ PasswordField.tsx                    # 보기 토글 + 강도 인디케이터
├─ AgreementCheckboxes.tsx
├─ ResendCountdown.tsx                  # 60초 카운트다운
├─ InvitationCard.tsx
├─ RoleChooser.tsx                      # Rs1 — 구매사/PG사 두 카드
├─ BuyerWorkspaceForm.tsx               # Bs4 — 워크스페이스 생성 폼
└─ PgWorkspaceConfirm.tsx               # Gs4 — 도메인 자동 합류 확인 카드

lib/
├─ types/auth.ts
├─ validation/auth.ts
├─ mock/auth.ts                         # 시드 사용자/초대/토큰
└─ stores/signup-draft.ts               # 단계 진행 임시 (sessionStorage)
```

### 7.2 미들웨어 가드 (의사 코드)

```ts
// middleware.ts
// '/signup' startsWith 커버리지가 '/signup/buyer/*', '/signup/pg/*' 를 포함함
const PUBLIC_PREFIXES = ['/login', '/signup', '/password', '/invite', '/auth', '/logout'];
const CLAIMABLE_PUBLIC_PREFIXES = ['/invite/rfp'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = readSessionCookie(req);
  const isPublic = PUBLIC_PREFIXES.some(p => pathname.startsWith(p));
  const isClaimableInvite = CLAIMABLE_PUBLIC_PREFIXES.some(p => pathname.startsWith(p));

  if (isPublic) {
    // RFP 초대는 이미 로그인한 PG도 token claim을 먼저 처리해야 한다.
    if (isClaimableInvite) {
      return NextResponse.next();
    }

    // 인증된 사용자가 일반 public 진입 시 home으로 (단, /logout 제외)
    if (session && pathname !== '/logout') {
      return NextResponse.redirect(new URL('/home', req.url));
    }
    return NextResponse.next();
  }

  // 가입 완료 후 리디렉트: buyer → '/rfp', pg → '/inbox' (또는 '/inbox/:rfpId')
  // (app)/* 는 세션 필수
  if (!session) {
    const next = encodeURIComponent(pathname + req.nextUrl.search);
    return NextResponse.redirect(new URL(`/login?next=${next}`, req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|fonts).*)'],
};
```

### 7.3 도메인 타입 (lib/types/auth.ts)

```ts
import type { Role } from './user';

export type AuthSession = {
  userId: string;
  email: string;
  workspaceId: string;
  role: Role;
  issuedAt: string;
  expiresAt: string;
  rememberMe: boolean;
};

export type Credentials = { email: string; password: string };

export type SignupDraft = {
  step: 'email' | 'profile' | 'workspace';
  workspaceType: 'buyer' | 'pg';        // Rs1 선택 또는 /invite/rfp/:token 핸드오프에서 설정
  email: string;
  emailVerified: boolean;
  name?: string;
  phone?: string;
  agreedAt?: string;
  rfpInviteToken?: string;              // /invite/rfp/:token 진입 시 보존 → 가입 완료 후 claim
  pgDomainWorkspaceId?: string;         // Gs4에서 도메인 resolve 결과 캐싱
  // password는 메모리에만, sessionStorage 저장 X
};

export type VerificationToken = {
  id: string;
  purpose: 'signup_email' | 'password_reset' | 'email_change' | 'invite';
  email: string;
  token: string;       // opaque, ≥32 byte URL-safe random
  issuedAt: string;
  expiresAt: string;
  consumedAt?: string;
  meta?: Record<string, unknown>;  // invite의 workspaceId, inviterId 등
};

export type Invitation = {
  id: string;
  workspaceId: string;
  inviterId: string;
  email: string;
  role: Role;
  groupId?: string;
  token: string;
  issuedAt: string;
  expiresAt: string;   // 7일
  acceptedAt?: string;
  revokedAt?: string;
};

export type LoginAttempt = {
  email: string;
  ip: string;
  userAgent: string;
  at: string;
  success: boolean;
};
```

### 7.4 검증 스키마 (lib/validation/auth.ts)

```ts
import { z } from 'zod';

export const emailSchema = z.string().trim().email().max(254).toLowerCase();

export const passwordSchema = z.string()
  .min(10, 'MIN 10')
  .regex(/[A-Za-z]/, 'A-Z 1+')
  .regex(/\d/, '0-9 1+')
  .regex(/[^A-Za-z0-9]/, '!@# 1+');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  rememberMe: z.boolean().default(false),
  next: z.string().optional(),
});

export const signupEmailSchema = z.object({
  email: emailSchema,
  agreeTerms: z.literal(true),
  agreePrivacy: z.literal(true),
  agreeMarketing: z.boolean().default(false),
});

export const signupProfileSchema = z.object({
  name: z.string().trim().min(1).max(40),
  phone: z.string().regex(/^010-?\d{4}-?\d{4}$/).optional().or(z.literal('')),
  password: passwordSchema,
  passwordConfirm: z.string(),
}).refine(d => d.password === d.passwordConfirm, {
  path: ['passwordConfirm'], message: '비밀번호가 일치하지 않습니다',
});

export const workspaceCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  bizName: z.string().trim().max(60).optional(),
  industry: z.enum(['saas','agency','manufacturing','retail','services','other']),
});

export const inviteCodeSchema = z.object({
  code: z.string().trim().min(8).max(64),
});

export const passwordResetSchema = z.object({
  password: passwordSchema,
  passwordConfirm: z.string(),
}).refine(d => d.password === d.passwordConfirm, {
  path: ['passwordConfirm'], message: '비밀번호가 일치하지 않습니다',
});
```

### 7.5 비밀번호 강도 산정 (UI 인디케이터용)

```ts
// lib/auth/strength.ts — 4단계 (0~4)
export function passwordStrength(pw: string): 0 | 1 | 2 | 3 | 4 {
  let s = 0;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) && pw.length >= 12) s++;
  return Math.min(s, 4) as 0 | 1 | 2 | 3 | 4;
}
```

UI 컬러 매핑은 [DESIGN.md §5.11](./DESIGN.md) 의 4단계 헤어라인 인디케이터 규칙 참조.

---

## 8. 백엔드 설계 검토 반영 (PG RFP v0)

`PG_RFP_SPEC.md` 기준으로 v0 백엔드 설계 관점에서 아래를 확정한다. 본 섹션은 프론트 선개발(mock) 이후 API/DB를 붙일 때의 기준 계약이다.

### 8.1 모듈 경계

v0는 "모놀리식 BFF + 도메인 모듈" 구조로 시작한다.

```txt
app/api/
├─ auth/*                 # 로그인/세션/로그아웃, 이메일 검증
├─ biz/*                  # 사업자번호 enrichment (국세청/공정위/NICE)
├─ rfp/*                  # RFP 생성/수정/발송/마감
├─ invitations/*          # 토큰 검증, 초대 수락
├─ bids/*                 # PG 제안 draft/submitted/withdraw
├─ compare/*              # 구매사 비교 조회
└─ contracts/*            # 수주 처리
```

`app/api/*` 는 얇은 transport 계층으로 두고, 도메인 로직은 `lib/server/` 로 분리한다.

```txt
lib/server/
├─ modules/
│  ├─ auth/
│  ├─ workspace/
│  ├─ biz-profile/
│  ├─ rfp/
│  ├─ invitation/
│  ├─ bid/
│  └─ contract/
├─ repositories/          # DB access boundary
├─ integrations/          # nts/ftc/nice/mail adapters
└─ policies/              # 권한/상태전이 정책
```

M1.6에서는 실제 DB를 선택하지 않고 위 경계를 in-memory repository로 구현한다. 토큰 해시, 상태 전이, invitation-scoped 권한, notification outbox retry는 이 in-memory adapter로 먼저 테스트한다. DB/ORM은 후속 백엔드 마일스톤에서 repository 인터페이스 아래로 교체한다.

### 8.2 상태 전이 정책 (백엔드 강제)

- `RFP.status`: `draft -> sent -> closed|cancelled|awarded`
- `Bid.status`: `draft -> submitted -> withdrawn`
- `Invitation.status`: `sent -> opened -> accepted|declined|expired`
- `RFP.status=awarded` 전이 시 `Contract` 생성은 트랜잭션으로 묶고, 미선택 `Invitation` 은 일괄 `declined_notice_queued` 이벤트를 발생시킨다.

### 8.3 데이터 저장 계약 (초안)

핵심 테이블/컬렉션은 `workspace`, `workspace_member`, `biz_profile_snapshot`, `rfp`, `invitation`, `bid`, `contract`, `audit_log`, `outbox_event`.

- `rfp.bizProfile` 은 발송 시점 스냅샷 저장 (원본 프로필 변경과 분리)
- `invitation.uniqueToken` 원문 저장 금지 (해시 저장 + 원문은 발송 시 1회만 사용)
- `cardFeesByIssuer` 는 `grade=general` 일 때만 유효
- 법정 수수료(영세/중소1~3)는 서버 상수로 강제하고 클라이언트 입력 무시

### 8.4 API 계약 (v0 필수)

- `POST /api/rfp` RFP 생성(사업자 조회 결과 포함)
- `POST /api/rfp/:id/send` 허용 이메일 리스트로 초대 발송
- `PATCH /api/rfp/:id` 메모/첨부/마감일/이메일 추가 수정
- `GET /api/rfp/:id` 구매사용 상세 + 비교 데이터
- `POST /api/invitations/verify` 토큰 검증(첫 진입용)
- `GET /api/inbox` PG 수신함 조회(워크스페이스 기준)
- `POST /api/bids` / `PATCH /api/bids/:id` / `POST /api/bids/:id/submit`
- `POST /api/rfp/:id/award` 수주 처리 + 계약 생성

### 8.5 외부 연동 추상화

- `integrations/nts-client.ts` (국세청, mandatory)
- `integrations/ftc-client.ts` (공정위 통신판매업, mandatory)
- `integrations/nice-client.ts` (NICE 추정매출, opt-in)
- `integrations/mailer.ts` (초대/상태변경 메일)

각 연동은 도메인 모듈에서 직접 호출하지 않고 `port` 인터페이스를 통해 주입한다.

### 8.6 보안/감사 로깅

- 모든 상태 전이 API는 `audit_log` 에 `actorUserId`, `workspaceId`, `entityType`, `entityId`, `action`, `before`, `after` 기록
- 토큰 검증 실패는 IP 단위 rate-limit
- 워크스페이스 경계 위반 접근은 403 + 감사로그

---

## 9. 변경 이력

- 2026-05-05 v0.1 — 초안. Next.js 16 / Tailwind v4 / Radix / Zustand 스택 확정.
- 2026-05-05 v0.2 — Public 영역 라우팅(§7) 추가. 인증/가입 11종 화면의 라우트 그룹·미들웨어·도메인 타입·zod 스키마 정의.
- 2026-05-05 v0.3 — 디자인 컴포넌트 검토 반영(§4.1), PG 비교 도메인 컴포넌트 계약(§4.2~§4.3), `lib/types/comparison.ts` 타입 스펙 추가.
- 2026-05-05 v0.4 — 권장 라이브러리 조합 채택(§2): shadcn/ui+Radix, TanStack Table, cmdk, Recharts 반영.
- 2026-05-05 v0.5 — PG_RFP_SPEC 기준 백엔드 설계 섹션(§8) 추가: 모듈 경계, 상태 전이, 저장 계약, API, 연동, 감사 정책.
