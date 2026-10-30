# CLAUDE.md

코딩 에이전트의 진입점이다. Claude Code는 이 파일을, Codex는 상대 심링크 `AGENTS.md`로 같은 바이트를 읽는다.

**지침은 `CLAUDE.md`에서만 고친다.** `AGENTS.md`를 편집·생성하면 제자리 쓰기는 이 파일을 덮어쓰고, 원자적 저장은 심링크를 사본으로 되돌린다. "AGENTS.md가 너무 길다"에 반응하는 문서 리팩터 스킬도 `AGENTS.md`에 겨누지 않는다. 심링크를 통과한 쓰기는 `git status`에 `CLAUDE.md` 변경으로 나타난다.

> **Codex 절단 확인**: Codex는 프로젝트 문서를 `project_doc_max_bytes`(기본 32KiB)에서 표시 없이 자른다. 잘렸는지 먼저 확인하라 — 온전한 이 파일의 마지막 줄은 `END`를 담은 HTML 주석 센티널이다(리터럴을 여기 적으면 잘린 로드도 `grep`을 통과한다). 그 줄로 끝나지 않으면 `cat "$(git rev-parse --show-toplevel)/CLAUDE.md"`로 다시 읽는다. 항구적 해결은 `~/.codex/config.toml`의 `project_doc_max_bytes = 262144`다(저장소 안 `.codex/config.toml`은 무시된다). Claude Code는 이 파일 뒤에 다른 지침을 이어 붙이므로 이 검사를 건너뛴다.

## Documentation Map

작업을 시작하기 전에 해당 문서를 읽는다. 제품 규칙의 근거는 코드·테스트와 `SCREEN_DESIGN.md`의 "확정 결정" 블록이다. 판단이 확정 결정과 충돌하면 **멈추고 묻는다**. `docs/superpowers/**`는 과거 계획 기록이므로 코드로 재확인한다.

| 작업 | 문서 |
|---|---|
| 제품 규칙: 오픈 게시판, 참여 요청, 접수 기간, 견적 수정 요청, PG 피커, PG 필드 숨김, 신규 계약 면제, 질문 흐름, 맞춤 PG 상담, 업종, 영업일 마감, 로그인 전 견적, 구매사 자동 승인, 노온 합의서·서명, 견적 템플릿 폐지, 도메인 어휘 | `docs/agents/product-rules.md` |
| 라우트 트리, 셸 가드, PG 승인·워크스페이스 게이트, 운영계정, 호스트, SEO·GEO, 프록시 매처, 별도 레포 연동 | `docs/agents/routing.md` |
| 서비스 구성, 알림 일괄 삽입, 아웃박스, 리포지토리 경계, 싱글턴, 읽음 상태, 스토리지·업로드, 로깅, 실시간 | `docs/agents/server.md` |
| `/tutorial`, 코치마크 | `docs/agents/tutorial.md` |
| 화면 IA·라우트 맵·화면별 UX | `SCREEN_DESIGN.md` |
| 시각 변경: 토큰, 타이포, 색, 컴포넌트 | `DESIGN.md` |
| 사용자에게 보이는 한국어 문구 (필수) | `UX_WRITING.md` |
| 도메인 용어와 이름 짓기. 제품 규칙이 아니라 용어집이다 | `CONTEXT.md` |
| 신뢰 경계 변경. 같은 PR에서 해당 절과 AR-N을 갱신한다 | `docs/THREAT_MODEL.md` |
| 운영 배포: Lightsail 단일 VM(Caddy + PM2 `next start` + Docker Postgres) | `docs/DEPLOY_LIGHTSAIL.md` |
| 스테이징 자동 배포 | `docs/STAGING.md` |
| 기능별 DDL 순서·복구. 새 DDL은 앱 배포보다 먼저 적용하며 제품 규칙의 각 절이 런북을 링크한다 | `docs/*_ROLLOUT.md` |
| 전자서명 공급자 API. 외부 스펙 사본이다 | `docs/SNOWSIGN_API.md` |
| 로컬 설정·실행 | `README.md` |
| 부채 대장(P1~P4). 해결분은 지우지 않고 `~~취소선~~ — 해결 (vX.Y.Z.W)`로 남긴다 | `TODOS.md` |
| 참고 기록: docs 경유 유입, 업종 탐색 메타데이터 동기화, 국세청 대표자명 조사(구현 전 자료), Dependabot 패치 | `docs/DOCS_ATTRIBUTION.md`, `docs/INDUSTRY_NAVIGATION.md`, `docs/NTS_REPRESENTATIVE_NAME.md`, `docs/DEPENDABOT_PATCH_PLAN_2026-09-15.md` |

