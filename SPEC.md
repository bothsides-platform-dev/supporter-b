# Supporter B — 기술 스펙 (Next.js 16)

> 짝 문서: [SCREEN_DESIGN.md](./SCREEN_DESIGN.md) (화면·IA·UX) · [DESIGN.md](./DESIGN.md) (디자인 시스템)
> 본 문서: 디렉토리 구조, 도메인 타입 위치, 라우팅·셸·백엔드 전략. **스택 표는 [CLAUDE.md](./CLAUDE.md), 시각 토큰은 DESIGN.md, 타입 정의 원본은 `lib/types/*` 가 캐노니컬** — 본 문서는 중복 정의 대신 그곳을 가리킨다.

---

## 1. 목적과 범위

`PG_RFP_SPEC.md` 의 PG 비공개 1:N RFP 흐름과 `DESIGN.md` 의 디자인 시스템을 Next.js 16 프로덕션 코드로 구현하기 위한 기술 스펙. 풀스택 가동 중(Postgres + Drizzle + Auth.js v5 + Resend + Sentry) — 동일 도메인 계약을 repository 경계 아래에서 유지한다.

**범위 외 (v0)**
- 결재선/승인 워크플로우 (단일 결정자)
- 정산·매출 추적, 계약서 전자서명, 결제 연동
- SMS/Slack/KakaoWork/Push 알림 (이메일 + 인앱만 — [NOTIFICATION.md](./NOTIFICATION.md))
- 실제 PDF 생성 (제안서 미리보기는 HTML 모사)
- 모바일 전용 작성 흐름, i18n (한국어 단일)

---

## 2. 기술 스택

전체 스택 표·버전은 **[CLAUDE.md](./CLAUDE.md) "Current Stack"** 가 단일 출처다. 핵심: Next.js 16 App Router(Turbopack 기본) · React 19 · TypeScript strict · Tailwind v4 · Radix/shadcn(코드 소유) · Drizzle + Postgres · Auth.js v5 · Zustand(UI 토글·draft) · zod + Server Actions · TanStack Table · cmdk · Resend + react-email · Sentry · pnpm.

**Next.js 16 적용 포인트**
- Turbopack 이 dev/build 기본 (`next dev` / `next build`).
- `params` / `searchParams` 는 Promise — `await` 필요.
  ```ts
  export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
  }
  ```
- `experimental.cacheComponents` 옵트인 + `'use cache'` 디렉티브로 RSC 캐시 제어.
- React 19 — Server Actions, `useOptimistic`, `useTransition` 적극 사용.

**원칙**: 외부 라이브러리는 동작/로직만 빌리고, 시각은 DESIGN.md 규칙대로 로컬 컴포넌트에서 통제한다.

---

## 3. 디렉토리 구조

