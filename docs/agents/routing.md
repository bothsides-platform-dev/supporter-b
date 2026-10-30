# 라우팅·접근 제어 상세

`CLAUDE.md` Routing Architecture의 상세다. 라우트 추가는 `SCREEN_DESIGN.md` §0에도 등록한다.

## 라우트 트리

```
app/
├─ quote-start/ # 공개 실작성 — 로컬 작성·가입 시 서버 저장 후 구매사 인증 복귀, noindex
├─ demo/        # 공개 구매사 데모 — 요청·메시지·견적 수정·선정·가상 서명·계약 보관. 세션 메모리만 사용, 실제 업무 API 미호출
├─ legal/       # 공개 법적 고지: /legal 및 terms·privacy·marketing (판 번호 없는 URL. 가입 증빙 판본은 terms v2·privacy v4·marketing v3 — `lib/auth/signup-documents.ts`; 사용자 요청·운영 동의 0건 확인 후 v1 삭제)
├─ (public)/    # Unauthenticated: /login, /signup/{buyer,pg}/*, /password/*, /invite/{rfp,workspace}/[token], /auth/*, /pending-approval, /suspended
├─ (app)/       # Authenticated, AppShell wrapped (full-height Sidebar + Header)
│  ├─ home/
│  ├─ rfp/                    # buyer workspace pages (B1~B7): /rfp, /rfp/[id] (비교·선정 인라인 — 별도 award 라우트 없음), /rfp/@modal/(.)[id] (인터셉트 딜룸 모달)
│  ├─ rfp-create/             # /rfp-create — RFP 작성 플로우 (AppShell 공유, 인터셉트 라우트)
│  ├─ inbox/                  # pg workspace pages (P2~P4): /inbox, /inbox/[rfpId] (제출 후 인플레이스 흡수 — 별도 /submitted 라우트 없음, 재요청 딥링크 `?tab=write` — `lib/rfp/pg-deal-room-link.ts`), /inbox/@modal/(.)[rfpId] (인터셉트 딜룸 모달)
│  ├─ opportunities/          # pg — 오픈 RFP 게시판 (비초대 PG 발견·콜드 피치)
│  ├─ tutorial/               # buyer+pg — 온보딩 튜토리얼. 상세는 docs/agents/tutorial.md
│  ├─ messages/               # buyer+pg 공통 — 라이브 채팅 (Centrifugo WS)
│  ├─ notifications/          # 인앱 알림 목록 페이지
│  ├─ contracts/              # buyer 전용 — 노온 합의서 완료본·감사추적인증서 보관함. 수동 업로드 없음
│  ├─ quote-templates/        # 폐지 — 404. 기존 데이터·스키마·내부 저장소는 보존
│  ├─ contract-templates/     # 폐지 — 404
│  ├─ workspace/new/          # 워크스페이스 생성
│  └─ settings/{profile,members,notifications,audit-log}/
├─ logout/route.ts            # GET (redirect to /login) + POST (204, for client-side signOut)
└─ (루트 proxy.ts)            # 요청 라우팅은 proxy.ts(decideProxyRoute), 화면 접근은 app/(app)/layout.tsx의 resolveShellAccess
```

Workspace type (`buyer` vs `pg`) determines which sub-tree of `(app)/*` is shown — same shell, different navigation.

## 견적 초안의 화면별 격리

**견적 초안의 화면별 격리 (2026-10-22)**: 랜딩·튜토리얼·공개 데모는 최초 렌더에서 `createRfpDraftStore`로 독립 메모리 store를 만들고 `RfpDraftProvider`로 전달한다. 회원 전역 store의 값이나 persistence를 임시로 바꾸지 않는다. 샘플 초기값·자동 재생도 해당 store에만 쓴다. 회원 초안의 영속 저장과 공개 작성·서버 복원의 소유권 규칙은 각 경로가 유지한다.

## 셸 가드