**버전**: 단일 출처는 `VERSION`(4자리 `MAJOR.MINOR.PATCH.MICRO`)이다. `CHANGELOG.md` 최상단 헤더는 항상 같은 값이고, `package.json`은 npm이 4자리를 거부하므로 3자리 번역본을 담는다(`0.5.6.1` → `0.5.6`). `lib/__tests__/version-stamp.test.ts`가 검증한다.

## Domain Context

`buyer` 워크스페이스(구매사)가 견적을 요청하고 `pg` 워크스페이스(결제대행사 영업담당)가 견적을 보내는 양면 플랫폼이다.

**용어**: 코드 식별자·라우트·DB는 영어(`RFP`/`bid`, `/rfp`, `rfps`/`bids`)이고, 사용자에게 보이는 한국어는 '견적 요청'(RFP)·'견적'(bid)·'선정'(award)으로 통일한다(`UX_WRITING.md` §8). 구매사 랜딩/마케팅 면(CTA·서비스 명칭·사이트 제목·SEO)은 **'맞춤 PG 견적'** 프레이밍을 쓴다. PG 랜딩은 '경쟁 입찰' 프레이밍을 계속 허용한다. 공식 서비스 표기는 '서포트비'이며 단일 출처는 `lib/site-config.ts`의 `siteConfig.name`이다.

모든 변경에서 지키는 불변식:

- **봉인 입찰**: 입찰 자격은 구매사가 워크스페이스 ID allowlist(`rfp_allowed_pg`)로 통제한다. PG는 서로의 존재와 경쟁사 수를 볼 수 없으며 `Bid.competitorCount`는 의도적으로 존재하지 않는다.
- **오픈 게시판 화이트리스트**: 기존 `sent` 견적의 게시판은 비경쟁 정보인 `견적번호`·`구매사명`(workspace name)·`제목`·`홈페이지`·`마감일`·`요청 결제수단`(+커스텀 라벨)·`주요 상품`·`계약 유형`만 공개한다. 수수료·현재 조건·거래액·bizNo·메모·첨부는 공개 대상이 아니다. 경계는 `OpportunityListing`(`lib/types/pg-request.ts`), `lib/server/repositories/drizzle/rfp-pg-request.ts`의 명시적 SELECT projection, 그 `__tests__`의 exact-key 가드 테스트다. **이 타입에 필드를 더하면 공개 경계가 넓어지므로 UI 수정이 아니라 봉인 입찰 결정으로 다룬다.** 필드 목록의 산문 출처는 이 블록 하나다. README.md와 SCREEN_DESIGN.md는 여기를 가리킨다.
- **PG 비공개 필드는 서버에서 제거한다**: `hidden_from_pg` 경로는 `loadPgRfpDetail`이 `PG_STRIP`으로 fail-closed 제거한다. `RfpBriefPanel`의 렌더 게이트는 시각 폴백일 뿐이다.
- **화면 게이트는 쓰기 경계가 아니다**: 접수 기간은 `lib/rfp/bid-window.ts`가 표시를 정하고, `BidService.submit`이 RFP 행 잠금 안에서 최종 재검증한다.
- **신규 구매사 요청은 맞춤 PG 상담**이다: 업종별 관리자 정책으로 한 PG에 상담을 요청하고 게시판·추가 초대·참여 수락을 차단한다. 기존 발송 1:N 견적은 보존한다.
- **신규 계약 당사자는 주식회사 노온과 구매사**다: 선정 PG는 이용 대상·수수료 조건으로만 기록한다. 기존 `pg_buyer` 계약은 내부 보존만 유지하고 사용자 표면에서 숨긴다.

## Current Stack

버전은 `package.json`, Node는 `mise.toml`(로컬 mise·CI `setup-node`가 읽는 단일 출처)을 본다. 패키지 매니저는 pnpm이다.

