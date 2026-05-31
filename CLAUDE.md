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
- **Private 1:N RFP, NOT a marketplace**: matching is by buyer-supplied PG email allowlist. PGs don't see each other (완전 비공개 — `Bid.competitorCount` etc. do not exist by design)
- **Per-RFP unique URL + token** in invitation email; token authoritative only for first entry, then workspace membership takes over

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
| State | Zustand (UI toggles, signup draft) | `zustand@5.0.13` |
| Forms | zod v4 검증 + Server Actions (react-hook-form 미사용 — 폼은 useState + zod) | `zod@4.4.3` |
| Icons | lucide-react | `lucide-react@1.14.0` |
| Fonts | `next/font/local` — Pretendard Variable + JetBrains Mono Variable, self-hosted in `public/fonts/` | — |
| Motion | `motion` (구 Framer Motion). 임포트는 `motion/react`. | `motion@12.38.0` |
| DnD | @dnd-kit — 칸반 보드 드래그·정렬 (`fractional-indexing` 병용) | `@dnd-kit/core@6.3.1` |
| Email | Resend + `@react-email/render` | `resend@6.4.0` |
| Logging | Pino + Axiom (`next-axiom`) | `pino@10.3.1`, `next-axiom@1.10.0` |
| Observability | Sentry | `@sentry/nextjs@10.51.0` |
| Support | Channel.io | `@channel.io/channel-web-sdk-loader@2.0.2` |
| Cmdk | `cmdk` | `cmdk@1.1.1` |
| Testing | Vitest + PGlite (단위), Playwright (e2e) | `vitest@4.1.5`, `@electric-sql/pglite@0.3.13` |
| Package mgr | pnpm | — |

상세 버전·스크립트는 `package.json` 참조. 부트스트랩은 완료 (M0).

## Routing Architecture (critical)

```
app/
├─ (public)/    # Unauthenticated: /login, /signup/{buyer,pg}/*, /password/*, /invite/{,rfp,workspace}/[token], /share/{rfp,workspace}/[token], /auth/*, /pending-approval, /suspended
├─ (app)/       # Authenticated, AppShell wrapped (full-height Sidebar + Header)
│  ├─ home/
│  ├─ rfp/                    # buyer workspace pages (B1~B7): /rfp, /rfp/[id], /rfp/[id]/award
│  ├─ inbox/                  # pg workspace pages (P2~P4): /inbox, /inbox/[rfpId], /inbox/[rfpId]/submitted
│  ├─ notifications/          # 인앱 알림 목록 페이지
│  ├─ workspace/new/          # 워크스페이스 생성
│  └─ settings/{profile,members,notifications}/
├─ rfp/new/                   # full-screen RFP 작성 플로우 (자체 layout, AppShell 밖)
├─ admin/                     # 운영자 콘솔 (별도 트리): admin/login + admin/(protected)/{index 대시보드, buyers/[id], sellers/[id], rfps/[id], review/[id], audit-log}; role-guard in admin/(protected)/layout.tsx
├─ logout/route.ts            # POST handler
└─ (no middleware.ts)         # auth guard는 app/(app)/layout.tsx의 서버 redirect로 처리
```

Workspace type (`buyer` vs `pg`) determines which sub-tree of `(app)/*` is shown — same shell, different navigation. The `admin/` console is a separate top-level tree, gated by a role guard in `admin/(protected)/layout.tsx` (not the buyer/pg AppShell).

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
- **No** pulse/spinner loading. Use `LOADING…` text (body-medium type).
- **No** № symbol (U+2116 NUMERO SIGN) anywhere — use plain numerics or zero-padded strings.
- **All** numerics (₩, qty, dates, RFP numbers like `P-2605-0042`) use `.md-numeric` class (mono + tabular-nums). Never on nav/labels/buttons.
- **Status** uses Chip component — never bracketed plain text `[ 결재중 ]`.
- **Typography** uses the typescale tokens — no `font-mono uppercase tracking` on labels/nav; sentence case with slight negative tracking.
- **Chip color** mapping: 성공/완료→tertiary, 실패/오류→error, 보류/신규→warning, 중립→surface, 주요→primary.
- **Motion** animates transform/opacity/color only (never layout); cause→effect under ~100ms (`duration-short-4`).

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