**Shell-guard gates (`resolveShellAccess` in `lib/auth/shell-access.ts`)**: the `(app)/layout.tsx` guard runs ordered redirects — unauth → `/login`, incomplete-but-authed (no membership) → `/logout`, **email-unverified → `/pending-approval`**, workspace `pending` → `/pending-approval`, workspace `suspended` → `/suspended`. The email-verification gate is **first-class and independent of workspace status** — an unverified member is redirected even when their active workspace is already `active` (closes the canonical-PG-join hole where joining an approved workspace skipped verification). `emailVerified` is read **live from the DB** (`getDbEmailVerified`, not the JWT) so a just-completed verification takes effect without re-login; after verifying, the server revokes provisional sessions and replaces only the proving browser session using request-local renewal authority. Code and link share the guest-resume/home destination; an open signup tab rechecks server state before accepting a completion signal. Cookie replacement failure falls back to re-login. The guard then re-branches by workspace status. **PG 멤버십 승인은 서버 데이터 경계로도 강제된다 (v0.4.20.0)**: `isPgMembershipBlocked`(`lib/auth/pg-membership-gate.ts`)가 승인 상태를 DB 라이브 리드로 판정해 `requirePgSession`(PG 전용 표면)과 `requireActiveWorkspace`(채팅·보드·계약 라이프사이클 등 양측 공용 액션)에 이중 배선 — `pending_approval`/`rejected`/행 부재 전부 fail-closed 차단, 마스터(synthetic admin, 멤버십 row 없음)는 `isMasterEmail` 재확인으로 면제. 셸 가드의 승인 게이트도 `!== 'approved'` fail-closed 로 정렬됨. 업무 HTTP API(일반 첨부·계약 보관함·알림·워크스페이스 검색)는 `checkBusinessApiSession`으로 같은 게이트를 공유하고, 연결 토큰은 계정 캐시 검사 뒤 `checkBusinessWorkspace`로 워크스페이스·PG 승인을 매 요청 확인한다. server-to-server subscribe ACL도 signed `meta.workspaceId`의 active/approved 실효 멤버십을 매 구독 확인하고 모든 채널 판정을 그 workspace에 묶는다. 잔여는 이미 열린 구독의 외부 관리자 승인·workspace 상태 변경 재검사다 — TODOS.md P4 참조.

## 마스터/운영계정의 워크스페이스 관리 권한

**마스터/운영계정의 워크스페이스 관리 권한 (v0.10.0.0)**: 운영계정은 멤버십 행 없이 선택한 모든 워크스페이스의 synthetic admin 으로 설정의 이름 변경 요청·멤버 초대/재발송/취소·역할 변경·내보내기와 활동 기록 조회를 수행한다. 이름·멤버 관리 쓰기 권한의 서비스 경계는 `WorkspaceService.workspaceManagementAccess` 다 — 세션의 `isMaster` 값을 신뢰하지 않고 사용자 이메일을 DB 에서 다시 읽어 서버 전용 `MASTER_ACCOUNT_EMAILS` allowlist 와 대조하며, 일반 사용자는 승인된 admin 멤버십을 요구한다. 이 작업들의 액션은 렌더 시점의 `workspaceId` 를 필수로 받아 현재 세션 워크스페이스와 정확히 비교하므로, 다른 탭에서 워크스페이스를 바꾼 뒤 남은 화면은 `WORKSPACE_CHANGED` 로 멈춘다. 운영계정도 마지막 승인 admin 을 강등·내보낼 수 없고, 판정은 쓰기 트랜잭션 안의 행 잠금 카운트가 지킨다. 이름·멤버 관리 감사 로그는 같은 트랜잭션에서 `metadata.actorWasMaster` 를 사건 당시 값으로 스냅샷하며, 이 필드가 없는 레거시 행만 조회 시점의 allowlist 로 폴백한다.

## 워크스페이스 상태 서버 게이트

**워크스페이스 상태 서버 게이트 (v0.22.2.0)**: `requireSession`과 인증 API의 `isWorkspaceInactive`는 현재 DB의 워크스페이스가 `active`인지 요청마다 확인한다. `pending`·`suspended`·삭제된 워크스페이스는 업무 액션·파일·알림·계약·연결 토큰 API에서 차단된다. 계정 복구·가입·초대 수락·워크스페이스 전환은 `allowInactiveWorkspace`를 명시해 접근을 유지한다. 세션 갱신의 워크스페이스·역할 claim은 `lib/auth/master-login.ts`가 DB 멤버십에서 다시 도출한다. 세부 위협 경계와 테스트는 `docs/THREAT_MODEL.md` §3.4.

## 호스트 라우팅