| Layer | Choice |
|---|---|
| Framework | Next.js App Router(Turbopack 기본, async `params`/`searchParams`), React, TypeScript strict |
| Auth | Auth.js v5. `proxy.ts`가 요청 라우팅을, `(app)/layout.tsx`의 `resolveShellAccess`가 화면 접근을 판정한다 |
| DB | Drizzle ORM + Postgres |
| Storage | 첨부·계약 보관본은 Cloudflare R2(`getStorage()`, 환경변수 없으면 throw), 프로필 사진은 Postgres bytea(`getUserAvatarRepo()`) |
| Styling | Tailwind v4 + CSS Variables(`@theme`), `@base-ui/react`(shadcn base-nova, 스캐폴딩 전용) + Radix 일부, lucide-react, cmdk |
| Fonts | `next/font/local`: Pretendard Variable, Nunito Variable(숫자), JetBrains Mono Variable(ASCII) |
| State·Forms | Zustand, zod v4 + Server Actions. 폼은 `useState` + zod로 만들며 react-hook-form은 쓰지 않는다 |
| Client data | SWR: `force-static` 랜딩 헤더의 세션 재조회(`components/landing/use-session-authed.ts`) |
| Numeric input | `react-number-format`: `CurrencyInput`, `DayOffsetInput` |
| 한글 처리 | `es-hangul` 단일 출처: 조사 `josa()`, 초성 검색 `disassemble`, 숫자→한글 `numberToHangulMixed` |
| Motion | `motion`. 임포트는 `motion/react` |
| Email | Resend + `@react-email/render` |
| Ops | Pino + Axiom, Sentry, Channel.io |
| Realtime | Centrifugo + `centrifuge-js`. 메시지는 자사 Postgres에만 영속한다 |
| Testing | Vitest + PGlite(단위), Playwright(e2e) |

## Routing Architecture

```
app/
├─ quote-start/   # 공개 실작성, noindex
├─ demo/          # 공개 구매사 데모. 세션 메모리만 사용, 실제 업무 API 미호출
├─ legal/         # 공개 법적 고지. 판본은 lib/auth/signup-documents.ts
├─ (public)/      # 비인증: /login, /signup/{buyer,pg}/*, /password/*, /invite/{rfp,workspace}/[token], /auth/*, /pending-approval, /suspended
├─ (app)/         # 인증 + AppShell. 워크스페이스 타입이 내비게이션을 가른다
│  ├─ rfp/ rfp-create/ contracts/   # buyer
│  ├─ inbox/ opportunities/         # pg
│  ├─ home/ tutorial/ messages/ notifications/ workspace/new/ settings/
│  └─ quote-templates/ contract-templates/   # 폐지, 404
└─ logout/route.ts
```

- **가드 순서**: `resolveShellAccess`(`lib/auth/shell-access.ts`)는 미인증 → `/login`, 멤버십 없음 → `/logout`, 이메일 미인증 → `/pending-approval`, 워크스페이스 `pending` → `/pending-approval`, `suspended` → `/suspended` 순으로 분기한다. 이메일 인증은 JWT가 아니라 DB 라이브 리드다.
- **서버 게이트**: `requireSession`과 API의 `isWorkspaceInactive`가 워크스페이스 `active`를, `isPgMembershipBlocked`가 PG 승인을 요청마다 DB에서 확인한다. 계정 복구·가입·초대 수락·워크스페이스 전환만 `allowInactiveWorkspace`를 명시한다.
- **호스트**: 운영은 한 앱이 `support-b.com`(buyer)과 `partner.support-b.com`(PG)을 서빙하고 로컬은 단일 호스트다. `NEXT_PUBLIC_BUYER_ORIGIN`·`NEXT_PUBLIC_PARTNER_ORIGIN`은 둘 다 설정하거나 둘 다 비운다. 원 출처 폴백은 `lib/site-routing.ts`의 `baseUrl()`이다.
- **프록시 매처**: `proxy.ts`의 인라인 리터럴과 `lib/auth/proxy-matcher.ts`를 함께 바꾸고 `next build`로 확인한다. Next가 매처를 정적 분석하므로 유닛 green이 build green을 보장하지 않는다.
- **초안 격리**: 랜딩·튜토리얼·공개 데모는 `createRfpDraftStore`의 독립 메모리 store를 `RfpDraftProvider`로 전달한다. 회원 전역 store의 값이나 persistence를 임시로 바꾸지 않는다.
- **별도 레포**: Admin 콘솔은 `bothsides-platform-dev/admin-supporter-b`(`app/admin/` 없음, DB 마이그레이션 소유권은 이 레포), PG 용어 사전은 `bothsides-platform-dev/docs-supporter-b`다.

