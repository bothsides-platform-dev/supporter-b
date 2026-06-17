# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation Map

This file is the agent entry point (`AGENTS.md` only delegates here). The live content docs:
- `CLAUDE.md` (this file) — stack, routing, design hard-rules, TDD rules, skill routing.
- `README.md` — local setup / run instructions.
- `DESIGN.md` — Linear design language: tokens, typography, color, component visual rules.
- `SCREEN_DESIGN.md` — screen IA, route map, per-screen UX spec.
- `UX_WRITING.md` — 토스 보이스톤 기반 UX 라이팅 원칙 (해요체·능동형·긍정형·캐주얼 경어·버튼 문구). UI 문구 작성 시 필수 참조.

**라이브 배포**: AWS Lightsail 단일 VM 자체호스팅 (Caddy + PM2 `next start` + Docker Postgres). 현행 런북은 `docs/DEPLOY_LIGHTSAIL.md`, 관련 자산은 `ecosystem.config.cjs`(PM2) · `docker-compose.prod.yml`(운영 Postgres) · `deploy/Caddyfile` · `scripts/deploy/lightsail-*.sh` · `.env.production.example`.

**Historical / NOT current truth** (verify against code before trusting): `docs/superpowers/**` (point-in-time plan & spec artifacts). The legacy `PG_RFP_SPEC.md` / `SPEC.md` docs were **removed** — do not reference them; canonical product rules now live in code + tests + SCREEN_DESIGN.md 의 "확정 결정" 블록 (Context 절).

## Domain Context (memorize)

- **Two-sided platform**: `buyer` workspace (구매사) sends RFPs; `pg` workspace (결제대행사 영업담당) responds with bids
- **Bidding is sealed 1:N; discovery is open (opt-out)**: participation (who can bid) is buyer-controlled via the workspace-ID allowlist (`rfp_allowed_pg`), and **bids stay sealed — PGs never see each other or a competitor count (`Bid.competitorCount` does not exist by design).** Two axes, kept separate:
  - **Discovery = open by default, buyer opt-out.** Every `sent` RFP with `deadline > now` and `board_visible=true` (the default) appears on the PG-facing open board (`/opportunities` + PG home 탐색 section). The board listing exposes **only `구매사명`(workspace name)·`제목`·`홈페이지`** — never fees/current-terms/volume/bizNo/memo/attachments (whitelist enforced at the query layer in `lib/server/repositories/drizzle/rfp-pg-request.ts`). A buyer can hide a specific RFP via `setRfpBoardVisibilityAction`.
  - **Participation = buyer-gated.** A non-invited PG sends a one-time cold-pitch request (`rfp_pg_requests`, UNIQUE per (rfp, pg), rejection permanent). Buyer **accept** adds them to the allowlist + a real invitation (full info then visible in their inbox); **reject** is final.
  - **Per-field opt-out for invited PGs — `현재 카드 수수료`.** Even an invited PG who sees the full brief can be denied one field: the buyer's **current card fee** (`current_fee_visible_to_pg`, default true = shown). When off, the value is stripped server-side in `loadPgRfpDetail` (the PG never reads it from the RSC payload/network — `RfpBriefPanel`'s render gate is only the visual fallback). The buyer's own comparison baseline always keeps the fee. Toggle lives in the RFP create wizard (step 2, under 현재 카드 수수료).
- **Per-RFP unique URL + token** in invitation email; token authoritative only for first entry, then workspace membership takes over
- **용어 주의 — 코드는 `RFP`/`bid`, 사용자 화면은 '견적' 언어**: 코드 식별자·라우트(`/rfp`)·DB(`rfps`/`bids`)는 영어 그대로지만, **사용자에게 보이는 모든 한국어 문구는 '견적 요청'(RFP)·'견적'(bid)·'선정'(award)** 으로 통일한다. UI 문구 작성·수정 시 `UX_WRITING.md` §8 도메인 용어집을 따른다. 랜딩/마케팅 면만 '경쟁 입찰' 프레이밍 유지.

