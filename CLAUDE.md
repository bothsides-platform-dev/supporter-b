# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository State (2026-05-19)

**M0~M8 완료, M9 (server cutover) 진행.** 풀스택 가동 중 — Next.js 16.2 + Auth.js v5 + Drizzle 0.45 + Postgres + Resend + Sentry. AppShell, 16 primitives, 9 shell components, BidBoard, outbox, Toaster, notifications activity list, RFP 작성/비교/award, PG inbox/응답이 모두 구현됨. **Bid 칸반 stage + 메모/첨부는 Stage 3 (M9) 에서 server로 cutover 완료** — `bids.buyer_stage` 컬럼 + `bid_notes` 테이블 + `addBidNoteAction` / `removeBidNoteAction` / `updateBuyerStageAction` 가 캐노니컬 소스. localStorage 기반 `lib/stores/bid-board.ts` 는 제거됨.

## Document Hierarchy (read in this order to gain context)

1. **PG_RFP_SPEC.md** — Product spec (v0). The most authoritative document. 15 policy decisions, domain model, screen IA, scenarios. **Read this first.** Result of a brainstorming pivot from generic B2B quotation system to a **PG (Korean Payment Gateway) -focused private 1:N RFP platform**.
2. **SCREEN_DESIGN.md** — Screens, IA, UX flows. §0 PG v0 화면 IA(B1~B7, P1~P6) + §1 인증/가입(P1~P11).
3. **DESIGN.md** — Design system (*Material Design 3*). MD3 tokens, typography, color roles, component visual rules, motion, anti-clichés. **Single source of truth for visual decisions** — `styles/tokens.css` syncs from here unidirectionally.
4. **SPEC.md** — Tech spec. Stack, directory layout, domain TypeScript types, App Router strategy, public-vs-app route groups.
5. **IMPLEMENTATION.md** — Milestones M0~M8 + M1.5 (auth), bootstrap commands, verification checklists, work order.
6. **[NOTIFICATION.md](./NOTIFICATION.md)** — 알림 시스템. 이메일(Resend) + 인앱(SSE + Drawer) 채널, NotificationService 모듈 구조, 이벤트→알림 매핑.

If these conflict, **PG_RFP_SPEC.md wins** (newest, post-pivot). Distribute its §8 changes back into the other four files when implementing — do not let them drift.

## Domain Context (memorize)

- **Two-sided platform**: `buyer` workspace (구매사) sends RFPs; `pg` workspace (결제대행사 영업담당) responds with bids
- **Private 1:N RFP, NOT a marketplace**: matching is by buyer-supplied PG email allowlist. PGs don't see each other (완전 비공개 — `Bid.competitorCount` etc. do not exist by design)
- **PG workspace identity = email domain** (e.g. `@toss.im` → 토스페이먼츠 workspace, auto-merge on signup)
- **Per-RFP unique URL + token** in invitation email; token authoritative only for first entry, then workspace membership takes over
- **사업자번호 → automatic enrichment** at RFP creation: 국세청 (free, mandatory). 공정위·NICE는 v0 제외.
- **가맹점 등급 = 카드 우대수수료 등급** (영세/중소1~3/일반). Card fees for 영세·중소 are **statutorily fixed** — `STATUTORY_CARD_FEE` in SPEC.md §4 — PGs cannot quote different card rates for these grades. Competition shifts to settlement cycle, deposit, setup fee, monthly minimum, bank transfer %, easy-pay %. Only 일반 grade negotiates card fees per issuer (9 cards: BC/SHINHAN/SAMSUNG/HYUNDAI/KB/LOTTE/NH/HANA/WOORI).
- **v0 has NO 결재선** on either side. Single-decider model. Don't add approval flow components even though SCREEN_DESIGN.md still describes them.

## Current Stack

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js App Router, Turbopack default, async `params`/`searchParams` | `next@16.2.4` |
| Runtime | React | `react@19.2.4` |
| Language | TypeScript strict | — |
| Auth | Auth.js v5 (no middleware — guard via `(app)/layout.tsx` redirect) | `next-auth@5.0.0-beta.31` |
| DB | Drizzle ORM + Postgres | `drizzle-orm@0.45.0`, `postgres@3.4.7` |
| Storage | Postgres bytea (`attachment_blobs` 테이블) — 첨부 바이트가 DB에 저장돼 외부 오브젝트 스토어 없음. `lib/server/storage/{postgres,memory}.ts` — 라우트는 `getStorage()` 만 본다 | (postgres-js 공유) |
| Styling | Tailwind v4 + CSS Variables (`@theme` block) | — |
| Headless UI | Radix primitives | — |
| State | Zustand (UI toggles, signup draft) | `zustand@5.0.13` |
| Forms | react-hook-form + zod | — |
| Fonts | `next/font/local` — Pretendard Variable + JetBrains Mono Variable, self-hosted in `public/fonts/` | — |
| Motion | `motion` (구 Framer Motion). 임포트는 `motion/react`. | — |
| Email | Resend + react-email | `resend@6.4.0` |
| Observability | Sentry | `@sentry/nextjs@10.51.0` |
| Tables / Cmdk | `@tanstack/react-table`, `cmdk` | — |
| Package mgr | pnpm | — |