## Server Architecture

`lib/server/`는 Actions → Services → Repositories 방향으로만 의존한다.

- **Actions**: 세션 검증과 입력 파싱 뒤 서비스에 위임한다. 세션 헬퍼는 `requireBuyerActor`·`requirePgActor`·`requireActiveWorkspace`(`lib/server/actions/_session.ts`), 반환 타입은 `ActionResult<T>`(`lib/server/actions/_result.ts`)다. 액션은 DB 핸들을 만지지 않는다.
- **Services**: 트랜잭션·알림 팬아웃·이메일 아웃박스를 소유하고 `Actor = { userId, workspaceId }`를 받아 `ServiceResult<T>`를 반환한다. 예외를 throw하지 않는다. 트랜잭션 핸들은 `repositories/factory`의 `getDb()`, 싱글턴은 `lib/server/_singleton.ts`의 `defineAsyncSingleton`으로 만든다.
- **Repositories**: 모든 DB 접근을 소유한다. 그 밖의 코드는 `get*Repo()`를 쓰고 `@/lib/db/schema`·`@/lib/db/client`를 값으로 import할 수 없다(`import type`은 허용). ESLint `repo-boundary/db-access`와 `lib/server/__tests__/repo-boundary.test.ts`가 강제하고, 예외는 `lib/server/db-boundary-allowlist.mjs`에만 둔다.
- **알림**: 신규 발송은 `lib/server/notifications/notify.ts`의 `notify(tx, input)`로 한다. 수신자별 값은 루프 대신 `dedupeKey`·`linkUrl`에 함수를 넘긴다. **`dedupeKey`는 수신자마다 달라야 한다** — 상수 키는 첫 1건 말고 메일을 조용히 없앤다.
- **이메일**: `lib/server/outbox/` 실행기를 호출한다. 신규 코드에서 `outboxRepo.flush()`를 쓰지 않는다.
- **테스트**: 액션·로더는 `lib/server/__tests__/_harness.ts`의 `setupServerTestEnv()`, 서비스는 SUT를 `new XService(…)`로 직접 조립한다.

## Linear Design Language — Hard Rules

모든 화면에 적용한다. 밀도 높고 빠르며 구조는 그림자 대신 저대비 보더로 만든다. 라이트 우선, 다크는 `#08090A`다. 토큰 이름의 `--md-sys-*`는 이전 시스템의 접두사이고 값은 Linear다. 캐노니컬 출처는 `DESIGN.md`이며 프런트 코드가 "generic SaaS"처럼 보이면 §9부터 확인한다.