```
bidit/
├─ app/
│  ├─ layout.tsx                       # 루트 레이아웃 (폰트, providers, Toaster)
│  ├─ globals.css                      # Tailwind v4 + styles/tokens.css 임포트
│  ├─ (public)/                        # 비인증 (좁은 컬럼 + 워드마크 헤더)
│  │  ├─ login, signup/{buyer,pg}/{verify,profile,workspace}
│  │  ├─ password/{forgot,reset}, auth/{verify,email-change}
│  │  ├─ invite/{rfp,workspace}/[token], share/{rfp,workspace}
│  ├─ (app)/                           # 인증 영역, AppShell 래핑 (Sidebar + Header)
│  │  ├─ layout.tsx                    # AppShell + 서버 redirect 인증 가드 (middleware 없음)
│  │  ├─ home/                         # buyer/pg 대시보드 (BuyerHome / PgHome 분기)
│  │  ├─ rfp/ {page, new, [id], [id]/award}     # buyer (B2~B5)
│  │  ├─ inbox/ {page, [rfpId], [rfpId]/submitted}  # pg (P2~P4)
│  │  ├─ notifications/                # 인앱 알림 활동 페이지
│  │  ├─ workspace/                    # 워크스페이스 생성·합류
│  │  └─ settings/{profile,members,notifications}/
│  ├─ api/ {auth, files, notifications, workspaces}   # 얇은 transport (SSE·파일·검색 등)
│  └─ logout/route.ts                  # POST 핸들러
│
├─ components/
│  ├─ shell/                           # AppSidebarLayout, Sidebar, Header, Breadcrumb,
│  │                                   # CommandPalette, GlobalShortcuts, Footer,
│  │                                   # PageHeader, Toaster, UserMenu, WorkspaceSwitcher …
│  ├─ primitives/                      # Button, Chip, DataTable, Tag, KpiCell, EmptyState …
│  ├─ ui/                              # shadcn-derived (sidebar, tooltip 등)
│  ├─ auth/ rfp/ inbox/ settings/ board/ attachments/ landing/  # 도메인 컴포넌트
│  └─ icons/                           # 자체 SVG (line, 1.4 stroke)
│
├─ lib/
│  ├─ types/                           # 도메인 타입 원본 (@/lib/types/* — 캐노니컬)
│  ├─ auth/                            # Auth.js v5 헬퍼, session, password
│  ├─ db/                              # Drizzle schema·client
│  ├─ server/                          # actions/, repositories/, outbox/, notifications/,
│  │                                   # storage/, board/, columns/, rfp-state, token …
│  ├─ integrations/                    # Resend, NTS enrichment, Sentry 어댑터
│  ├─ stores/                          # Zustand (nav-history, rfp-draft, signup-draft, ui …)
│  ├─ hooks/  validation/  nav/  format.ts  utils.ts
│
├─ styles/tokens.css                   # 디자인 토큰 (DESIGN.md §2~4 에서 단방향 sync)
├─ drizzle/                            # 단일 그린필드 스키마 SQL
├─ e2e/                                # Playwright 시나리오 (A/B/C)
├─ scripts/                            # seed, og 등
├─ auth.ts, auth.config.ts             # Auth.js v5
├─ next.config.ts, vercel.json         # Sentry/Turbopack, Vercel region(icn1)
└─ (Tailwind v4 — config 파일 없음, @theme 블록만)
```

---

## 4. 디자인 시스템

토큰·타이포·컬러·컴포넌트 시각 원칙·모션·금지 목록은 모두 **[DESIGN.md](./DESIGN.md)** 가 관리(Linear). 본 스펙은 토큰을 **어디에 배치할지**만 다룬다.

- `styles/tokens.css` — `@theme {}` 블록에 DESIGN.md §2~4 토큰 정의 (이름은 `--md-sys-*` 레거시 유지, 값은 Linear).
- `next/font/local` — `public/fonts/` Pretendard Variable / JetBrains Mono → `--font-sans`, `--font-mono`.
- DESIGN.md 변경 시 `tokens.css` 만 동기화하는 단방향 의존.

### 4.1 PG 비교 도메인 컴포넌트 계약

M0~M5 비교 UI는 `PG_RFP_SPEC.md §6` 시나리오 C 기준 — 6개 정형 수치 비교·정렬·제안서 PDF 프리뷰·수주 처리에 집중. 차트·시뮬레이션·신뢰도 점수는 v0 이후.

- **BidComparisonTable** — 공급사별 핵심 조건 동일 축 비교. 숫자 셀 전부 `font-mono + tabular-nums + right-align`.
- **ProposalPdfPreview** — 선택 Bid 제안서를 같은 화면에서 확인. 행 선택 시 ~300ms 이내 전환.
- **BidBoard** — 칸반 보드(표/보드 토글). 카드 stage 는 server `buyer_stage` 컬럼 + `bid_notes` 가 캐노니컬.

### 4.2 화면 배치 원칙 (PG 비교)