## Current Stack

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js App Router, Turbopack default, async `params`/`searchParams` | `next@16.2.4` |
| Runtime | React | `react@19.2.4` |
| Language | TypeScript strict | `typescript@6.0.3` |
| Auth | Auth.js v5 (no middleware — guard via `(app)/layout.tsx` redirect) | `next-auth@5.0.0-beta.31` |
| DB | Drizzle ORM + Postgres | `drizzle-orm@0.45.0`, `postgres@3.4.7` |
| Storage | Postgres bytea (`attachment_blobs` 테이블) — 첨부 바이트가 DB에 저장돼 외부 오브젝트 스토어 없음. `lib/server/storage/{postgres,memory}.ts` — 라우트는 `getStorage()` 만 본다 | (postgres-js 공유) |
| Styling | Tailwind v4 + CSS Variables (`@theme` block) | `tailwindcss@4.2.4` |
| Headless UI | `@base-ui/react` (shadcn base-nova style) + Radix 일부 (`@radix-ui/react-popover`, `@radix-ui/react-slider`) | `@base-ui/react@1.4.1` |
| Component tooling | shadcn (base-nova) — 컴포넌트 scaffolding 전용 | `shadcn@4.6.0` |
| State | Zustand (UI toggles, signup draft, page→shell header-actions slot) | `zustand@5.0.13` |
| Forms | zod v4 검증 + Server Actions (react-hook-form 미사용 — 폼은 useState + zod) | `zod@4.4.3` |
| Numeric input | `react-number-format` — 원화 금액 입력 천단위 구분·소수점 차단 (`CurrencyInput`) + `D+N` 정수 전용 정산주기 입력 (`DayOffsetInput`) | `react-number-format@5.4.5` |
| Korean i18n | `es-hangul` (toss) — 조사 자동 선택(`josa()`), 초성 검색(`disassemble`), 숫자→한글 혼합 표기(`numberToHangulMixed`). 한글 텍스트 처리 단일 출처 | `es-hangul@2.3.8` |
| Icons | lucide-react | `lucide-react@1.14.0` |
| Fonts | `next/font/local` — Pretendard Variable + JetBrains Mono Variable, self-hosted in `public/fonts/` | — |
| Motion | `motion` (구 Framer Motion). 임포트는 `motion/react`. | `motion@12.38.0` |
| DnD | @dnd-kit — 칸반 보드 드래그·정렬 (`fractional-indexing` 병용) | `@dnd-kit/core@6.3.1` |
| Email | Resend + `@react-email/render` | `resend@6.4.0` |
| Logging | Pino + Axiom (`next-axiom`) | `pino@10.3.1`, `next-axiom@1.10.0` |
| Observability | Sentry | `@sentry/nextjs@10.51.0` |
| Support | Channel.io | `@channel.io/channel-web-sdk-loader@2.0.2` |
| Realtime | Centrifugo (자체호스팅 WS, Caddy `wss://`) + `centrifuge-js` — 채팅 라이브(즉시 수신·타이핑·프레즌스·읽음). 메시지는 자사 Postgres에만 영속, 비공개 ACL은 subscribe-proxy로 앱에 보존 | `centrifuge@5.6.0` |
| Cmdk | `cmdk` | `cmdk@1.1.1` |
| Testing | Vitest + PGlite (단위), Playwright (e2e) | `vitest@4.1.5`, `@electric-sql/pglite@0.3.13` |
| Package mgr | pnpm | — |

상세 버전·스크립트는 `package.json` 참조. 부트스트랩은 완료 (M0).

## Routing Architecture (critical)

```
app/
├─ (public)/    # Unauthenticated: /login, /signup/{buyer,pg}/*, /password/*, /invite/{,rfp,workspace}/[token], /auth/*, /pending-approval, /suspended
├─ (app)/       # Authenticated, AppShell wrapped (full-height Sidebar + Header)
│  ├─ home/
│  ├─ rfp/                    # buyer workspace pages (B1~B7): /rfp, /rfp/[id] (비교·선정 인라인 — 별도 award 라우트 없음)
│  │  └─ new/                 # /rfp/new — RFP 작성 플로우 (AppShell 공유)
│  ├─ inbox/                  # pg workspace pages (P2~P4): /inbox, /inbox/[rfpId], /inbox/[rfpId]/submitted
│  ├─ opportunities/          # pg — 오픈 RFP 게시판 (비초대 PG 발견·콜드 피치)
│  ├─ messages/               # buyer+pg 공통 — 라이브 채팅 (Centrifugo WS)
│  ├─ notifications/          # 인앱 알림 목록 페이지
│  ├─ workspace/new/          # 워크스페이스 생성
│  └─ settings/{profile,members,notifications,quote-templates,audit-log}/
├─ logout/route.ts            # GET (redirect to /login) + POST (204, for client-side signOut)
└─ (no middleware.ts)         # auth guard는 app/(app)/layout.tsx의 서버 redirect로 처리 (resolveShellAccess)
```