- **폰트**: Pretendard Variable + Nunito(숫자) + JetBrains Mono(ASCII)만 쓴다. Inter/Roboto/Arial을 직접 import하지 않는다.
- **형태**: 인터랙티브 요소는 6px(`shape-small`)이다. `shape-full`은 Avatar·상태 점·필 인디케이터에만 쓴다.
- **깊이**: 표면은 1px 보더나 elevation-1이고, 큰 그림자는 popover·dropdown·toast·dialog·command palette에만 쓴다. 호버는 배경 명도 변화만이다.
- **보더**: 기본은 `outline-variant`다. `outline`은 보더 전용이라 보조 텍스트·아이콘은 `on-surface-variant`를 쓴다(장식 예외는 `lib/design/design-hardrule-allowlist.mjs`의 `OUTLINE_TEXT_ALLOWLIST`).
- **타입**: 본문 16px/1.5, 밀도 높은 표·리스트 14px, 캡션 13px, 짧은 메타 라벨 12px이 하한이다. 밀도는 간격과 위계로 만든다(행 ~32px, 버튼 28–36px, 기본 32px). typescale 토큰을 쓰고 라벨·내비는 sentence case다. `font-mono uppercase tracking`을 쓰지 않는다.
- **색**: 액센트는 단색 trust blue `#0061A4`다. 그라디언트·네온·글래스모피즘·블러 오브는 금지이고 예외는 랜딩 히어로 소프트 블룸 하나다(§9).
- **숫자**: ₩·수량·날짜·`P-2605-0042` 같은 번호는 `.md-numeric`을 쓴다. 내비·라벨·버튼에는 쓰지 않으며 예외는 랜딩 서비스 메뉴 예정 Chip의 연도 숫자뿐이다. № 기호(U+2116)는 쓰지 않는다.
- **상태**: `[ 결재중 ]` 같은 괄호 텍스트 대신 Chip을 쓴다. 성공/완료→tertiary, 실패/오류→error, 보류/신규→warning, 중립→surface, 주요→primary.
- **빈 상태**: 1.4–1.5 stroke 라인 SVG만 쓴다.
- **모션**: transform/opacity/color만 움직이고 인과는 ~100ms(`duration-short-4`) 안이다. 로딩은 넓은 영역 펄스 스켈레톤, 인라인 펄스 점이며 진행 문구는 `처리 중…`/`불러오는 중이에요…`다. `prefers-reduced-motion`을 존중한다. 컨페티·몰입형 모션은 §9의 다섯 예외(축하 모먼트, 테마 전환 리빌, 브랜드 마크 진입, 예상 절감 계산기, 랜딩·마케팅 모션)에서만 허용한다.

## TDD — Hard Rules

모든 코드 변경은 `mattpocock-skills:tdd` 스킬을 발동하고 RED → GREEN → REFACTOR로 진행한다.

> **NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.**

- `__tests__/<name>.test.ts(x)`에 테스트를 쓰고 `pnpm test <path>`로 빨갛게 떨어지는 것을 직접 본 뒤 구현한다. 즉시 통과한 테스트는 가짜 테스트다.
- 구현부터 쓴 코드는 참고용으로도 남기지 말고 삭제한 뒤 테스트부터 다시 시작한다.
- 버그 픽스는 회귀 테스트로 재현한 뒤 고친다.
- GREEN은 통과에 필요한 최소 코드만 쓴다. 미래를 위한 옵션·파라미터·추상화는 넣지 않는다.
- 수동 브라우저 클릭은 시각 확인용이며 자동 테스트와 병행한다.

**면제**(확신이 안 서면 테스트부터): 커밋하지 않는 prototype/spike, 생성 코드, 순수 설정 파일(`*.config.*`, `eslint.config.mjs`, `drizzle.config.ts` 등), 시각/스타일만 바꾸는 변경(상태·핸들러·조건 분기를 같이 추가하면 비면제), 단순 조립인 `app/**/page.tsx`·`app/**/layout.tsx` shell.

## When Editing Documentation

- **이 파일**: 모든 세션에 실리므로 모든 작업에 필요한 규칙과 포인터만 둔다. 일부 작업에만 필요한 상세는 `docs/agents/`로 내린다. 마지막 줄의 센티널은 항상 파일 끝에 두고 그 리터럴을 본문에 또 적지 않는다. `lib/__tests__/agent-entrypoint.test.ts`가 심링크·센티널·32KiB 상한·포인터를 지킨다.
- **교차 참조**: `CLAUDE.md`, `README.md`, `DESIGN.md`, `SCREEN_DESIGN.md`는 서로 참조하므로 변경 후 함께 맞춘다.
- **토큰**: `DESIGN.md` 토큰을 고치면 `styles/tokens.css`도 고친다. 브라우저/PWA chrome을 함께 움직이는 `--md-sys-color-background`의 JS 사본은 `lib/theme/canvas-colors.ts`의 `CANVAS_COLOR` 한 곳이며 hex를 다시 타이핑하지 않는다. `app/__tests__/chrome-colors.test.ts`가 드리프트를 잡는다.
- **화면·라우트**: `SCREEN_DESIGN.md` §0 라우트 맵과 화면 표에 등록하고, 새 최상위 트리는 위 Routing Architecture에도 넣는다. 로그인 중에도 열려야 하는 `app/(public)` 페이지는 `lib/auth/route-decision.ts`의 `ALWAYS_PASSTHROUGH_PREFIXES`에 등록한다.
- **도메인 어휘**: 결제수단은 `PAYMENT_METHODS`, 가맹점 등급은 `MERCHANT_TIERS`(둘 다 `lib/types/bid.ts`), 현재 운영 솔루션은 `SOLUTION_VALUES`(`lib/types/rfp-terms.ts`, 라벨은 `lib/rfp/solutions.ts`)가 단일 출처다. 새 값은 해당 배열 한 곳과 라벨에 추가하고 액션·스키마·위저드에 배열을 복제하지 않는다.

