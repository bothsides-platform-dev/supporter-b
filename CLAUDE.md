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
  - **Discovery = open by default, buyer opt-out.** Every `sent` RFP with `deadline > now` and `board_visible=true` (the default) appears on the PG-facing open board (`/opportunities` + PG home 탐색 section). The board listing exposes a **non-competitive whitelist — `견적번호`·`구매사명`(workspace name)·`제목`·`홈페이지`·`마감일`·`요청 결제수단`(+커스텀 라벨)·`주요 상품`·`계약 유형`** — and never fees/current-terms/volume/bizNo/memo/attachments. The whitelist is the `OpportunityListing` type (`lib/types/pg-request.ts`), enforced at the query layer by an explicit SELECT projection in `lib/server/repositories/drizzle/rfp-pg-request.ts` and pinned by an exact-key guard test in its `__tests__`. **Adding a field to that type widens the public boundary — treat it as a sealed-bid decision, not a UI tweak.** **This block is the only place the field list is spelled out in prose** — README.md and SCREEN_DESIGN.md deliberately point here instead of restating it (they drifted apart when all three carried copies). **Board visibility is set once at RFP creation (wizard step 4, `RfpStep4Review` checkbox — gated on `OPEN_BOARD_ENABLED`) and is read-only thereafter** — the UI shows a status chip (`RfpBoardVisibilityStatus`) with no toggle. `setRfpBoardVisibilityAction`/`rfpRepo.setBoardVisible` are kept server-side for admin/recovery use but no UI surface calls them. **Kill switch**: `OPEN_BOARD_ENABLED = false` in `lib/features/open-board.ts` temporarily hides the entire open-board surface (board page, nav, home 탐색 section, wizard checkbox). Data and server logic are intact — flip to `true` to restore. (v0.2.52.0)
  - **Participation = buyer-gated.** A non-invited PG sends a one-time cold-pitch request (`rfp_pg_requests`, UNIQUE per (rfp, pg), rejection permanent). Buyer **accept** adds them to the allowlist + a real invitation (full info then visible in their inbox); **reject** is final.
  - **Per-field opt-out for invited PGs — `현재 카드 수수료`.** Even an invited PG who sees the full brief can be denied one field: the buyer's **current card fee** (default shown, opt-out per RFP). When off, the value is stripped server-side in `loadPgRfpDetail` (the PG never reads it from the RSC payload/network — `RfpBriefPanel`'s render gate is only the visual fallback). The buyer's own comparison baseline always keeps the fee. Toggle lives in the RFP create wizard (step 2, under 현재 카드 수수료). **Implementation note (v0.2.26.x, migration complete):** current-terms is stored as a versioned JSONB document (`current_terms` column, `lib/types/rfp-terms.ts`). PG field visibility is controlled by a `hidden_from_pg` text-array (path allowlist) — `loadPgRfpDetail` strips any path that has a handler in `PG_STRIP` (fail-closed). The legacy `current_fee_visible_to_pg` boolean column and individual `current_*` columns were dropped in v0.2.26.2 — `current_terms` is the sole authoritative store. `currentFeeVisibleToPg` is derived at the app layer from `hiddenFromPg`. User-facing behavior is unchanged. **New-contract exemption (v0.2.68.0):** when 견적 유형 = 신규 계약 (`contractType==='new'`), the PG-contract-history fields that can't exist for a first-time PG contract — 전년도 연간 PG 총 거래액(`annualPgVolume`), 현재 카드 수수료(`currentFeeRate`) + its PG-visibility, 현재 월 정산한도, 현재 보증보험, 현재 정산주기 — are hidden in both wizard step 2 (input) and step 4 (review) and stripped server-side in `createRfpAction` (trust boundary — a tampered draft/direct call still can't leak them into `current_terms`). The previously-required `annualPgVolume` is no longer required for `'new'` — the SSOT gate is `isAnnualPgVolumeSatisfied` in `lib/rfp/required-fields.ts`. 배송·서비스 기간 and 현재 운영 솔루션 are KEPT (PG-independent). Renewal/null behavior unchanged.
- **Per-RFP unique URL + token** in invitation email; token authoritative only for first entry, then workspace membership takes over
- **용어 주의 — 코드는 `RFP`/`bid`, 사용자 화면은 '견적' 언어**: 코드 식별자·라우트(`/rfp`)·DB(`rfps`/`bids`)는 영어 그대로지만, **사용자에게 보이는 모든 한국어 문구는 '견적 요청'(RFP)·'견적'(bid)·'선정'(award)** 으로 통일한다. UI 문구 작성·수정 시 `UX_WRITING.md` §8 도메인 용어집을 따른다. 랜딩/마케팅 면만 '경쟁 입찰' 프레이밍 유지.
- **선정 후 전자서명 (SnowSign Templates)**: 선정(award)에서 흐름이 끝나지 않고 서포트비 안에서 전자서명까지 잇는다. **PG가 자사 계약서를 스노우싸인(SnowSign) 템플릿으로 1회 등록·링크**(`/signing-templates`, 서명칸·좌표는 SnowSign 소유 — 앱은 PDF 에디터·좌표 저장 없음)해 두면, 구매사가 선정하는 순간 `awardRfpAction`이 `ContractSigningService.onAward`를 호출해 그 템플릿으로 계약을 생성·발송한다(템플릿 미설정이면 `awaiting_pg_template` → PG가 링크하는 순간 자동 발송). 양측은 이메일 링크의 SnowSign 페이지에서 서명하고, 앱은 **SnowSign 웹훅(저지연 트리거) + 폴링(백스톱)**으로 상태를 반영한다: `POST /api/signing/webhook`이 HMAC-SHA256 서명(`X-Webhook-Signature`)을 검증한 뒤 payload의 `contract_id`만 뽑아 `reconcileByProviderRef`→`reconcileStatus`(getContract 재조회)로 위임하고 — 웹훅은 payload를 신뢰하지 않는 순수 트리거이며 상태 매핑은 폴링과 동일한 단일 경로, 멱등 `ensureFinalized`로 중복 무해 — 웹훅 유실(SnowSign auto-retry 없음) 대비로 딜룸 lazy + `poll-signing-status` cron 폴링이 백스톱을 이룬다. 웹훅 시크릿은 `SNOWSIGN_WEBHOOK_SECRET`(미설정 시 401 fail-closed로 웹훅 무시, 폴링만 동작). 딜룸 awarded 영역의 `SigningPanel`이 상태(대기/진행/완료/거절)를 보여주고 리마인더·취소·재발송·완료본 온디맨드 다운로드(1h URL 302 프록시, 로컬 보관 없음)를 노출한다. **org 스코핑**: 단일 `SNOWSIGN_API_KEY`=1 org 라 `GET /v1/templates` 원본을 PG에 노출하지 않고 `pg_signing_templates` 링크분만 스코프. ACL: 계약 조회·조작 = 낙찰 PG ws + buyer ws(로더는 buyer 항상 / PG `awardedToMe`만). 완료 칩은 '서명 완료', buyer 대기 라벨은 '**PG사가 계약서 준비 중**'. 얕은 `SnowSignClient` seam(교체 용이성은 YAGNI로 의도적 완화) + `ContractSigningService` 파사드. 레거시 award 기록 테이블 `contracts`와는 별개(`signing_contracts`). **동시성·경계 하드닝(리뷰 반영)**: 웹훅은 `after()`로 응답 후 재조회(5초 예산 비블로킹) + `provider_ref` 인덱스; 종결 전이(declined/expired)·resend 취소는 원자 CAS(`transitionIfActive`)로 동시 폴링·웹훅 중복 알림/완료본 클로버 방지; `performSend`는 발송 후 로컬 영속 실패 시 SnowSign 계약을 보상 취소(고아 방지); 템플릿 링크·조회는 크로스-테넌트 소유 가드(`findBySnowsignTemplateId` — 타 PG 링크분 거부/차단, 미링크 신규분 첫 조회는 Phase 11 소유검증 대기); `getForActor` ACL-먼저(award 존재 오라클 제거); 참여자 이메일 대소문자 무시 매칭; poll cron 이 방치 awaiting 을 7일 스로틀로 재넛지; cron 인증 상수시간·헤더 전용.

## Current Stack

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js App Router, Turbopack default, async `params`/`searchParams` | `next@16.2.9` |
| Runtime | React | `react@19.2.4` |
| Language | TypeScript strict | `typescript@6.0.3` |
| Auth | Auth.js v5 (no middleware — guard via `(app)/layout.tsx` redirect) | `next-auth@5.0.0-beta.31` |
| DB | Drizzle ORM + Postgres | `drizzle-orm@0.45.0`, `postgres@3.4.7` |
| Storage | ① 첨부파일: Cloudflare R2(S3 호환 API, `lib/server/storage/r2.ts`, 키 `attachments/<id>`) — 라우트는 `getStorage()` 만 본다. **업/다운로드 모두 presigned**: 업로드 = 2-phase 직행 PUT(`POST /api/files/presign` → 브라우저→R2 PUT → `POST /api/files/{id}/complete` 서버 스니핑 검증, `attachments.status` pending→ready, 클라 공용 헬퍼 `lib/attachments/upload-client.ts`), 다운로드 = `GET /api/files/{id}` 가 ACL 검증 후 302 → presigned GET(TTL 15분). 버려진 pending 은 `/api/cron/sweep-uploads`(1h 초과) 가 청소, 버킷 CORS(PUT) 필수. R2 env(`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET`) 미설정 시 모든 환경에서 throw(폴백 없음) — 로컬 dev도 실 R2 버킷 사용, 단위 테스트는 `__setStorageForTest` mock 주입, e2e 첨부 스펙은 R2 env 없으면 skip. ② 사용자 프로필 사진: Postgres bytea — `user_avatar_blobs` 테이블, `UserAvatarRepo`(`getUserAvatarRepo()`) — `getStorage()` 외부, 별도 repo 패턴 | `@aws-sdk/client-s3@3.x` |
| Styling | Tailwind v4 + CSS Variables (`@theme` block) | `tailwindcss@4.2.4` |
| Headless UI | `@base-ui/react` (shadcn base-nova style) + Radix 일부 (`@radix-ui/react-popover`, `@radix-ui/react-slider`) | `@base-ui/react@1.4.1` |
| Component tooling | shadcn (base-nova) — 컴포넌트 scaffolding 전용 | `shadcn@4.6.0` |
| State | Zustand (UI toggles, signup draft, page→shell header-actions slot) | `zustand@5.0.13` |
| Forms | zod v4 검증 + Server Actions (react-hook-form 미사용 — 폼은 useState + zod) | `zod@4.4.3` |
| Client data fetching | SWR — `force-static` 랜딩 헤더(`LandingHeaderNav`/`PgLandingHeaderNav`)가 마운트 후 `/api/auth/session`을 클라이언트에서 재조회해 로그인 상태를 반영(`components/landing/use-session-authed.ts`); 같은 키를 쓰는 두 헤더 인스턴스 요청을 SWR 캐시가 자동 중복제거 | `swr@2.4.2` |
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
│  ├─ rfp/                    # buyer workspace pages (B1~B7): /rfp, /rfp/[id] (비교·선정 인라인 — 별도 award 라우트 없음), /rfp/@modal/(.)[id] (인터셉트 딜룸 모달)
│  ├─ rfp-create/             # /rfp-create — RFP 작성 플로우 (AppShell 공유, 인터셉트 라우트)
│  ├─ inbox/                  # pg workspace pages (P2~P4): /inbox, /inbox/[rfpId] (제출 후 인플레이스 흡수 — 별도 /submitted 라우트 없음), /inbox/@modal/(.)[rfpId] (인터셉트 딜룸 모달)
│  ├─ opportunities/          # pg — 오픈 RFP 게시판 (비초대 PG 발견·콜드 피치)
│  ├─ tutorial/               # buyer+pg — 온보딩 튜토리얼. 홈 환영 모달(WelcomeModal)/재유도 배너(TutorialNudge)의 진입점. buyer는 BuyerTutorialFlow(components/onboarding/tutorial/)가 같은 라우트 내 phase 전환(작성→도착연출→비교·선정→완료, 전부 fixture)으로 실제 여정 제공. pg는 PgTutorialFlow가 같은 방식으로 초대 수신 연출→요청 조건 확인(RfpBriefPanel)→견적 작성·제출(BidWizard)→완료(봉인 입찰 안내) 여정 제공. **오픈 샌드박스 계약(v0.3.4.0)**: 폼은 전부 프리필(무입력 클릭 완주는 여전히 성립 — e2e/tutorial-click-through.spec.ts가 커버)이지만 차단이 없다 — 키보드락·클릭 실드·밖-클릭 넛지 제거, 사용자는 값을 바꾸고 화면을 자유롭게 탐색할 수 있다. action 코치마크는 타깃 클릭을 기다리며(진행 로직 불변), 타깃 버튼이 disabled면 말풍선에 막힘 힌트를 띄운다. **오프코스 리졸버(v0.3.5.0)**: 사용자가 안내 코스를 벗어나 화면을 직접 바꿔도(위저드 이전/스텝 인디케이터 점프·info 안내 무시하고 실제 버튼 클릭·검증에 막힌 클릭) CoachmarkTour가 250ms 폴링(2틱 히스테리시스, ~0.5s)으로 현재 화면에 실재하는 action 앵커를 찾아 그 스텝으로 즉시 점프·복귀한다 — 전제는 "한 화면에 이 투어의 action 앵커 최대 1개"(위저드 next-N은 스텝별 상호배타, `components/onboarding/tutorial/__tests__/tours.test.ts` 드리프트 가드가 위저드 스텝 상수와 정합을 못박음). action 2개 이상인 투어에서만 인터벌이 돌고(1개 이하는 점프 경로 도달 불가라 미생성), 앵커 0개(전환 중)·2개 이상(모호)·expected 없음(마지막 action 이후)이면 관망한다. 클릭이 접수됐지만 실제 진행이 막혀 다음 타깃이 나타나지 않는 경우도 리졸버가 ~0.5s 안에 직전 action 스텝으로 되돌리며(단, 마지막 action 클릭은 capture 시점에 투어가 종료돼 미적용 — PG 제출 확인창 취소 좌초는 TODOS 후속), 기존 notFound 타임아웃 복귀는 폴백으로 유지된다. 점프가 사용자 화면을 당기지 않도록 이미 뷰포트에 보이는 앵커는 스크롤하지 않고(완전히 밖일 때만 center 스크롤 — useAnchorRect 공통), 스텝 전환(점프 포함)은 말풍선 옆 sr-only `role=status` 라이브 리전으로 공지된다. /tutorial 밖 내부 링크 클릭은 TutorialLeaveGuard가 가로채 [계속 체험하기|나중에 하기(dismissed)|건너뛰기(completed)] 확인 후 이동(프로그래매틱 이동·뒤로가기는 미가드 — 무스탬프라 환영 모달 재노출로 흡수). 실 백엔드 터치는 스텁: 첨부 드롭존 sampleMode(가상 첨부), 템플릿 저장 안내 토스트. 건너뛰기 계약(v0.3.2.0)·Esc 무반응·라이트 스포트라이트 링 펄스(v0.3.3.0)는 유지. **건너뛰기 계약(v0.3.2.0)**: 코치마크의 건너뛰기 버튼 클릭 = 정상 완주와 동일하게 completed 스탬프+done 화면 점프(양 플로우 handleComplete 공유, 재진입 가드 포함). Esc는 코치마크에 무반응 — onSkip이 비가역 완료와 묶이면서 오발 Esc(⌘K 닫기·앵커 탐색 구간)가 영구 완료가 되는 사고를 막기 위해 CoachmarkTour의 전역 Esc 리스너를 제거함(스킵=버튼 전용). **라이트 스포트라이트(v0.3.3.0)**: 코치마크가 화면을 어둡게 덮던 dim 스크림을 제거 — 배경은 밝게 유지된다. 타깃 강조 링에 opacity 소프트 펄스(`.coachmark-pulse`)를 더해 시선을 유도한다(`prefers-reduced-motion` 존중, 자세히는 DESIGN.md §6)
│  ├─ messages/               # buyer+pg 공통 — 라이브 채팅 (Centrifugo WS)
│  ├─ notifications/          # 인앱 알림 목록 페이지
│  ├─ quote-templates/        # pg — 견적 템플릿 (정산조건·가입비·수수료율 저장, top-level PG 라우트 — settings 하위 아님)
│  ├─ signing-templates/      # pg — 전자서명 템플릿 설정 (자사 계약서를 SnowSign Templates 로 1회 등록·링크, top-level PG 라우트)
│  ├─ workspace/new/          # 워크스페이스 생성
│  └─ settings/{profile,members,notifications,audit-log}/
├─ logout/route.ts            # GET (redirect to /login) + POST (204, for client-side signOut)
└─ (no middleware.ts)         # auth guard는 app/(app)/layout.tsx의 서버 redirect로 처리 (resolveShellAccess)
```

Workspace type (`buyer` vs `pg`) determines which sub-tree of `(app)/*` is shown — same shell, different navigation.

**Shell-guard gates (`resolveShellAccess` in `lib/auth/shell-access.ts`)**: the `(app)/layout.tsx` guard runs ordered redirects — unauth → `/login`, incomplete-but-authed (no membership) → `/logout`, **email-unverified → `/pending-approval`**, workspace `pending` → `/pending-approval`, workspace `suspended` → `/suspended`. The email-verification gate is **first-class and independent of workspace status** — an unverified member is redirected even when their active workspace is already `active` (closes the canonical-PG-join hole where joining an approved workspace skipped verification). `emailVerified` is read **live from the DB** (`getDbEmailVerified`, not the JWT) so a just-completed verification takes effect without re-login; after verifying, `EmailVerifyScreen` hard-navigates (`window.location.assign('/home')`) so the guard re-branches by workspace status. (Data-boundary enforcement on server actions / API routes is deliberately deferred — see TODOS.md.)

**Host routing (prod only)**: the single Next.js app serves two hostnames — `support-b.com` (buyer) and `partner.support-b.com` (PG). Route tree is unchanged; `(app)/layout.tsx` reads the request host and redirects a mismatched session to its correct host (`lib/site-routing.ts`). `/signup` also reads the host and redirects to `/signup/buyer` or `/signup/pg` without a role-chooser screen (`signupTargetForHost` in `lib/site-routing.ts`). Session cookie is scoped to `.support-b.com` for cross-subdomain SSO (`AUTH_COOKIE_DOMAIN`). Workspace switch navigates across hosts. PG-facing emails link to `partner.support-b.com`. Local dev uses a single host (routing disabled). Env vars: `NEXT_PUBLIC_BUYER_ORIGIN`, `NEXT_PUBLIC_PARTNER_ORIGIN`.

**SEO / AI(GEO) 텍스트 엔드포인트**: `/llms.txt`(큐레이션 인덱스)·`/llms-full.txt`(전체 마크다운)는 host-aware route handler(`app/llms.txt`·`app/llms-full.txt`)로 buyer/PG 청중별 사실을 `text/plain`으로 제공한다. `app/robots.ts`·`app/sitemap.ts`도 host-aware로 전환 — buyer 호스트는 자기 origin 참조 + 주요 AI 크롤러 명시 허용하지만, **partner(PG) 호스트는 전면 비색인**(`buildRobots(origin, 'pg')`가 모든 크롤러에 `disallow: ['/']` 반환, `buildSitemap`도 빈 배열, `proxy.ts`가 응답에 `X-Robots-Tag: noindex, nofollow` 헤더까지 얹어 이미 색인된 페이지도 제거 유도 — `lib/site-routing.ts`의 `shouldNoindexHost`). 콘텐츠 SSOT는 `lib/seo/{host,product-facts,llms,robots,sitemap,jsonld}.ts`이며 FAQ는 랜딩 상수(`faq-data`·`pg-faq-data`)를 재사용해 드리프트가 없다. 공식 표기는 '서포트비'(`siteConfig.name`/`PRODUCT_NAME`)이며, 브랜드 별칭('서포트 B'·'서포트B'·'Support B'·'Supporter B')은 `lib/site-config.ts`의 `BRAND_ALIASES`가 단일 출처 — llms.txt 프리앰블의 별칭 문장(`lib/seo/llms.ts`)과 JSON-LD `alternateName`(`lib/seo/jsonld.ts`)이 이를 직접 소비한다. `siteConfig.keywords`(한글 별칭 2종)와 랜딩 푸터 표기('서포트비 CORP.')는 리터럴 병기 — 별칭 변경 시 함께 갱신해야 한다. JSON-LD 스키마 빌더는 `lib/seo/jsonld.ts`에 있고, `buildOrganizationJsonLd`는 buyer 랜딩(`app/page.tsx`)·PG 랜딩(`pg-landing-data.ts`, description 오버라이드)이 공유하며 `buildSoftwareApplicationJsonLd`는 buyer 랜딩 전용, `<script type="application/ld+json">` 인라인 직렬화는 반드시 같은 파일의 `serializeJsonLd`(`<`·`>`·U+2028/U+2029 유니코드 이스케이프 — `</script>` 태그 탈출 방지)를 쓴다(raw `JSON.stringify` 금지). 랜딩 히어로 지표(`HERO_METRICS`)는 `components/landing/hero-metrics.ts`에 단일 출처로 추출돼 `LandingHero.tsx`와 `product-facts.ts`(BUYER_FACTS.metrics)가 공유하며, `lib/seo/__tests__/product-facts.test.ts` 드리프트 가드 테스트가 양쪽 캡션 일치를 보장한다. 두 txt 경로는 `proxy.ts`/`lib/auth/proxy-matcher.ts` 매처에서 robots/sitemap과 함께 제외해 비인증 크롤러가 접근한다. `app/layout.tsx` metadata의 `alternates.types['text/plain'] = '/llms.txt'` 선언으로 ChatGPT·Perplexity 등 AI 크롤러가 `<head>`에서 자동발견 가능하다. 매처 세그먼트의 점(`.`)은 `\\.`으로 이스케이프해 파일명이 리터럴 점으로만 매칭된다(`llmsXtxt` 같은 경로가 의도치 않게 제외되는 것을 방지).

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
│  ├─ notification.ts# NotificationService: markRead / markAllRead / retryEmail
│  └─ contract-signing.ts # ContractSigningService: 선정 후 전자서명(SnowSign Templates) — onAward/onTemplateReady/reconcile/cancel/remind/resend/getForActor/getDownloadUrl. 얕은 SnowSignClient(lib/server/signing/) 파사드
└─ repositories/     # DB 접근 추상화 (Drizzle 구현 — 단위 테스트는 PGlite 로 실 DB 검증)
```

**서비스 레이어 규칙:**
- 서비스는 트랜잭션·알림 팬아웃·이메일 아웃박스를 소유한다. 액션은 이를 직접 다루지 않는다.
- **알림 팬아웃 단일 API**: `lib/server/notifications/notify.ts`의 `notify(tx, input)` — 수신자별 in-app row insert(`dispatchNotification`)와 email outbox enqueue를 채널(`inapp`/`email`) 지정 한 번으로 처리하고, 생성된 `Notification[]`을 반환한다(호출자가 `pendingEmits`에 모아 commit 후 emit). `rfp.ts`/`bid.ts`/`chat.ts`/`team-chat.ts`의 알림 발송 흐름 12곳(`notify()` 호출 지점 기준으로는 18곳 — 한 흐름이 수신자 그룹·채널별로 여러 번 호출하기도 한다)이 모두 이 API로 통일되어 있다 — 신규 알림 발송 코드는 `dispatchNotification`+`outboxRepo.enqueue` 두 호출을 직접 조합하지 말고 `notify()`를 쓴다. **범위 밖(의도적)**: `auth.*`/`workspace.*` 서비스와 `lib/server/actions/workspace/_workspaceInviteNotify.ts`는 기존 `dispatchNotification`/outbox 직접 호출 패턴을 그대로 유지한다.
- `Actor = { userId, workspaceId }` — 세션에서 추출해 액션이 서비스에 전달한다.
- `ServiceResult<T> = { ok: true } & T | { ok: false; error: string }` — 서비스 레이어 반환 타입. 예외 throw 없이 결과를 반환한다.
- `ActionResult<T> = { ok: true } & T | { ok: false; error: string }` — 액션 레이어 반환 타입 SSOT (`lib/server/actions/_result.ts`). 각 도메인 파일의 동일 타입 선언을 대체한다.
- 액션 공통 세션 헬퍼: `requireBuyerActor` / `requirePgActor` / `requireActiveWorkspace` (`lib/server/actions/_session.ts`) — 세션 검증·Actor 추출 로직의 단일 출처. 신규 액션 작성 시 `_shared.ts` 대신 이 헬퍼를 사용한다.
- 서비스 싱글턴은 Next.js `globalThis` 캐싱 패턴 사용 (`getRfpService()` / `getBidService()` 등).

**리포지토리 경계 (ESLint 강제):** 모든 DB 접근은 `lib/server/repositories/**` 가 소유한다. 그 밖의 `lib/`·`app/` 코드는 `@/lib/db/schema`·`@/lib/db/client` 를 **값(value)으로 정적 import 할 수 없다** — 레포를 주입(`repositories/factory` 의 `get*Repo()`)해서 쓴다. `import type { DB }`(타입 전용)와 서비스의 동적 `import('@/lib/db/client')`(트랜잭션 핸들)는 허용. 위반 시 lint 에러(`@typescript-eslint/no-restricted-imports`, 규칙명 `repo-boundary/db-access`) + 독립 드리프트 가드 테스트(`lib/server/__tests__/repo-boundary.test.ts`)가 잡는다. **의도적 예외**(`lib/server/db-boundary-allowlist.mjs` 에 명문화, 단일 출처): storage 바이트-블롭 티어(`storage/{postgres,index}.ts`), 크로스-애그리거트 캐스케이드(`_purgeUnverifiedSignup.ts`), `actionDb()` 테스트-오버라이드 레지스트리(`actions/auth/_shared.ts`). 예외를 늘리려면 allowlist 에 추가하고 리뷰한다.

## Linear Design Language — Hard Rules

These are non-negotiable visual decisions enforced across all screens. The design language is **Linear** — dense, fast, structure carried by low-contrast borders not shadows. Light-first; dark mode is Linear's signature near-black (`#08090A`). **Note:** token *names* keep the `--md-sys-*` prefix from the prior MD3 system — only the values are Linear. `md-sys` in the name does not mean MD3. DESIGN.md is the canonical source.

- **No** Inter/Roboto/Arial direct import. Pretendard Variable (KR + Latin, Inter-derived) + JetBrains Mono only.
- **No** pill buttons. Interactive elements are 6px (`shape-small`). `shape-full` (9999px) only for Avatars, status dots, pills indicators.
- **No** hover shadow promotion — hover is a background-lightness shift only.
- **No** heavy/skeuomorphic shadows — most surfaces use a 1px border or elevation-1; big shadows only on floating elements (popover, dropdown, toast, dialog, command palette).
- **No** high-contrast dividers — default to `outline-variant` (the deliberately low-contrast border). The faint border IS the Linear look, not a bug.
- **No** body text ≥ 16px — app body is 14px, dense (~32px rows, 28–36px buttons / default 32px).
- **No** accent gradients/neon/glassmorphism/blurred orbs. The accent is solid trust blue `#0061A4`. (단 하나의 좁은 예외: 랜딩 히어로 다크 씬 소프트 블룸 — DESIGN.md §9 랜딩·마케팅 예외 ⑤.)
- **No** illustrated empty states. Line SVGs (1.4–1.5 stroke) only.
- **로딩 모션 허용** — 넓은 영역은 펄스 스켈레톤, 인라인·타이핑 인디케이터는 펄스 점(staggered). `prefers-reduced-motion: reduce` 존중(저감 시 정지/단순화). 버튼 진행 등 짧은 `LOADING…` 텍스트 표기는 그대로 두어도 무방. 장식적 컨페티·강한 모멘텀 모션 제한은 유지(DESIGN.md §9 세 예외 — "축하 모먼트"·"테마 전환 리빌"·"랜딩/마케팅 모션"). 자세히는 DESIGN.md §6 "로딩 모션".
- **No** № symbol (U+2116 NUMERO SIGN) anywhere — use plain numerics or zero-padded strings.
- **All** numerics (₩, qty, dates, RFP numbers like `P-2605-0042`) use `.md-numeric` class (mono + tabular-nums). Never on nav/labels/buttons.
- **Status** uses Chip component — never bracketed plain text `[ 결재중 ]`.
- **Typography** uses the typescale tokens — no `font-mono uppercase tracking` on labels/nav; sentence case with slight negative tracking.
- **Chip color** mapping: 성공/완료→tertiary, 실패/오류→error, 보류/신규→warning, 중립→surface, 주요→primary.
- **Motion** animates transform/opacity/color only (never layout); cause→effect under ~100ms (`duration-short-4`). 단, DESIGN.md §9의 세 예외(① "축하 모먼트" — 종결 성공 1회성 컨페티, ② "테마 전환 리빌" — View Transitions clip-path, ③ "랜딩·마케팅 모션" — 랜딩/마케팅 면은 스크롤 pin·진입 스케일·가이드 커서 등 몰입형 모션 및 `prefers-reduced-motion` 미존중 허용)는 별도.

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