Workspace type (`buyer` vs `pg`) determines which sub-tree of `(app)/*` is shown — same shell, different navigation.

**Shell-guard gates (`resolveShellAccess` in `lib/auth/shell-access.ts`)**: the `(app)/layout.tsx` guard runs ordered redirects — unauth → `/login`, incomplete-but-authed (no membership) → `/logout`, **email-unverified → `/pending-approval`**, workspace `pending` → `/pending-approval`, workspace `suspended` → `/suspended`. The email-verification gate is **first-class and independent of workspace status** — an unverified member is redirected even when their active workspace is already `active` (closes the canonical-PG-join hole where joining an approved workspace skipped verification). `emailVerified` is read **live from the DB** (`getDbEmailVerified`, not the JWT) so a just-completed verification takes effect without re-login; after verifying, `EmailVerifyScreen` hard-navigates (`window.location.assign('/home')`) so the guard re-branches by workspace status. (Data-boundary enforcement on server actions / API routes is deliberately deferred — see TODOS.md.)

**Host routing (prod only)**: the single Next.js app serves two hostnames — `supporter-b.com` (buyer) and `partner.supporter-b.com` (PG). Route tree is unchanged; `(app)/layout.tsx` reads the request host and redirects a mismatched session to its correct host (`lib/site-routing.ts`). `/signup` also reads the host and redirects to `/signup/buyer` or `/signup/pg` without a role-chooser screen (`signupTargetForHost` in `lib/site-routing.ts`). Session cookie is scoped to `.supporter-b.com` for cross-subdomain SSO (`AUTH_COOKIE_DOMAIN`). Workspace switch navigates across hosts. PG-facing emails link to `partner.supporter-b.com`. Local dev uses a single host (routing disabled). Env vars: `NEXT_PUBLIC_BUYER_ORIGIN`, `NEXT_PUBLIC_PARTNER_ORIGIN`.

**Admin 콘솔은 별도 레포로 분리됨**: `github.com/bothsides-platform-dev/admin-supporter-b`. 이 레포에 `app/admin/` 없음. admin 관련 코드를 찾거나 수정할 때는 해당 레포를 참조. 이 레포에는 DB 마이그레이션 소유권(`lib/db/schema/admin.ts`)과 신규 가입 알림 이메일(`lib/integrations/admin-email.ts`)만 잔존.

## Server Architecture (lib/server/)

세 계층으로 구성된다. 계층 간 의존 방향은 Actions → Services → Repositories.

```
lib/server/
├─ actions/          # 얇은 진입점: 세션 검증 + 입력 파싱 후 서비스에 위임
├─ services/         # 비즈니스 로직 캡슐화 (전체 코드베이스 적용 완료)
│  ├─ rfp.ts         # RfpService: award / cancel / close
│  ├─ bid.ts         # BidService: submit / withdraw
│  ├─ chat.ts        # ChatService: sendMessage / markConversationRead
│  ├─ workspace.ts   # WorkspaceService: create / invite / member management
│  ├─ auth.ts        # AuthService: signup / password reset / email change
│  └─ notification.ts# NotificationService: markRead / markAllRead / retryEmail
└─ repositories/     # DB 접근 추상화 (Drizzle 구현 — 단위 테스트는 PGlite 로 실 DB 검증)
```

**서비스 레이어 규칙:**
- 서비스는 트랜잭션·알림 팬아웃·이메일 아웃박스를 소유한다. 액션은 이를 직접 다루지 않는다.
- `Actor = { userId, workspaceId }` — 세션에서 추출해 액션이 서비스에 전달한다.
- `ServiceResult<T> = { ok: true } & T | { ok: false; error: string }` — 예외 throw 없이 결과를 반환한다.
- 서비스 싱글턴은 Next.js `globalThis` 캐싱 패턴 사용 (`getRfpService()` / `getBidService()` 등).