- `/rfp`: RFP 상태 탭 + 초대 PG 진행 요약
- `/rfp/[id]`: `BidComparisonTable` + `ProposalPdfPreview` (+ 표/보드 토글)
- `/rfp/new`: `BizLookupField` + `GradeConfirmPanel` + 인라인 PG 워크스페이스 검색 (`useLazyPgWorkspaces` + Radix Popover + cmdk — `components/rfp/RfpCreateForm.tsx`)
- `/inbox/[rfpId]`: `RfpBriefPanel` + `BidForm` + `StatutoryCardFeeNotice`

비교 화면 CTA(요청/확정)는 동일 viewport 내 유지 — 비교 후 추가 이동 없이 행동으로 잇는다.

---

## 5. 도메인 타입

타입 정의 원본은 **`lib/types/*` 가 캐노니컬** (아래는 위치·핵심만; 필드는 소스 참조). PG_RFP_SPEC.md §4 도메인 모델과 동기화한다.

| 타입 | 파일 | 핵심 |
|---|---|---|
| `Attachment` | `lib/types/common.ts` | id·name·size·mimeType·url |
| `Workspace` / `WorkspaceType` | `lib/types/workspace.ts` | `'buyer' \| 'pg'`, name, bizProfile?, members |
| `User` / `Role` | `lib/types/user.ts` | `'admin' \| 'member'`, status, avatarColor |
| `BizProfile` / `MerchantGrade` | `lib/types/biz-profile.ts` | bizNo?·grade? 모두 옵셔널(둘 다 NULL 은 DB CHECK 금지). NICE/공정위 enrichment v0 제외 |
| `RFP` / `RfpStatus` | `lib/types/rfp.ts` | id `P-…`, `allowedPgWorkspaceIds: uuid[]`, bizProfile 발송 스냅샷 |
| `RfpInvitation` / `InvitationStatus` | `lib/types/invitation.ts` | `pgWsId` notNull, 토큰은 `tokenHash` 저장, `acceptedByUserId` 는 감사용 |
| `Bid` / `SettlementCycle` / `CardIssuer` | `lib/types/bid.ts` | 6 정형 수치 + `cardFeesByIssuer`(general 전용) |
| `Contract` | `lib/types/contract.ts` | rfpId·bidId·awardedAt·awardedBy |
| `Notification` | `lib/types/notification.ts` | 채널·상태 — [NOTIFICATION.md](./NOTIFICATION.md) |

상태 enum (서버 강제, §7.2 참조):
- `RfpStatus`: `draft | sent | closed | cancelled | awarded`
- `Bid.status`: `draft | submitted | withdrawn`
- `InvitationStatus`: `draft | pending | opened | accepted | declined | expired`

**법정 카드 수수료** (`lib/types/bid.ts` — `STATUTORY_CARD_FEE`, 영세/중소는 고정·PG 입력 무시):
```ts
small: 0.005, sme1: 0.011, sme2: 0.0125, sme3: 0.015, general: NaN(카드사별 협상)
```

### 5.1 RFP 접근 권한 원칙

