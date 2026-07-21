# TODOS

## Notifications

### 알림 환경설정 미구현 — 이메일 수신 거부 불가 (P2)
`/settings/notifications` 는 "들어갈 예정입니다" 스텁이고, 발송 경로(`notify()`)에 사용자 선호도 체크가 전혀 없다 — 모든 이메일이 무조건 발송되며 수신 거부 수단이 없다. 타입/채널별 수신 토글 스키마 + `notify()` enforcement + 설정 UI 가 필요. (발견: 알림 시스템 전수 조사 2026-07-07, v0.2.75.1)

### outbox requeue가 scheduled_at을 리셋하지 않음 (P3)
`NotificationService.retryEmail` → `outboxRepo.requeue`(`drizzle/outbox.ts`)가 status만 `failed→pending`으로 뒤집고 `scheduled_at`을 리셋하지 않아, 백오프로 미래 시각에 밀린 행은 수동 재시도해도 그 시각까지 발송되지 않는다. `requeue`에서 `scheduled_at = now()` 리셋 필요. 참고: `retryEmail`은 서비스·액션·훅·테스트까지 완비됐지만 UI 호출 지점이 0인 데드코드 상태(배선 여부는 별도 결정 — 2026-07-07 보류 결정됨). (발견: 알림 시스템 전수 조사 2026-07-07)

### ALLOWED_OUTBOX_EVENTS 스테일 — requote 재시도 불가 (P3)
`lib/server/services/notification.ts`의 이메일 재시도 화이트리스트에 `rfp.requote_requested` 등 이메일을 실제 발송하는 타입이 누락되어 `retryEmail`이 `NO_EMAIL`을 반환한다. 화이트리스트를 outbox enum 기준으로 갱신하거나 파생하도록 정리. (발견: 알림 시스템 전수 조사 2026-07-07)

### 승인/거절 알림 미배선 (P3)
`workspace.approved/rejected`, `rfp.sent`, `membership.approved/rejected` 템플릿·outbox enum은 존재하지만 어디서도 발송하지 않는다. 승인 액션 자체는 admin 별도 레포(`admin-supporter-b`) 소관이라 발송 지점을 어느 레포에 둘지 경계 결정 필요. 관련: master/ops 멤버십 row를 admin 레포가 직접 insert하면서 `approval_status`를 명시적으로 non-approved로 쓰는 곳이 없는지 1줄 확인 필요(있다면 v0.2.75.1의 approved 필터로 master가 조용히 수신 중단됨). (발견: 알림 시스템 전수 조사 + /ship 적대 리뷰 2026-07-07)

### 알림 소소한 정합성 묶음 (P4)
① 알림 페이지 RSC는 100건, 훅 스토어(`useNotifications`)는 API 50건 하이드레이트 — 51~100번째 항목에서 배지/읽음 처리 불일치 가능. ② 인앱 알림 row는 `pending→read`만 전이하는데 렌더러(`NotificationActivityList`)와 `unreadCount`에 도달 불가능한 `sent`/`failed` 분기(빨간색 미읽음 렌더 포함)가 남아 있음. ③ 알림 `type`이 free-form text로 SSOT enum이 없고 렌더러에 타입별 라벨/아이콘 매핑도 없음. (발견: 알림 시스템 전수 조사 2026-07-07)

## Deal Room / Award

### 선정 후 구매사 담당자(createdBy) 탈퇴 시 승자 PG가 빈 딜룸 (P3)
선정 연락처 교환(`CounterpartyContactCard`)은 `findContactById`가 fail-closed라, 구매사 담당자(RFP `createdBy`)가 탈퇴/시스템계정이면 `buyerContact=null`이 된다. 승자 PG 분기는 `awardedToMe && buyerContact`로 카드를, `awarded && !awardedToMe`로 미선정 안내를 그리므로 — 승자인데 buyerContact만 null이면 카드도 안내도 안 떠 빈 화면이 된다(드묾·누출 아님·정상 fail-closed). 후속: 연락처 없음 안내 폴백 또는 워크스페이스 대표 담당자 폴백 검토. (발견: /ship 적대 리뷰 2026-06-27)

## Settings / Account