**Host routing (prod only)**: the single Next.js app serves two hostnames — `support-b.com` (buyer) and `partner.support-b.com` (PG). Route tree is unchanged; `(app)/layout.tsx` reads the request host and redirects a mismatched session to its correct host (`lib/site-routing.ts`). `/signup` also reads the host and redirects to `/signup/buyer` or `/signup/pg` without a role-chooser screen (`signupTargetForHost` in `lib/site-routing.ts`). Session cookie is scoped to `.support-b.com` for cross-subdomain SSO (`AUTH_COOKIE_DOMAIN`). Workspace switch navigates across hosts. PG-facing emails link to `partner.support-b.com`. Local dev uses a single host (routing disabled). Env vars: `NEXT_PUBLIC_BUYER_ORIGIN`, `NEXT_PUBLIC_PARTNER_ORIGIN` — **both-or-neither, enforced fail-closed**: `appOrigins()` throws when exactly one is set (v0.4.3.0). A partial config used to let the missing one fall back to a value that could equal the other, making a broken deploy indistinguishable from single-host dev — and that state silently disabled the partner-host noindex (`shouldNoindexHost`, `robots.ts`) and the `/login/ops` OAuth PKCE host pin (`opsLoginRedirectTarget`, cf. PR#361) at the same time. The origin fallback chain itself (`NEXT_PUBLIC_BASE_URL` → `AUTH_URL` → `http://localhost:3000`) has a single source, `baseUrl()` in `lib/site-routing.ts`; `siteConfig.url` and `lib/server/env.ts`'s `baseUrlFor` (email links) both derive from it, and `lib/server/env.ts` re-exports `baseUrl` only as a deprecated compat hop — new code imports from `@/lib/site-routing`.

## SEO / AI(GEO) 텍스트 엔드포인트

**SEO / AI(GEO) 텍스트 엔드포인트**: `/llms.txt`(큐레이션 인덱스)·`/llms-full.txt`(전체 마크다운)는 host-aware route handler(`app/llms.txt`·`app/llms-full.txt`)로 buyer/PG 청중별 사실을 `text/plain`으로 제공한다. `app/robots.ts`·`app/sitemap.ts`도 host-aware로 전환 — buyer 호스트는 자기 origin 참조 + 주요 AI 크롤러 명시 허용하지만, **partner(PG) 호스트는 전면 비색인**(`buildRobots(origin, 'pg')`가 모든 크롤러에 `disallow: ['/']` 반환, `buildSitemap`도 빈 배열, `proxy.ts`가 응답에 `X-Robots-Tag: noindex, nofollow` 헤더까지 얹어 이미 색인된 페이지도 제거 유도 — `lib/site-routing.ts`의 `shouldNoindexHost`). 콘텐츠 SSOT는 `lib/seo/{host,product-facts,llms,robots,sitemap,jsonld}.ts`이며 FAQ는 랜딩 상수(`faq-data`·`pg-faq-data`)를 재사용해 드리프트가 없다. 공식 표기는 '서포트비'이며 그 단일 출처는 `lib/site-config.ts`의 `siteConfig.name` 하나다 — `lib/seo/product-facts.ts`의 `PRODUCT_NAME`은 두 번째 출처가 아니라 거기서 파생하는 재export다(v0.4.3.0). 2026-10-03 사용자 결정에 따라 화면·검색 메타데이터·AI 안내는 '서포트비'만 사용하며 별칭 배열·키워드·JSON-LD alternateName은 제거했다. 명칭을 정정한 이용약관·개인정보 처리방침과 마케팅 문서는 v2로 게시했고, 2026-10-08 문의 주소 정정으로 개인정보 처리방침·마케팅 문서는 v3가 됐고, 2026-10-10 보호책임자 주소 정정으로 개인정보 처리방침은 v4다(이용약관은 v2 유지, 판본 단일 출처는 `lib/auth/signup-documents.ts`). 후속 사용자 요청에 따라 운영 가입 동의 0건을 확인한 뒤 v1 공개 페이지 3개를 삭제했다. JSON-LD 스키마 빌더는 `lib/seo/jsonld.ts`에 있고, `buildOrganizationJsonLd`는 buyer 랜딩(`app/page.tsx`)·PG 랜딩(`pg-landing-data.ts`, description 오버라이드)이 공유하며 `buildSoftwareApplicationJsonLd`는 buyer 랜딩 전용, `<script type="application/ld+json">` 인라인 직렬화는 반드시 같은 파일의 `serializeJsonLd`(`<`·`>`·U+2028/U+2029 유니코드 이스케이프 — `</script>` 태그 탈출 방지)를 쓴다(raw `JSON.stringify` 금지). 랜딩 히어로 지표(`HERO_METRICS`)는 `components/landing/hero-metrics.ts`에 단일 출처로 추출돼 `LandingHero.tsx`와 `product-facts.ts`(BUYER_FACTS.metrics)가 공유하며, `lib/seo/__tests__/product-facts.test.ts` 드리프트 가드 테스트가 양쪽 캡션 일치를 보장한다. 두 txt 경로는 `proxy.ts`/`lib/auth/proxy-matcher.ts` 매처에서 robots/sitemap과 함께 제외해 비인증 크롤러가 접근한다. `app/layout.tsx` metadata의 `alternates.types['text/plain'] = '/llms.txt'` 선언으로 ChatGPT·Perplexity 등 AI 크롤러가 `<head>`에서 자동발견 가능하다. **매처 제외 목록에 항목을 추가할 때 지켜야 할 규칙 두 가지**(v0.4.9.0): ① 세그먼트의 점(`.`)은 `\\.`으로 이스케이프해 파일명이 리터럴 점으로만 매칭된다(`llmsXtxt` 같은 경로가 의도치 않게 제외되는 것을 방지). ② 모든 항목은 세그먼트 경계(`SEGMENT_END` = `/` 또는 경로 끝)에 고정된다 — 맨 접두어로 두면 미래에 그 단어로 시작하는 실제 보호 라우트(`/landing-editor`·`/api-docs`)가 인증 프록시를 통째로 건너뛴다. **유일한 예외는 Next.js 메타데이터 이미지 규약**(`opengraph-image`·`twitter-image`·`apple-icon`)으로, 확장자가 붙어 도착하므로(`app/opengraph-image.png` → `/opengraph-image.png`, 동반 alt 는 `/opengraph-image.alt.txt`) `ASSET_SUFFIX`(`.`/`-` 뒤에만 접미사 허용)를 쓰되 `PATH_END`(`$`)로 고정해 하위 경로(`/apple-icon.png/admin`)까지 새지 않게 한다. 이 규칙은 `lib/auth/__tests__/proxy-matcher.test.ts`가 못박으며, 매처를 바꾸면 `proxy.ts`의 인라인 리터럴도 함께 갱신하고(드리프트 가드가 둘을 byte-equal 로 고정) **반드시 `next build`로 확인해야 한다** — Next 는 `config.matcher`를 모듈 실행 없이 정적 분석하므로 유닛 green 이 build green 을 보장하지 않는다.

## 별도 레포

**Admin 콘솔은 별도 레포로 분리됨**: `github.com/bothsides-platform-dev/admin-supporter-b`. 이 레포에 `app/admin/` 없음. admin 관련 코드를 찾거나 수정할 때는 해당 레포를 참조. 이 레포에는 DB 마이그레이션 소유권(`lib/db/schema/admin.ts`)과 신규 가입 알림 이메일(`lib/integrations/admin-email.ts`)만 잔존.

**PG 용어 사전(docs)은 별도 레포**: `github.com/bothsides-platform-dev/docs-supporter-b` 가 `docs.support-b.com`(Next.js 정적 export, Cloudflare Pages)을 서빙한다. 이 레포는 docs 링크와 [docs 경유 수신부](docs/DOCS_ATTRIBUTION.md)를 가진다 — URL 단일 출처 `DOCS_URL`(`lib/site-config.ts`, 사이트 루트)을 양쪽 랜딩 헤더의 `인사이트` 메뉴·공용 푸터(`components/shell/Footer.tsx`)·buyer llms 링크(`product-facts.ts`; 절대 URL 은 `renderLink` 가 origin 없이 그대로 출력)가 소비한다. 공용 푸터와 buyer llms는 같은 파일의 `DOCS_GUIDES`로 docs의 결제 운영 가이드 3편에도 발행된 글 제목으로 직접 링크한다. 제목·주소는 docs 레포와 맞추고, 글을 변경하거나 삭제하면 함께 갱신한다. 랜딩 헤더의 `인사이트`는 섹션 메뉴와 분리해 PC(1200px 이상)에서는 양쪽 모두 로고 바로 옆에 구분선·↗ 아이콘·도메인 툴팁과 함께, 모바일에서는 메뉴 맨 아래에 둔다(2026-10-25, `LandingInsightLink` 공유). PC·모바일과 로그인 여부에 관계없이 같은 탭으로 이동하며, 모바일 클릭은 메뉴를 닫는다. 외부 링크이므로 현재 섹션 강조 대상에는 포함하지 않는다. Organization 의 별칭(`siteConfig.alternateNames`)과 `sameAs`(`siteConfig.sameAs`)는 docs 레포의 같은 @id 노드와 같은 값을 유지한다. docs 쪽 JSON-LD 가 `publisher: { '@id': '<siteConfig.url>/#organization' }` 로 이 레포의 Organization 을 참조하므로, `buildOrganizationJsonLd` 의 `@id` 를 바꾸면 docs 레포도 함께 고친다.