## Skill routing

개발 워크플로는 [mattpocock/skills](https://github.com/mattpocock/skills)의 `mattpocock-skills` 플러그인으로 통일한다. Codex·Claude Code 모두 `mattpocock` 마켓플레이스에서 설치하고 같은 스킬의 수동 복사본을 추가하지 않는다.

- `mattpocock-skills:tdd` — 모든 신규 코드/버그픽스/리팩터링 직전 필수.
- `mattpocock-skills:grill-with-docs` / `mattpocock-skills:to-spec` — 요구사항·설계 결정 정리. 기존 도메인 규칙과 ADR을 먼저 확인한다.
- `mattpocock-skills:codebase-design` — 새 기능의 모듈 경계와 인터페이스 검토.
- `mattpocock-skills:diagnosing-bugs` — 버그·에러·예상치 못한 동작.
- `mattpocock-skills:code-review` — 변경 검토.
- `mattpocock-skills:pr` — PR 생성·갱신. 기존 버전·변경 기록·CI 규칙을 함께 지킨다.
- `mattpocock-skills:writing-for-agents` — `CLAUDE.md`·`docs/agents/`·스킬 문서 수정.

이슈는 GitHub Issues(`bothsides-platform-dev/supporter-b`)를 쓴다. 작업·스펙 게시는 `docs/agents/issue-tracker.md`, 라벨은 `docs/agents/triage-labels.md`, 용어집 경로는 `docs/agents/domain.md`를 따른다. 화면 시각 검증은 `DESIGN.md`·`SCREEN_DESIGN.md`와 브라우저 확인으로 진행한다.

## Health Stack

- typecheck: `pnpm tsc --noEmit`
- lint: `pnpm lint`
- test: `pnpm test`. RED/GREEN 확인은 `pnpm test <path-to-test>` 단일 파일로 한다
- e2e: `pnpm e2e`. 로컬 전제는 `docker compose --profile test up -d pg-test`(5433/`supporter_b_test`)이고, 종료코드가 가려지므로 출력을 `| tail`로 파이프하지 않는다

**CI**(`.github/workflows/ci.yml`): lint+tsc·unit은 `main`·`dev` 대상 PR과 두 브랜치 push에서, e2e는 `main` 대상 PR과 `main` push에서만 돈다. e2e 게이트는 dev→main 컷 PR 한 곳이므로 **컷 PR의 e2e 결과를 반드시 읽는다.** `dev` push는 `STAGING_DEPLOY_ENABLED=true`일 때 CI 통과 후 스테이징에 자동 배포되며 운영 배포와 관리자 저장소 배포는 포함하지 않는다.

## Worktree Workflow

모든 기능 개발·버그픽스는 worktree 브랜치(`feat/<slug>`, `fix/<slug>`, `chore/<slug>`)에서 진행하고 `dev`는 항상 clean으로 둔다. 동의 없이 worktree를 만들어도 된다.

- Claude Code의 `EnterWorktree`는 `.claude/worktrees/<name>`에 `origin/main` 기반 `worktree-<name>` 브랜치를 만든다. 작업 전에 `origin/dev`로 reset하고 브랜치 이름을 규칙에 맞춘다. 직접 만들 때는 `.worktrees/<name>`을 쓴다(둘 다 gitignore).
- PR은 `mattpocock-skills:pr` 스킬로 만들고, 머지 후 `git worktree remove <path> && git branch -d <name>`으로 정리한다.

<!-- CLAUDE.md: END -->