### DeleteAccountSection INVALID_PASSWORD 테스트 실패 (dev 선존재) (P0)
`components/settings/__tests__/DeleteAccountSection.test.tsx > shows inline error on INVALID_PASSWORD` 이 "비밀번호가 올바르지 않아요." 텍스트를 못 찾아 실패한다. **clean dev(main repo root)에서도 동일하게 실패** — 이 브랜치와 무관한 선행 이슈(단독 실행도 실패). Base-UI 다이얼로그(`data-base-ui-inert`)의 인라인 에러 렌더/타이밍 문제로 보인다. 회귀 아님(diff와 무관)이지만 전체 스위트가 red 라 추적 필요. 확인: 로컬 jsdom/Base-UI 버전 상호작용 vs CI 통과 여부. (발견: /ship 테스트 트리아지 2026-07-20, v0.4.2.0)

## Signing (선정 후 전자서명 / SnowSign)

### Phase 11 — 실 SnowSign sandbox 스모크 + e2e (P1)
단위/PGlite/HTTP-mock 은 전 경로 커버(4971 green)지만, 실 SnowSign API 검증은 계정/키가 있는 환경으로 미뤄져 있다. 필요: ① env-gated sandbox 스모크(실 `listTemplates`/`getTemplate`/`createContractFromTemplate`/`getContract`/`download` 가 유닛 mock 페이로드와 일치하는지), ② 임베드 완료 postMessage 이벤트 형태 확정(현재 수동 폴백은 무관하게 동작), ③ 웹훅 HMAC 서명이 실 시크릿으로 우리 검증을 통과하는지, ④ e2e happy(템플릿 링크→award→발송→완료→다운로드)+edge(미설정·거절·만료·취소·재발송·타 PG 템플릿 차단). (발견: 기능 계획 Phase 11, v0.4.1.0 — 실 creds 대기)

### org 스코핑 잔여 갭 — 미링크 템플릿 첫 조회/링크 소유검증 (P2)
`getTemplateDetail`/`linkTemplate` 은 이미 다른 워크스페이스가 링크한 SnowSign 템플릿은 거부(FORBIDDEN/TEMPLATE_ALREADY_LINKED)하지만, **아직 아무도 링크 안 한 신규 템플릿의 첫 조회/링크**는 임의 PG 가 할 수 있다(단일 SNOWSIGN_API_KEY=1 org 구조의 잔여 노출). 실 위험은 낮음(템플릿 ID 는 비열거·불투명, 어느 PG-facing 화면에도 노출 안 됨). 닫는 법: SnowSign `getTemplate` 응답이 임베드 세션의 `external_id`(`ws:<workspaceId>`)를 회신하면 소유 검증으로 게이트 — **Phase 11 에서 API 회신 여부 확인 후 구현**. (발견: /ship security+red-team+code-quality 3중 리뷰 2026-07-19, v0.4.1.0)

### 동시 resend 시 PERSIST_FAILED (결과 정상, 에러만 덜 깔끔) (P3)
두 resend 가 좁은 창에서 겹치면 한쪽은 claim 을 잃고 다른 한쪽은 활성 partial-unique 위배로 `PERSIST_FAILED`(+ 보상 취소로 SnowSign 계약 정리)를 받는다 — 이중 라이브 계약은 없어 결과는 정상이지만 에러 코드가 `CONTRACT_BUSY` 보다 혼란스럽다. RFP 단위 advisory lock 또는 claim 실패 재-read 로 매끈하게 개선 검토. (발견: /ship red-team 2026-07-19, v0.4.1.0 — MINOR 수용)

### 상용 하드닝 잔여 (감사·쿼터·cascade) (P3)
플랜의 상용 요건 중 PARTIAL: ① 감사 로그가 sent/awaiting/completed/canceled 만 남고 template-link·viewed·per-participant-sign 은 미기록, ② org 월 발송 쿼터 근접 선제 알림 없음(`QUOTA_EXCEEDED` 는 반응형 에러로만 노출), ③ RFP 삭제 시 DB cascade 는 로컬 행만 지우고 활성 SnowSign 계약에 `cancel` 을 전파하지 않음, ④ deadline↔expires 정렬(provider `expiresAt`/`deadlineDays` 로컬 미영속). (발견: /ship plan-completion 감사 2026-07-19, v0.4.1.0)

### 완료본 다운로드 프록시 하드닝 — 호스트 allowlist + ACL-first (P3, 선존재)
`download-handler.ts`가 302 리다이렉트하는 `download_url`은 이제 `reqAbsoluteUrl`로 http/https 절대 URL만 허용하지만 **호스트 제약이 없고 `http:`도 통과**한다(제공자 신뢰값이라 user-controllable 아님·SSRF 아님 — 방어심층만). 또 `getDownloadUrl`은 `getForActor`와 달리 존재검사→ACL 순서라 비당사자가 404/403로 계약 존재를 구분할 수 있다(unguessable UUID라 실위험 negligible, 이번 diff는 오히려 raw 코드 대신 친절 페이지로 누출 축소). 검토: SnowSign/S3 다운로드 호스트 pin(+https 강제), `getDownloadUrl` ACL-first 정합. (발견: /ship security 리뷰 2026-07-20, v0.4.2.0)