v0 RFP 접근권은 **초대된 PG 워크스페이스에 소속된 모든 멤버**에게 부여된다 (PG_RFP_SPEC.md §3 #11). `RfpInvitation.acceptedByUserId` 는 첫 클레임자 감사용일 뿐 접근 게이트가 아니다 — `acceptedByUserId IS NULL` 이어도 ws 멤버이고 invitation status 가 `pending|opened|accepted` 중 하나면 통과한다.

```
RFP invitation
  ├─ invitation.pgWsId = session.user.workspaceId
  ├─ invitation.status ∈ {pending, opened, accepted}
  └─ `/inbox/:rfpId` allows any member of pgWsId
```

구현 진실: `lib/server/repositories/drizzle/invitation.ts` 의 `canAccess(rfpId, pgWsId, tx?)` 가 `(rfp_id, pg_ws_id)` + status whitelist EXISTS 검사만 수행. 동료가 토큰 링크를 클릭하면 같은 ws 멤버이므로 인박스로 자동 redirect (PG_RFP_SPEC.md §7 토큰 정책).

---

## 6. AppShell 라우팅 전략

`(app)` 라우트 그룹에 공통 셸을 둔다. 셸 = **전체 높이 Sidebar + 상단 Header + main** (`components/shell/AppSidebarLayout.tsx` 가 `SidebarProvider` 로 래핑; `Sidebar.tsx` + `Header.tsx`). 별도 Subnav·Topbar·IconSidebar 는 없다 — 섹션 네비게이션은 Sidebar 안에 통합되고, 위치 추적은 Header 의 `Breadcrumb`(nav-history) 가 담당한다.

```tsx
// app/(app)/layout.tsx (개략) — 인증 가드는 서버 redirect, middleware 없음
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.workspaceId) redirect('/login');   // 미완료 세션은 /logout 경유
  return <AppSidebarLayout>{children}</AppSidebarLayout>; // Sidebar + Header + main
}
```

- Sidebar 네비게이션은 `lib/nav/nav-config.ts` 가 단일 출처 (workspace 타입별 top/sections). "G then X" 코드 단축키.
- 워크스페이스 타입(`buyer`/`pg`)이 노출 서브트리를 결정한다 — buyer 가 `/inbox/*`, pg 가 `/rfp/*` 로 직접 접근하면 타입 가드가 `/home` redirect.

---

## 7. Public 영역 라우팅 (인증/가입)

화면 명세는 [SCREEN_DESIGN.md §1](./SCREEN_DESIGN.md), 시각 규칙은 [DESIGN.md §5.11](./DESIGN.md).

### 7.1 라우트 그룹

```
app/
├─ (public)/                            # 비인증 (AuthShell)
│  ├─ login/page.tsx                    # P1
│  ├─ signup/page.tsx                   # Rs1 가입 유형 선택
│  │  ├─ buyer/{,verify,profile,workspace}/page.tsx   # Bs1~Bs4
│  │  └─ pg/{,verify,profile,workspace}/page.tsx      # Gs1~Gs4
│  ├─ password/{forgot,reset}/page.tsx  # P7·P8
│  ├─ auth/{verify,email-change}/page.tsx # P4·P10
│  ├─ invite/{rfp,workspace}/[token]/page.tsx  # RFP·워크스페이스 초대 진입
│  └─ share/{rfp,workspace}/…           # 공유 링크 진입
├─ (app)/                               # 인증 영역
└─ logout/route.ts                      # POST

components/auth/  — AuthShell, Stepper, EmailField, PasswordField(강도 인디케이터),
                   AgreementCheckboxes, ResendCountdown, RoleChooser, BuyerWorkspaceForm,
                   PgWorkspaceConfirm …
lib/stores/signup-draft.ts             # 단계 진행 임시(persist)
```

### 7.2 인증 가드 + 상태 전이

- **가드는 middleware 가 아니라 `app/(app)/layout.tsx` 서버 redirect** 로 한다 (middleware.ts 없음). 비인증 → `/login?next=…`; 인증됐으나 workspace/membership 미완 세션 → `/logout` 경유(리다이렉트 루프 방지). RFP 초대(`/invite/rfp/[token]`)는 로그인 사용자도 token claim 을 먼저 처리.
- 서버 강제 상태 전이: `RFP draft→sent→closed|cancelled|awarded`, `Bid draft→submitted→withdrawn`, `Invitation …→accepted|declined|expired`. `awarded` 전이 시 `Contract` 생성은 같은 트랜잭션, 미선택 PG 에는 `rfp.rejected` 인앱 알림.

### 7.3 도메인 타입·검증 (포인터)

- 인증 타입: `lib/types/auth.ts` (`AuthSession`, `SignupDraft{step,workspaceType,email,…}`, `VerificationToken`, `Invitation`).
- zod 스키마: `lib/validation/auth.ts`. 비밀번호 정책 = **10자 이상 + 영문 + 숫자 + 특수문자** (`passwordSchema`). 이메일은 `.trim().toLowerCase()` 정규화.
- 비밀번호 강도 인디케이터: `lib/auth/strength.ts` (`passwordStrength → 0~4`), 컬러 매핑은 DESIGN.md §5.11.

---

## 8. 백엔드 설계 (PG RFP v0)

v0 는 "모놀리식 + 도메인 모듈" 구조. **변경(mutation)은 REST 가 아니라 Server Actions** 로 한다 (`lib/server/actions/{auth,bid,board,invitation,notifications,rfp,search,workspace}/*`). `app/api/*`(auth·files·notifications·workspaces)는 SSE·파일·검색 등 transport 전용 얇은 계층이고, 도메인 로직은 `lib/server/` 가 가진다.

```txt
lib/server/
├─ actions/         # Server Actions (mutation 진입점)
├─ repositories/    # DB access boundary (drizzle/ 구현 + factory)
├─ outbox/  notifications/   # 이메일 큐 + 인앱 SSE (NOTIFICATION.md)
├─ storage/         # 첨부 저장 (Postgres bytea — getStorage())
├─ board/  columns/ # 칸반 보드·컬럼
└─ rfp-state.ts  token.ts  buyer-kanban.ts  pg-kanban.ts …  # 정책·헬퍼
```

### 8.1 데이터 저장 계약

핵심 테이블: `workspaces`, `workspace_members`, `biz_profile`, `rfps`, `rfp_invitations`, `bids`, `bid_notes`, `contracts`, `notifications`, `outbox_entries`, `attachment_blobs`, `columns`, `audit_log`.

- `rfp.bizProfile` 은 발송 시점 스냅샷 (원본 변경과 분리).
- `rfp_invitations` 토큰 원문 저장 금지 — `tokenHash`(SHA-256) 저장, 원문은 발송 시 1회.
- `cardFeesByIssuer` 는 `grade=general` 일 때만 유효; 법정 수수료(영세/중소1~3)는 서버 상수 강제, 클라이언트 입력 무시.
- 첨부 바이트는 `attachment_blobs` 테이블(Postgres bytea) — 외부 오브젝트 스토어 없음.

### 8.2 외부 연동 추상화

- `integrations/` — 국세청 NTS(mandatory) 등. 공정위·NICE 는 v0 제외. 각 연동은 도메인에서 직접 호출하지 않고 port 인터페이스로 주입.

### 8.3 보안/감사

- 상태 전이는 `audit_log` 에 actor·workspace·entity·action·before/after 기록.
- 토큰 검증 실패 IP rate-limit, 워크스페이스 경계 위반 접근은 redirect/403 + 감사로그.

---

## 9. 변경 이력

- 2026-05-05 v0.1~0.5 — 초안: 스택, Public 라우팅·인증 타입·zod, 디자인 컴포넌트 계약, 백엔드 설계 섹션.
- 2026-05-20 v0.6 — 도메인 모델: 이메일 allowlist → 워크스페이스 선택 (`allowedPgWorkspaceIds`, `RfpInvitation.pgWsId` notNull, §5.1 접근권 ws 단위 단일화).
- 2026-05-25 v0.7 — **최신화·간소화**: 스택/디자인/타입을 CLAUDE.md·DESIGN.md·`lib/types/*` 포인터로 축약(중복 제거). 셸을 Sidebar+Header 현실로 정정(Topbar/NotificationDrawer/Subnav/4-grid 제거), 가드를 middleware → `(app)/layout.tsx` redirect 로 정정, 백엔드 §8 을 Server Actions 현실로 재작성(REST/`modules/` 제거), mock 잔재·`types/` 루트 표기 제거.