**리포지토리 경계 (ESLint 강제):** 모든 DB 접근은 `lib/server/repositories/**` 가 소유한다. 그 밖의 `lib/`·`app/` 코드는 `@/lib/db/schema`·`@/lib/db/client` 를 **값(value)으로 정적 import 할 수 없다** — 레포를 주입(`repositories/factory` 의 `get*Repo()`)해서 쓴다. `import type { DB }`(타입 전용)와 서비스의 동적 `import('@/lib/db/client')`(트랜잭션 핸들)는 허용. 위반 시 lint 에러(`@typescript-eslint/no-restricted-imports`, 규칙명 `repo-boundary/db-access`) + 독립 드리프트 가드 테스트(`lib/server/__tests__/repo-boundary.test.ts`)가 잡는다. **의도적 예외**(`lib/server/db-boundary-allowlist.mjs` 에 명문화, 단일 출처): storage 바이트-블롭 티어(`storage/{postgres,index}.ts`), 크로스-애그리거트 캐스케이드(`_purgeUnverifiedSignup.ts`), `actionDb()` 테스트-오버라이드 레지스트리(`actions/auth/_shared.ts`). 예외를 늘리려면 allowlist 에 추가하고 리뷰한다.

## Linear Design Language — Hard Rules

These are non-negotiable visual decisions enforced across all screens. The design language is **Linear** — dense, fast, structure carried by low-contrast borders not shadows. Light-first; dark mode is Linear's signature near-black (`#08090A`). **Note:** token *names* keep the `--md-sys-*` prefix from the prior MD3 system — only the values are Linear. `md-sys` in the name does not mean MD3. DESIGN.md is the canonical source.

- **No** Inter/Roboto/Arial direct import. Pretendard Variable (KR + Latin, Inter-derived) + JetBrains Mono only.
- **No** pill buttons. Interactive elements are 6px (`shape-small`). `shape-full` (9999px) only for Avatars, status dots, pills indicators.
- **No** hover shadow promotion — hover is a background-lightness shift only.
- **No** heavy/skeuomorphic shadows — most surfaces use a 1px border or elevation-1; big shadows only on floating elements (popover, dropdown, toast, dialog, command palette).
- **No** high-contrast dividers — default to `outline-variant` (the deliberately low-contrast border). The faint border IS the Linear look, not a bug.
- **No** body text ≥ 16px — app body is 14px, dense (~32px rows, 28px buttons).
- **No** accent gradients/neon/glassmorphism/blurred orbs. The accent is solid trust blue `#0061A4`.
- **No** illustrated empty states. Line SVGs (1.4–1.5 stroke) only.
- **No** pulse/spinner loading. Use `LOADING…` text (body-medium type). (예외: DESIGN.md §9 "축하 모먼트" — 종결 성공 1회성에 한해 컨페티 허용.)
- **No** № symbol (U+2116 NUMERO SIGN) anywhere — use plain numerics or zero-padded strings.
- **All** numerics (₩, qty, dates, RFP numbers like `P-2605-0042`) use `.md-numeric` class (mono + tabular-nums). Never on nav/labels/buttons.
- **Status** uses Chip component — never bracketed plain text `[ 결재중 ]`.
- **Typography** uses the typescale tokens — no `font-mono uppercase tracking` on labels/nav; sentence case with slight negative tracking.
- **Chip color** mapping: 성공/완료→tertiary, 실패/오류→error, 보류/신규→warning, 중립→surface, 주요→primary.
- **Motion** animates transform/opacity/color only (never layout); cause→effect under ~100ms (`duration-short-4`). 단, DESIGN.md §9의 "축하 모먼트" 예외(종결 성공 1회성 컨페티)는 별도.

If frontend code looks "generic SaaS", check DESIGN.md §9 (anti-patterns) before defending it.

## TDD — Hard Rules

모든 코드 변경은 `superpowers:test-driven-development` 스킬을 발동하고 **RED → GREEN → REFACTOR** 사이클로 진행한다. 이 스킬의 Iron Law가 본 프로젝트의 비결정 사항이다:

> **NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.**