## Chat / Realtime

### Presence: document observer-identity exposure in the threat model (P3)
공개 presence(`presence:ws:<V>`, D1)에서 raw `sub.presence()` 페이로드는 co-subscriber의 `user`(userId)+`connInfo.workspaceId`를 노출한다. 앱 UI 는 새지 않는다 — 회사 점은 owner 필터 binary online, 사람 점(UserProfileCard)은 ACL 로더가 내려준 `presenceWorkspaceId`(본인·같은 팀·대화 상대 한정)에 대해서만 per-user online 을 읽는다. 다만 raw WS 클라이언트는 워크스페이스 UUID 만 알면 `sub.presence()` 로 그 채널의 online userId 를 열거 가능(이 노출은 D1 공개 채널의 성질이지 앱 코드 때문이 아님). 봉인 입찰 데이터(수수료·경쟁사 수)는 무관. 위협 모델 문서에 한 줄 명기 + 장기적으로 presence:ws 를 subscribe-proxy(멤버십/대화 게이트)로 ACL 하는 것 검토. (발견: online-presence M1 whole-branch review 2026-06-21; per-user 소비 추가: v0.2.38.0 아바타 신원 카드)

## Chat / Morph animation

### morph 클론 z-index가 딜룸 모달 위에 그려짐 (P3)
`MorphFlightLayer`가 body로 portal(`z-[100]`)되어 딜룸 모달(`z-50`) 위에 클론을 그림. 0.34s 비행 동안 클론이 모달 헤더 영역을 가로지르면 위에 덮어 보일 수 있음(`pointer-events-none`이라 클릭 차단은 없고, 두 끝점이 채팅 영역 안이라 대부분 무해, 비-모달 표면에선 정상). body-portal은 메시지 목록 overflow 클리핑 회피를 위한 의도적 선택 — 모달 안으로 portal하면 클리핑 재발. 필요 시 z를 모달 컨텍스트에 스코프. (발견: /ship adversarial 2026-06-22)

### prop-resync 중 localKey 유실 → 일시적 이중 말풍선 (P3)
`ThreadView`의 `prevMessages !== messages` 리싱크가 서버 행(localKey 없음)으로 교체 → flight 진행 중이면 행이 realId로 키잉되어 `isMorphing(realId)=false`로 실 말풍선이 즉시 보이고 클론도 비행 중 → 최대 0.34s 이중 표시(클론 완료 시 self-heal). 드문 레이스. 해소: 리싱크 시 활성 flight 전부 clear(hook에 `clearFlights()` 노출). TeamThreadView는 remount라 무영향. (발견: /ship adversarial 2026-06-22)

### 빠른 연속 전송 시 단일 예약 슬롯 (P3)
`useMessageMorph`의 `pending`이 단일 state 슬롯이라 같은 틱에 두 번 전송하면 마지막 것만 morph(앞 메시지는 애니메이션 없이 즉시 표시 — 안전, 정합성 문제 없음). 연속 전송 일관성을 원하면 큐/배열로 전환 — 와이어링 추출 이후 슬롯이 훅 한 곳에만 있어 1파일 변경으로 끝난다. (발견: /ship adversarial 2026-06-22; 슬롯 위치 갱신 2026-07-21)

## Design

### AnimatedBrandMark 진입 애니메이션 — DESIGN.md 예외 미문서화 (P4)
`components/primitives/AnimatedBrandMark.tsx`(v0.3.0.0, `SidebarBrand`가 인증 앱 셸에 마운트)의 1회성 SVG `pathLength`/`fillOpacity` draw-on 진입 연출이 DESIGN.md §9의 `(app)/**` 두 예외(축하 모먼트·테마 전환 리빌) 어디에도 명시되지 않았다(같은 릴리스 범위의 `.coachmark-pulse`는 예외로 문서화됨과 대비). 기능적 결함은 아님 — 세 번째 예외로 DESIGN.md에 명문화할지, `/design-review`로 하드룰 위반 여부를 재검토할지 정책 결정 필요. (발견: /ship 문서 동기화 점검, dev→main 릴리스 컷 2026-07-17)