상세 버전·스크립트는 `package.json` 참조. 부트스트랩은 완료 (M0).

## Routing Architecture (critical)

```
app/
├─ (public)/    # Unauthenticated: /login, /signup/{buyer,pg}/*, /password/*, /invite/rfp/[token], /auth/*
├─ (app)/       # Authenticated, AppShell wrapped
│  ├─ home/
│  ├─ rfp/                    # buyer workspace pages (B1~B7)
│  ├─ inbox/                  # pg workspace pages (P2~P4)
│  └─ settings/{profile,members,notifications}/
├─ logout/route.ts            # POST handler
└─ (no middleware.ts)         # auth guard는 app/(app)/layout.tsx의 서버 redirect로 처리
```

Workspace type (`buyer` vs `pg`) determines which sub-tree of `(app)/*` is shown — same shell, different navigation.

## Material Design 3 — Hard Rules

These are non-negotiable visual decisions enforced across all screens.

- **No** Inter/Roboto/Arial. Pretendard Variable (KR + Latin) + JetBrains Mono only.
- **No** purple-to-blue gradients. Use MD3 tonal color roles.
- **No** shape > 12px except dialogs (28px) and pills (9999px). Use MD3 shape scale.
- **No** illustrated empty states. Line SVGs (1.4–1.5 stroke) only.
- **No** pulse/spinner loading. Use `LOADING…` text (body-medium type).
- **No** glassmorphism, neon accents, blurred 3D orbs/blobs, chrome AI imagery.
- **No** skeuomorphic excessive shadow — most surfaces use elevation-1 or none.
- **No** № symbol (U+2116 NUMERO SIGN) anywhere — use plain numerics or zero-padded strings.
- **All** numerics (₩, qty, dates, RFP numbers like `P-2605-0042`) use `.md-numeric` class (JetBrains Mono + tabular-nums). Never on nav/labels/buttons.
- **Status** uses Chip component — never bracketed plain text `[ 결재중 ]`.
- **Typography** uses MD3 typescale tokens — no `font-mono uppercase tracking` on labels/nav.
- **Chip color** mapping: 성공/완료→tertiary, 실패/오류→error, 보류/신규→warning, 중립→surface, 주요→primary.

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

## Work Order

Current milestone (2026-05-08): M7 종료, M8 진행 중 (인프라 가동, mock 정리 잔여).

Follow IMPLEMENTATION.md milestones strictly: **M0 → M1 → M1.5 → M2 → ... → M8**. Don't skip M1 primitives to start a feature page — primitives must exist first or the feature page will reinvent them off-spec.

Per-PR verification checklist lives in IMPLEMENTATION.md §4. Copy it into PR body. Three end-to-end scenarios (A/B/C in PG_RFP_SPEC.md §6) are the ultimate clickthrough acceptance tests.

**모든 구현·버그픽스 작업은 "TDD — Hard Rules" 섹션에 따라 failing test부터 시작한다.** 코드 작성 전 `superpowers:test-driven-development` 스킬을 발동했는지 먼저 확인.

## When Editing Documentation

The 7 docs cross-reference each other heavily. After any change:
- If you edit DESIGN.md tokens → also bump `styles/tokens.css`
- If you edit PG_RFP_SPEC.md §4 (domain types) → also update SPEC.md §5 to match
- If you add a screen → register it in both SCREEN_DESIGN.md (IA) and IMPLEMENTATION.md (milestone)
- If a decision contradicts the 15 policies in PG_RFP_SPEC.md §3, **stop and ask** — that table is the canonical product definition.

## Skill routing (project-specific only)

대부분의 스킬은 description 자동 매칭에 의존한다. 아래는 프로젝트 특수 라우팅:

- `superpowers:test-driven-development` — **모든 신규 코드/버그픽스/리팩터링 직전 필수**. 면제 범위는 "TDD — Hard Rules" 참조.
- `/plan-eng-review` — M2 이후 새 기능 코딩 시작 전 (아키텍처 락인)
- `/design-review` — 화면 시각 폴리시 (MD3 디자인 시스템 정합 검증)
- `/investigate` — 버그·에러·예상치 못한 동작
- `/ship` — PR 생성·배포 단계

## Health Stack

`/health` 가 사용하는 도구 체인. e2e는 별도 (`/qa` 또는 `pnpm e2e`).

- typecheck: `pnpm tsc --noEmit`
- lint: `pnpm lint`
- test: `pnpm test`

TDD 사이클 중 단일 파일만 실행: `pnpm test <path-to-test>` — RED/GREEN 확인은 항상 단일 파일로 빠르게, 전체 그린 확인은 `pnpm test`.