- **Failing test 먼저, 구현 나중**. `__tests__/<name>.test.ts(x)`에 테스트를 작성하고 `pnpm test <path>`로 빨갛게 떨어지는 것을 직접 확인한 뒤 구현 코드를 작성한다.
- **테스트 후행 금지**. 구현부터 작성한 코드는 "참고용"으로도 남기지 말고 삭제 후 테스트부터 다시 시작. ("이미 X시간 썼는데 아까워서…"는 sunk-cost.)
- **즉시 통과한 테스트는 가짜 테스트**. RED를 직접 본 적 없으면 그 테스트는 무엇도 보장하지 않는다.
- **수동 브라우저 클릭은 테스트 대체재가 아니다**. 시각/UX 확인용이지 회귀 방지는 아니다 — 자동 테스트와 병행한다.
- **버그 픽스는 먼저 회귀 테스트로 재현**. 테스트가 빨갛게 뜨는 것을 보고 나서 픽스.
- **GREEN은 최소 코드만**. 통과시키기 위한 최소 구현 — 미래를 위한 옵션·파라미터·추상화 금지(YAGNI).

**TDD 면제 (그 외에는 모두 적용)**:
- 일회용 prototype/spike (커밋 안 함)
- 생성 코드 (codegen 산출물)
- 순수 설정 파일 (`*.config.*`, `eslint.config.mjs`, `drizzle.config.ts` 등)
- 시각/스타일만 손대는 변경 — 단 상태(state)·핸들러·조건 분기를 같이 추가하면 비예외.
- `app/**/page.tsx`·`app/**/layout.tsx` shell이 단순 컴포넌트 조립일 때 (안의 client component·server function 단위로 테스트).

면제에 해당해도 **확신이 안 서면 우선 테스트부터** — 30초 손해보다 회귀 한 번이 비싸다.

세부 RED-Flag 합리화 패턴(예: "이건 너무 사소해서…", "이미 수동으로 확인했어")과 cycle 가이드는 `superpowers:test-driven-development` 스킬 본문 참조.

## When Editing Documentation

The content docs (this file, `README.md`, `DESIGN.md`, `SCREEN_DESIGN.md`) cross-reference each other. After any change:
- If you edit DESIGN.md tokens → also bump `styles/tokens.css`
- If you add or change a screen/route → register it in SCREEN_DESIGN.md (§0 route map + screen table) and, for new top-level trees, the Routing Architecture block above.
- Canonical product rules now live in **code + tests + SCREEN_DESIGN.md 의 "확정 결정" 블록** (Context 절; the legacy `PG_RFP_SPEC.md` / `SPEC.md` docs were removed). If a decision contradicts the "확정 결정" rules, **stop and ask**.

## Skill routing (project-specific only)

대부분의 스킬은 description 자동 매칭에 의존한다. 아래는 프로젝트 특수 라우팅:

- `superpowers:test-driven-development` — **모든 신규 코드/버그픽스/리팩터링 직전 필수**. 면제 범위는 "TDD — Hard Rules" 참조.
- `/plan-eng-review` — M2 이후 새 기능 코딩 시작 전 (아키텍처 락인)
- `/design-review` — 화면 시각 폴리시 (Linear 디자인 시스템 정합 검증)
- `/investigate` — 버그·에러·예상치 못한 동작
- `/ship` — PR 생성·배포 단계

## Health Stack

`/health` 가 사용하는 도구 체인. e2e는 별도 (`/qa` 또는 `pnpm e2e`).

- typecheck: `pnpm tsc --noEmit`
- lint: `pnpm lint`
- test: `pnpm test`

TDD 사이클 중 단일 파일만 실행: `pnpm test <path-to-test>` — RED/GREEN 확인은 항상 단일 파일로 빠르게, 전체 그린 확인은 `pnpm test`.

## Worktree Workflow

모든 기능 개발·버그픽스는 **worktree 브랜치**에서 진행한다. dev는 항상 clean 상태 유지.

- 새 작업 시작 시 `EnterWorktree` (네이티브 도구)로 `.worktrees/<branch-name>` 생성
- Worktree 디렉터리: `.worktrees/` (`.gitignore`에 등록됨)
- 브랜치 명명: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`
- PR은 `/ship` 스킬로 생성
- PR 머지 후 `git worktree remove .worktrees/<name> && git branch -d <name>` 정리

**동의 없이 worktree를 자동 생성해도 된다.** 별도 확인 불필요.