### font-mono uppercase tracking on non-numeric UI labels (C4) (P3)
`font-mono text-[10px] tracking-[0.1em] uppercase` 패턴이 폼 라벨·버튼·nav 링크 등 비수치 UI 요소 ~180곳에 남아 있음 (DESIGN.md 하드 룰 위반: "no `font-mono uppercase tracking` on labels/nav"). 대표 파일: `app/(public)/login`·`signup`·`password`·`auth`·`invite`, `components/auth/PasswordField`·`PhoneVerificationField`·`ResendCountdown`, `components/inbox/bid-wizard/BidContextStrip`, `components/settings/*`, `components/rfp/*`. 수정 방향: `font-mono text-[10px] tracking-[0.1em] uppercase` → `font-sans text-[11px] tracking-tight` + sentence case. 별도 worktree 권장(시각 변경 광범위). 또한 `font-mono tabular-nums` 직접 사용이 `md-numeric` 미전환 상태로 ~30건 잔존(`components/settings/`, `components/rfp/`, `components/landing/` 등) — C4 스윕 시 병행 정리. (도입: font-system audit PR#280 v0.2.35.1, 2026-06-22)

## SEO / Branding

### 브랜드명 리터럴 하드코딩 — SSOT 미참조 (P3)
`서포트 B`→`서포트비` 전환(v0.2.78.0) 과정에서 확인됨: 이메일/SMS 제목 템플릿 11개 파일(`lib/server/services/{rfp,bid,chat,team-chat,auth,workspace}.ts`, `lib/server/outbox/{chat-digest-flush,team-chat-digest-flush}.ts`, `lib/server/outbox/templates/_layout.tsx`, `lib/server/actions/auth/sendPhoneOtpAction.ts`, `lib/server/notifications/admin-signup.ts`)와 `scripts/generate-og-image.ts`가 브랜드명을 `siteConfig.name`/`PRODUCT_NAME`(SSOT) 참조 없이 리터럴로 하드코딩한다. 이번 리네임에서 12개 파일을 find/replace로 손대야 했던 것이 비용 증거. 후속: 공유 상수를 각 subject 템플릿에 interpolate하도록 리팩터(별도 PR — 템플릿 로직 변경이라 문구 교체보다 범위가 큼). (발견: /ship maintainability+adversarial 리뷰 2026-07-07, 브랜드 전환 PR — 두 리뷰어가 독립적으로 동일 패턴 지적)

## Landing

### ScrambleText rAF 루프가 헤드라인이 화면 밖으로 스크롤돼도 계속 돎 (P3)
`components/landing/hero/ScrambleText.tsx`의 순환 문구 스크램블 애니메이션은 `document.hidden`(탭 백그라운드)에만 반응해 일시정지하고, 히어로 섹션 자체가 스크롤로 화면 밖에 나가도 rAF 루프(60ms 글리프 갱신 + 프레임당 setState)가 계속 돈다(리크는 아님 — cleanup은 정상, 비용도 작은 span 10여 개 스타일 재계산 정도로 트리비얼). 수정 방향: `HeroPinnedScene`이 이미 갖고 있는 `scrollYProgress`를 prop으로 내려받아 히어로 트랙을 벗어나면 정지하거나(`HeroAsciiField`가 쓰는 방식과 동일), 또는 별도 IntersectionObserver를 둔다. (발견: /ship performance+adversarial 리뷰 2026-07-03, `feat/hero-headline-scramble` — 두 리뷰어가 독립적으로 동일 지점 지적)

## Signup / Auth

### 설정 페이지 WorkspaceBizNoForm blockedStatuses 누락 (P2)
워크스페이스 설정의 사업자번호 변경 폼(`WorkspaceBizNoForm.tsx`)이 `BizLookupField` 를 `blockedStatuses` 없이 사용한다. 기존 구매사 회원이 폐업·휴업 상태 번호로 변경할 수 있는 경로. `blockedStatuses={['closed', 'suspended']}` 를 추가해 설정 경로도 닫아야 한다. (발견: v0.2.27.2 adversarial 2026-06-20)

### PG 가입 BizLookupField blockedStatuses 누락 (P3)
PG 가입 플로우도 `BizLookupField` 를 사용하며 현재 `blockedStatuses` 가 없다. PG 도메인에서도 폐업·휴업 사업자를 차단해야 하는지 정책 결정 후 `blockedStatuses={['closed', 'suspended']}` 추가. (발견: v0.2.27.2 adversarial 2026-06-20, P3 — 정책 미확정)

### proxy-matcher EXCLUDED_SEGMENTS가 세그먼트 경계 없이 prefix 매칭 (P3)
`lib/auth/proxy-matcher.ts`의 `PROXY_MATCHER` 음의 전방탐색은 세그먼트 경계(`/` 또는 끝)를 강제하지 않아, `api`·`_next`·`fonts`·`file`·`globe`·`next`·`vercel`·`window`·`landing` 등 모든 항목이 접두어 매칭된다(예: 미래에 `/landing-editor`·`/next-steps` 같은 실제 보호 라우트가 생기면 인증 미들웨어를 통째로 건너뛴다). 현재는 충돌하는 라우트가 없어 무해하지만, 새 라우트 추가 시 이 목록과의 충돌을 확인하는 절차나 세그먼트 경계 강제(`(?:/|$)` 등)를 검토할 것. (발견: /ship coverage+adversarial 리뷰 2026-07-01, `fix/pg-landing-image-auth-redirect`)

### proxy-matcher 죽은 제외 항목 4개 정리 (P4)
`file`·`globe`·`next`·`vercel`·`window` 는 create-next-app 기본 SVG 에셋(`public/next.svg` 등) 때문에 추가됐던 항목인데, 해당 파일들은 이미 삭제되어 `public/`에 `fonts/`·`landing/`만 남아 있다. 지금은 아무것도 제외하지 않으면서 흔한 영어 단어라 미래 라우트와 충돌 여지만 남기는 상태. 제거 검토(단, 위 세그먼트 경계 이슈와 함께 처리하는 게 효율적). (발견: /ship adversarial 리뷰 2026-07-01, `fix/pg-landing-image-auth-redirect`)

## Storage / R2

### R2 고아 객체 sweeper (P3)
`scripts/sweep-r2-orphans.ts` — ListObjectsV2(prefix `attachments/`) → `attachmentRepo.findExistingIds` 배치 대사 → row 없는 키 중 LastModified 24h 초과만 DeleteObjects. `--dry-run` 지원, PM2 cron(일 1회) 등록. 고아 발생 경로: RFP 삭제 cascade(`rfpRepo.deleteById`, `_purgeUnverifiedSignup`) + sweep-uploads 의 객체 삭제 실패 잔존분. bid_note 삭제는 bid.ts가 storage.delete() 명시 호출로 이미 커버. **주의**: 이 sweeper는 "row 없는 객체" 방향만 정리한다. 반대 방향 중 **pending row(업로드 미완료)는 presigned 전환으로 `/api/cron/sweep-uploads` 가 이미 커버** — 남는 미커버는 "ready row인데 객체가 없는" 희귀 케이스(현재 R2 presigned URL 이 NoSuchKey 를 반환)뿐. (발견: /ship adversarial 리뷰 2026-07-05, presigned 전환 반영 2026-07-05)

## 견적 확장 (current_terms)

### (조건부) hidden_from_pg write-edge 검증
**Priority:** P3
현재는 hidden_from_pg 가 hiddenFromPgFromVisibility(수수료 공개여부)로만 채워져 안전. **추후 buyer 가 임의 필드를 숨길 수 있게 되면** write-edge 에서 HIDEABLE_PG_PATHS 검증 추가 필요 — 안 하면 PG_STRIP 핸들러 없는 숨김 경로 fail-open 누출. (선택, doc-edge 채택 시 함께)

### currentTermsFromDiscrete 빈문자열 정규화
**Priority:** P3
'' 입력을 문서에 그대로 담음(현재 falsy 라 UI 무해). omit 으로 정규화하면 더 깔끔. (발견: /ship 리뷰 2026-06-18)

### PG 멤버십 승인 서버 데이터 경계 강제 (P2)
`joinCanonicalPgWorkspace` 경로로 생성된 `approval_status = 'pending_approval'` 멤버는 UI 게이트(shell guard + `/pending-approval` 분기)로 차단되지만, 서버 액션/API 라우트(`requirePgSession()`) 레벨에서는 `memberApprovalStatus`를 검증하지 않아 직접 POST 요청으로 우회 가능. PR#199 emailVerified 유예와 동일 패턴 — 이번 PR에서 의도적으로 후속 유예. **구현 시 `requirePgSession()`에 `getMemberApprovalStatus` 체크 추가 또는 별도 미들웨어 gate.** (발견: 최종 코드 리뷰 2026-06-18)

**부분 해소 (v0.2.48.0)**: admin 권한 표면(WorkspaceService invite/resend/cancel/changeRole/removeMember + renameWorkspace + listAuditLogs + audit-log 페이지)은 `isApprovedAdmin`(role=admin AND approvalStatus=approved)로 서버에서 차단했고, countAdmins·deleteAccount last-admin 판정은 승인된 admin 만 집계. **v0.2.73.0 갱신**: rfp 초대 메일 수신자는 admin 한정(`adminRecipients`, 이후 제거됨)에서 승인된 멤버 전원(`approvedMemberRecipients`)으로 확장됨 — 여전히 `approvalStatus='approved'` 필터는 유지. **남은 범위**: 비-admin pg 서버액션 전반에 대한 blanket `requirePgSession()` 승인 게이트는 여전히 미구현.

### changeMemberRole — LAST_ADMIN 오탐: pending_approval admin 강등 (P1)
`WorkspaceService.changeMemberRole` 의 LAST_ADMIN 가드(`if (input.role === 'member' && target.role === 'admin')`)가 `countAdmins`(승인된 admin 만 집계)를 호출하기 전에 `target.approvalStatus`를 검사하지 않는다. 결과: 유일한 승인 admin 이 아직 미승인(pending_approval) admin 을 member 로 강등하려 하면 — 그 미승인 admin 은 실질 권한을 행사한 적 없음에도 — 거짓 `LAST_ADMIN` 에러가 발생한다. **수정**: `changeMemberRole` line 279 조건에 `&& target.approvalStatus === 'approved'` 추가. TDD: pending_approval target 강등 시 LAST_ADMIN 없이 성공하는 회귀 테스트 먼저 작성. (발견: /ship adversarial v0.2.51.0, 2026-06-28)

### createRfpAction — requiredPaymentMethods 배열 길이 상한 없음 (P4)
`allowedPgWorkspaceIds`(`.max(50)`)·`customPaymentMethods`(`.max(20)`)와 달리 `requiredPaymentMethods: z.array(z.enum(PAYMENT_METHODS)).optional().default([])`에는 개수 상한이 없다. 각 원소는 고정 enum이라 개별 값은 유효하지만, 동일 값을 대량 중복 제출해도 zod를 통과해 `rfps.required_payment_methods`(text[])에 그대로 저장된다. Next.js 서버 액션 기본 바디 제한(1MB)이 사실상 상한 역할을 하긴 하나 명시적 가드는 아님. **수정**: `.max(11)`(캐논니컬 결제수단 총 개수) + 중복 제거(`Array.from(new Set(...))`) 추가. (발견: /ship adversarial 리뷰, 애플페이·삼성페이 추가 PR, 2026-07-19)


## Onboarding / Tutorial

### 튜토리얼 플로우 셸 중복 추출 (P3)
`BuyerTutorialFlow`와 `PgTutorialFlow`가 phase 상태머신 스캐폴딩(PHASE_ORDER/LABELS, 진행 헤더+나가기 버튼, done 전용 컨페티 캔버스)을 거의 그대로 중복. 공용 `TutorialFlowShell`/`useTutorialPhase` 추출 검토. 두 플로우 테스트의 CoachmarkTour mock 중복도 같은 작업에서 공용 test-double로 추출(키보드락은 v0.3.4.0에서 삭제됨). (발견: /ship maintainability 리뷰 v0.2.76.0, 2026-07-07 · mock 중복 추가: v0.2.79.0, 2026-07-10)

### updateOnboardingAction fire-and-forget 경화 — 실패 무시 + read-after-write 레이스 (P3)
`handleComplete`/`handleExit` 6곳이 `void updateOnboardingAction(...)`으로 발사 후 결과를 읽지 않는다: ① 네트워크 단절/세션 만료 시 unhandled rejection + 미영속(유저는 완료 화면을 봤는데 DB엔 스탬프 없음 → 환영 모달 재노출), ② `{ok:false}` 무시, ③ done CTA가 쓰기 완료를 기다리지 않아 `/home` RSC의 `getOnboarding()` 읽기가 쓰기를 앞지르면 완료 직후 환영 모달이 뜰 수 있음(스킵 경로에서 더 잦음). await+에러 토스트 또는 최소 `.catch` + `revalidatePath` 검토. v0.3.4.0의 `TutorialLeaveGuard.leave`(dismissed/completed 스탬프 후 즉시 router.push)도 같은 패턴 2곳 추가 — 경화 시 함께. (발견: /ship 적대 리뷰 v0.3.2.0, 2026-07-15 · 가드 추가: v0.3.4.0, 2026-07-16)

### 오픈 샌드박스 후속 폴리시 — 저장 신호·href 경화 (P4)
v0.3.4.0 /ship 리뷰(레드팀·적대·부록)에서 나온 비차단 폴리시 묶음. ~~① 막힌 클릭 복귀 공백(notFound 3s 대기)~~ — **v0.3.5.0 오프코스 리졸버가 해소**(타깃 잔존 즉시 감지, ~0.5s 복귀). ② 샘플 모드 템플릿 저장이 패널 닫힘(성공 신호)과 "저장되지 않아요" 토스트를 동시에 냄 — 신호 일치 검토(conf3). ③ `TutorialLeaveGuard`의 내부 링크 판정이 protocol-relative(`//host`) href를 통과시킴 — 현재 앵커가 전부 앱 통제라 비악용, 방어적 거부만 추가 검토(보안 conf3).

### 마지막 action 스텝의 막힌 클릭·확인창 취소 좌초 (P3)
CoachmarkTour의 capture 클릭 리스너가 마지막 action 클릭 즉시 `onFinish`를 부르고 플로우가 투어를 언마운트하므로, 마지막 action(제출)의 실패는 어떤 복귀 장치(오프코스 리졸버·notFound 폴백)도 커버하지 못한다. 실사례: PG 제출 확인창(ConfirmDialog)을 취소하면 코치마크 없이 BidWizard 4단계에 남는다(유일 출구: 튜토리얼 나가기). 마지막 action은 클릭이 아니라 "성공 신호"(phase 전환 콜백) 시점에 finish하는 설계 검토. 선존재 동작(v0.3.2.0~)이며 CLAUDE.md에 미적용 예외로 명시됨. (발견: /ship 적대 리뷰 F2, v0.3.5.0)

### useAnchorRect가 data-coachmark 속성 변이를 미감지 (P4)
`trackedEl.isConnected`만 검사하고 selector 재매칭(`el.matches`)은 하지 않아, BidWizard처럼 같은 버튼의 앵커 값이 변이하면(`tutorial-bid-next-${currentStep}`) 낡은 스텝 말풍선이 새 앵커를 최대 ~0.5s(리졸버 개입 전) 링한다 — 구 notFound 경로에선 3s였으니 개선됐지만 근본 원인은 잔존. poll tick에 `matches(coachmarkSelector(target))` 재검증 추가 검토. (발견: /ship 적대 리뷰 F5a, v0.3.5.0)

### 온보딩 e2e — 진입면(환영 모달·재유도 배너) 여정 (P4)
클릭-스루 본여정(buyer 작성→도착→선정 / PG 초대→조건→제출)은 `e2e/tutorial-click-through.spec.ts`가 커버(v0.2.79.0, 2026-07-10). 남은 유예분: 홈 환영 모달→체험 시작, '나중에 하기'→재유도 배너→재진입, 완주 후 배너 소멸, 건너뛰기→완료 화면+DB completed 스탬프(+완료 후 /tutorial 재진입이 /home으로 바운스)(유예: 건너뛰기 개편 v0.3.2.0), 이탈 가드 여정(사이드바 클릭→다이얼로그→나중에 하기/건너뛰기 각 스탬프+이동, 오픈 샌드박스 v0.3.4.0 유예). (유예: 온보딩 재구축 v0.2.76.0)

### useIsolatedRfpDraft restore() — 비동기 rehydrate 분기 미검증 (P2)
`restore()`가 `store.setState(snapshot)`(동기) 직후 `void store.persist.rehydrate()`(비동기, fire-and-forget)를 호출한다 — 의도는 튜토리얼 동안 다른 탭이 실제 draft를 편집했어도 localStorage 최신값을 반영하는 것(주석에 명시). 그런데 `useIsolatedRfpDraft.test.ts` 5개 테스트 전부 localStorage와 스냅샷을 동일하게 유지한 채 `restore()`를 호출해, 정작 이 분기(스냅샷≠localStorage일 때 rehydrate가 최신값으로 덮어씀)가 한 번도 실행되지 않는다. 복원 직후 같은 틱에 동기 편집이 있고 그 후 rehydrate가 resolve되면 그 편집을 덮어쓸 수 있는지도 미검증. dev→main 릴리스 컷 /ship 리뷰(테스트 스페셜리스트)에서 발견 — restore() 호출부가 `/tutorial` 언마운트라는 라우트 전환 경계라 동틱 레이스 가능성은 낮다고 판단해 이번 릴리스는 블로킹하지 않음. (발견: /ship 테스트 스페셜리스트 리뷰, dev→main 릴리스 컷 2026-07-17)

## Bid Wizard

### deriveAnyFeeFilled 경계값 전용 테스트 부재 (P3)
`components/inbox/bid-wizard/bid-wizard-validation.ts`의 `deriveAnyFeeFilled`(BidWizard.tsx에서 분리된 공용 함수, 튜토리얼 fixture 검증과 공유)에 전용 단위 테스트가 없다 — `fee='0'`(포함돼야 함), `fee='-1'`(제외돼야 함), 공백 문자열(`parseFloat`→NaN, 제외돼야 함), 다중 tier 중 하나만 채워진 경우, 빈 fees/methods 등 경계값이 미검증. (발견: /ship 테스트 스페셜리스트 리뷰, dev→main 릴리스 컷 2026-07-17)

## NTS / 사업자번호 조회

### lookupBizNoAction — 재시도+bounded wait 누적이 비인증 엔드포인트 요청 홀드시간을 증폭 (P1)
`lib/integrations/nts.ts`의 429 재시도(최대 3회, ky 백오프 300/600/1200ms)와 leaky-bucket bounded 대기(재시도마다 최대 ~1000ms)가 서로 누적된다 — 429 폭풍 시나리오(빠른 429 응답 기준) 최대 ~6초, 개별 시도가 5초 timeout까지 늘어지는 최악의 경우 이론상 ~27초까지 단일 요청이 열려 있을 수 있다. `lookupBizNoAction`은 가입 플로우용으로 **의도적으로 비인증**이며, Caddy 엣지에도 별도 rate limit이 없어(`deploy/Caddyfile` 확인) 유일한 방어선은 이 in-process 전역 leaky-bucket(IP 단위 아님)뿐이다. 데이터 유출·인증 우회는 아니고 단일 Lightsail VM에서의 리소스 소모(soft DoS) 증폭 이슈. 수정 방향: `lookup()` 전체를 `AbortController`/전체 데드라인(예: 6~8초 캡)으로 감싸 재시도+bounded wait 누적과 무관하게 총 홀드시간을 제한하거나, 이 액션에 한해 엣지/게이트웨이 레벨 IP별 rate limit 추가 검토. (발견: /ship 적대 리뷰, dev→main 릴리스 컷 2026-07-17 — 유저 확인 후 이번 릴리스는 블로킹하지 않기로 결정)

### Retry-After 헤더 malformed 값 폴백 미검증 (P3)
`lib/integrations/nts.ts`의 429 `shouldRetry` 분기에서 `Retry-After` 헤더가 숫자도 유효 HTTP-date도 아닌 값(`'garbage'` 등)이면 `afterMs=NaN`이 되어 조용히 일반 재시도 경로로 폴백한다 — 이 폴백 자체는 안전해 보이지만 테스트가 숫자/유효 date 케이스만 커버하고 malformed 값과 "헤더는 있지만 budget 이내인" 케이스는 미검증. (발견: /ship 테스트 스페셜리스트 리뷰, dev→main 릴리스 컷 2026-07-17)

## Quote / 가입비 후속

### QuoteTemplateOption 매퍼 중복 (P4)
projection(id~paymentFees)이 `lib/server/rfp-detail-loader.ts`와 `app/(app)/quote-templates/page.tsx`에 verbatim 중복 — 공용 `toQuoteTemplateOption` 매퍼로 추출하면 다음 필드 추가가 한 곳 수정으로 끝난다. (발견: v0.3.6.0 /ship review army)

### 정산 그리드 고아 셀 (P4)
`BidStepSettlement`·`QuoteTemplateDrawer`의 2열 그리드에 단일-스팬 필드 3개(정산한도·보증보험·가입비)라 마지막 행에 빈 셀이 남는다. /design-review로 시각 판정 후 정리. (발견: v0.3.6.0 /ship design specialist)

### 가입비 표시 폴리시 — ₩0 행·판정 캐비앗 (P3)
ImprovementSummary 가입비 행이 ₩0에도 상시 렌더(보증보험과 동일 패턴)되고, 정렬·'좋아져요' 판정에서는 의도적으로 제외된다(테스트로 고정). 고액 가입비가 헤드라인 판정에 영향을 주지 않는 것이 맞는지 프로덕트 결정 필요 — 필요시 행 옆 중립 캐비앗 표기. (발견: v0.3.6.0 /ship red-team + opus review)
