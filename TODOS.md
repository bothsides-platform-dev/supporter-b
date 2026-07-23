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

### 계정 탈퇴 Enter 제출 경로 무커버리지 (P3)
`DeleteAccountSection.tsx` 의 비밀번호 입력은 `onKeyDown` 으로 Enter 제출을 지원하는데(`e.key === 'Enter'` → `handleSubmit`), 이 경로를 타는 테스트가 없다. 선존재 갭이며 v0.4.9.1 의 플레이크 수정과 무관하다 — 기존 테스트도 `user.type('wrong')` 만 했지 Enter 를 누른 적이 없다. 탈퇴는 비가역 동작이라 Enter 오타 제출 방지(빈 비밀번호·submitting 중 재진입)까지 함께 커버하는 게 좋다. (발견: /ship 적대 리뷰 2026-07-22, v0.4.9.1)

## Signing (선정 후 전자서명 / SnowSign)

### 계약 탭 잔여 폴리시 2건 (P3)
딜룸 '계약' 탭 재설계(v0.4.6.0) 최종 리뷰가 남긴 후속. (① 타임라인 마일스톤 상태의 스크린리더 미노출은 **해결됨** — `nodeStatusLabel`이 노드 상태어를 파생하고 `SigningTimeline`이 Chip 없는 노드에 `sr-only`로 붙인다. 2026-07-22) (② 완료본 다운로드 링크의 새 창·다운로드 고지 누락은 **해결됨** — 링크 텍스트에 `sr-only` 로 '새 탭에서 내려받아요'를 넣어 접근성 이름에 싣는다. 시각적으로는 기존 Download 아이콘이 그대로 알린다. 2026-07-22) ③ **계약 탭이 종결 계약에도 항상 기본 탭이 된다** — 몇 달 전 완료·취소된 계약이라도 딜룸을 열 때마다 견적 비교를 뒤로 밀어낸다. 스펙대로의 동작이라 결함은 아니지만 종결 상태에선 기본 탭을 양보할지 제품 판단 필요. (발견: /superpowers 최종 브랜치 리뷰 2026-07-21) ④ **계약 탭 기본 활성은 마운트 시점 1회 결정(useState 초기값)** — 선정 직후 router.refresh() 로 계약이 생겨도 이미 열려 있는 딜룸의 탭은 바뀌지 않는다(사용자가 보던 탭을 시스템이 뺏지 않는다는 판단, /ship 리뷰에서 확인). 딜룸을 다시 열면 계약 탭이 기본이다.

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

### presence M2 착수 시 — history 잉여 표면 재평가 + deriveActivity 실배선 (P4)
presence 관계 게이트 전환(2026-07-23, THREAT_MODEL §2.3/§2.6)이 남긴 후속 두 가지. ① `history_size: 1`/`history_ttl: 60s`/`allow_history_for_subscriber` 는 현재 소비 코드 0곳(`.history()` 호출 부재 — config 주석의 late-observer 복구는 aspirational)이라 관계-내 내용 주입의 60초 보관 표면만 남긴다. M2 활동 레이어가 실제로 history 를 쓰지 않기로 하면 세 키를 제거(드리프트 가드 갱신 동반). ② `deriveActivity` 의 `{state}` enum 검증은 publication 핸들러가 없어 도달 불가능한 코드 — M2 에서 publication 소비를 배선할 때 이것이 계획된 게이트임을 THREAT_MODEL §2.4 가 명기한다. (발견: /ship 적대 리뷰 2026-07-23)

### connection-token load-shed 가 malformed env 에 조용히 비활성화 (P4)
`app/api/centrifugo/connection-token/route.ts` 의 `MAX_INFLIGHT` 는 `Number(process.env.CENTRIFUGO_TOKEN_MAX_INFLIGHT)` 파싱이라 env 가 `'abc'` 같은 값이면 `NaN` → `inFlight >= NaN` 항상 false → load-shed 전체가 소리 없이 꺼진다. `Number.isFinite` 가드 + 기본값 폴백 필요. (발견: /ship 적대 리뷰 2026-07-23 — 리뷰 범위 밖 선존재)

## Design

### 초대 수락 화면이 하드코딩 목업 + 거절 버튼 무동작 (P3)
`app/(public)/invite/page.tsx` 는 초대자·워크스페이스·멤버 수가 전부 리터럴(`홍길동`·`(주)샘플테크`·`멤버 1명`)인 목업이고, `거절하기` 버튼에는 `onClick` 이 없어 아무 일도 하지 않는다. v0.4.11.0 의 대비 스윕이 이 버튼을 1.41:1 에서 정상 대비로 올리고 hover 도 살려 놔서, **더 또렷하게 살아 있는 컨트롤처럼 보이는데 여전히 무동작**이다. 실데이터 바인딩과 거절 액션 배선이 필요하다. (발견: /ship 적대 리뷰 F14, 2026-07-22, v0.4.11.0)

### 3차 텍스트 톤 소멸에 따른 위계 재설계 — 육안 확인 필요 (P3)
v0.4.12.0 이 `outline` 을 텍스트에서 걷어내면서 텍스트 색이 2단(`on-surface`/`on-surface-variant`)으로 줄었다(같은 릴리스에서 라이트 `on-surface-variant` 를 `#5F646D` 로 어둡게 조정해 대비 자체는 전 표면 계층에서 AA 를 넘겼다 — 남은 것은 위계 문제다). AA 를 통과하면서 `on-surface-variant` 보다 옅은 색은 만들 수 없으므로(상한 L≤0.175 vs 실제 L=0.161) 그 아래 위계는 타입스케일로 만들어야 하는데, 스윕은 색만 올렸고 크기·굵기는 손대지 않았다. 명시적으로 접은 두 곳(`WizardStepSidebar` 라벨·`PgProcessStepRail` 제목 — 배지·도트가 상태를 대신 진다) 외에 리뷰가 지목한 잔여 후보: ① `components/landing/CostComparisonChart.tsx:25` 이어브로우와 단위 라벨이 같은 색·크기·서체가 됨, ② `BidStepProposal.tsx:57`·`RfpAttachmentDropzone.tsx:160` 의 "업로드 지시문 / 용량 힌트" 두 단이 한 톤으로 붙음, ③ `ProblemCard.tsx:13` 의 clamp(28–44px) 장식 숫자가 워터마크에서 읽히는 2차 요소로 바뀜(대형 텍스트라 AA 기준은 3:1 이므로 opacity 로 되돌릴 여지 있음). 전부 신뢰도 3–4 의 육안 판단 건이라 `/design-review` 로 실제 화면을 보고 결정한다. (발견: /ship design 리뷰 2026-07-22, v0.4.11.0)

### 인앱 테마 토글이 브라우저 크롬 색을 안 따라감 (P3)
`app/layout.tsx` 의 `viewport.themeColor` 는 `prefers-color-scheme`(OS 설정)으로만 분기하는 정적 선언이라, 사용자가 인앱 테마 토글로 OS 와 다른 테마를 고르면 캔버스는 다크인데 모바일 상태바는 라이트(또는 반대)로 남는다. 값 자체는 캔버스 토큰과 일치하며(`app/__tests__/chrome-colors.test.ts` 가 고정), DESIGN.md §2 에 범위 한정 문구로 명문화해 둔 상태 — 기능 결함이 아니라 미구현 축이다. 닫는 법: 테마 스토어가 클래스를 토글할 때 `<meta name="theme-color">` 의 content 도 함께 갱신해 크롬이 실효 캔버스를 따라가게 한다. (발견: /ship design 리뷰 2026-07-21)

### AnimatedBrandMark 진입 애니메이션 — DESIGN.md 예외 미문서화 (P4)
`components/primitives/AnimatedBrandMark.tsx`(v0.3.0.0, `SidebarBrand`가 인증 앱 셸에 마운트)의 1회성 SVG `pathLength`/`fillOpacity` draw-on 진입 연출이 DESIGN.md §9의 `(app)/**` 두 예외(축하 모먼트·테마 전환 리빌) 어디에도 명시되지 않았다(같은 릴리스 범위의 `.coachmark-pulse`는 예외로 문서화됨과 대비). 기능적 결함은 아님 — 세 번째 예외로 DESIGN.md에 명문화할지, `/design-review`로 하드룰 위반 여부를 재검토할지 정책 결정 필요. (발견: /ship 문서 동기화 점검, dev→main 릴리스 컷 2026-07-17)

## SEO / Branding

### 브랜드명 리터럴 하드코딩 — SSOT 미참조 (P3)
`서포트 B`→`서포트비` 전환(v0.2.78.0) 과정에서 확인됨: 이메일/SMS 제목 템플릿 11개 파일(`lib/server/services/{rfp,bid,chat,team-chat,auth,workspace}.ts`, `lib/server/outbox/{chat-digest-flush,team-chat-digest-flush}.ts`, `lib/server/outbox/templates/_layout.tsx`, `lib/server/actions/auth/sendPhoneOtpAction.ts`, `lib/server/notifications/admin-signup.ts`)와 `scripts/generate-og-image.ts`가 브랜드명을 SSOT 참조 없이 리터럴로 하드코딩한다(SSOT 는 `siteConfig.name` 하나 — v0.4.3.0 에서 `PRODUCT_NAME` 이 거기서 파생하도록 정리됐다). 이번 리네임에서 12개 파일을 find/replace로 손대야 했던 것이 비용 증거. 후속: 공유 상수를 각 subject 템플릿에 interpolate하도록 리팩터(별도 PR — 템플릿 로직 변경이라 문구 교체보다 범위가 큼). (발견: /ship maintainability+adversarial 리뷰 2026-07-07, 브랜드 전환 PR — 두 리뷰어가 독립적으로 동일 패턴 지적)

## Landing

### ScrambleText rAF 루프가 헤드라인이 화면 밖으로 스크롤돼도 계속 돎 (P3)
`components/landing/hero/ScrambleText.tsx`의 순환 문구 스크램블 애니메이션은 `document.hidden`(탭 백그라운드)에만 반응해 일시정지하고, 히어로 섹션 자체가 스크롤로 화면 밖에 나가도 rAF 루프(60ms 글리프 갱신 + 프레임당 setState)가 계속 돈다(리크는 아님 — cleanup은 정상, 비용도 작은 span 10여 개 스타일 재계산 정도로 트리비얼). 수정 방향: `HeroPinnedScene`이 이미 갖고 있는 `scrollYProgress`를 prop으로 내려받아 히어로 트랙을 벗어나면 정지하거나(`HeroAsciiField`가 쓰는 방식과 동일), 또는 별도 IntersectionObserver를 둔다. (발견: /ship performance+adversarial 리뷰 2026-07-03, `feat/hero-headline-scramble` — 두 리뷰어가 독립적으로 동일 지점 지적)

## Signup / Auth

### approval_status 에 CHECK 제약 없음 — 현재 노출 0, 방어심층만 (P4)
`workspace_members.approval_status` 는 제약 없는 `text` 라서, 값이 드리프트하면(`'Approved'`·`'active'`·`''`) `isApprovedAdmin` 이 false 가 되고 fail-open 이 생긴다. **다만 v0.4.10.0 에서 쓰기 경로를 전수 조사한 결과 드리프트를 만들 수 있는 코드가 없다** — 양쪽 레포 통틀어 쓰기는 5곳이고 전부 캐논니컬 리터럴 아니면 컬럼 default 다: 메인 `workspace.ts` `addMember`(`MemberApprovalStatus` 로 타입 강제됨), 메인 `auth.ts` canonical-PG 합류(`'pending_approval'` 리터럴), 컬럼 default(`'approved'`), 어드민 `approveMemberAction`/`rejectMemberAction`(각각 `'approved'`·`'rejected'` 리터럴 + `WHERE approval_status='pending_approval'` CAS 가드). 어드민 레포에는 `drizzle.config.ts` 도 db 스크립트도 없어 push 로 스키마를 바꿀 수도 없다(스키마 파일은 쿼리 타이핑용 읽기 전용 미러).

즉 **원래 이 항목이 P2 로 적혔던 근거(“별도 레포라 타입에 안 묶여 드리프트 가능”)는 사실이 아니다.** 남는 위험은 수동 psql 실수, 또는 앞으로 어느 레포든 새 쓰기 경로가 생기는 경우뿐이다.

붙일 때 참고: `attachments.status`·biz-profiles·rfps 가 이미 같은 패턴(text + CHECK)을 쓰므로 관례에는 부합한다. 데이터가 깨끗하면 `pnpm db:push` 한 번으로 끝나고(additive), 붙이기 전 `SELECT approval_status, count(*) FROM workspace_members GROUP BY approval_status;` 로 분포만 확인하면 된다. 드리프트 행이 있으면 **임의로 `'approved'` 로 덮지 말 것** — 승인된 적 없는 멤버에게 실효 admin 을 주게 된다. 어드민 레포 스키마 미러에도 같이 반영해야 나중에 db:push 가 생겨도 안 지워진다. (재검토: v0.4.10.0 — P2 → P4 하향)

### 사업자 상태 차단이 클라이언트 전용 — 서버가 클라 status 를 그대로 신뢰 (P2)
`BizLookupField` 의 `blockedStatuses` 는 폐업·휴업이면 `onResult` 를 호출하지 않아 제출 버튼을 잠그는 **UI 게이트**다. 서버는 이를 재검증하지 않는다 — `updateWorkspaceBizProfileAction` 의 `BizProfilePatch` 는 `status: z.enum(['active','suspended','closed'])` 로 세 값을 모두 받고, 저장 시 `status: bizPatch?.status ?? base!.status` 로 **클라이언트가 보낸 값을 그대로 영속**한다. 따라서 액션을 직접 호출하면 폐업 사업자번호가 저장된다. 구매사 가입 경로(`BuyerWorkspaceForm`)도 v0.4.9.0 이전부터 동일한 구조라 신규 결함이 아니라 **선존재 아키텍처 갭**이다.

**주의 — 얕은 수정은 실효가 없다**: 서버 스키마에서 `closed`/`suspended` 를 거부하는 것만으로는 못 막는다. 서버가 상태를 클라이언트에게서 받으므로 `status:'active'` 로 위조하면 그대로 통과한다. 실제 방어는 서버가 NTS 를 재조회해 판정하는 것이며, 그러면 ① 트랜잭션 안에서 외부 API 를 호출할지, ② NTS 장애 시 fail-open/fail-closed(정상 사용자의 정보 수정까지 막을지), ③ 레이트리밋([[NTS 엣지 IP 제한]] 항목과 연결) 세 가지 설계 결정이 따라온다. CLAUDE.md 가 명시한 "서버 액션/API 라우트 데이터 경계 강제는 의도적 후속" 정책과 같은 계열이며, `PG 멤버십 승인 서버 데이터 경계 강제 (P2)` 와 함께 처리하는 게 자연스럽다. (발견: /ship 인라인 보안 검토 2026-07-22, v0.4.9.0 — 유저 확인 후 이번 PR 은 클라이언트 전용 범위로 확정)

### PG 가입 BizLookupField blockedStatuses 누락 (P3)
PG 가입 플로우도 `BizLookupField` 를 사용하며 현재 `blockedStatuses` 가 없다. PG 도메인에서도 폐업·휴업 사업자를 차단해야 하는지 정책 결정 후 `blockedStatuses={['closed', 'suspended']}` 추가. 구매사 가입·설정 두 경로는 v0.4.9.0 에서 닫혔고, 차단 문구는 두 문맥이 공유하도록 '가입할 수 없어요'→'사용할 수 없어요' 로 중립화됐다. (발견: v0.2.27.2 adversarial 2026-06-20, P3 — 정책 미확정)

## Workspace / Members

### 미승인 PG 멤버의 인라인-게이트 API 라우트 잔여 노출 (P4)
승인 게이트(2026-07-24, `isPgMembershipBlocked` — `requirePgSession` + `requireActiveWorkspace` 이중 배선으로 PG 전용 표면과 채팅·보드·계약 라이프사이클 등 양측 공용 액션까지 차단)가 닫고 남은 표면: `auth()`+3층 인라인 게이트를 직접 쓰는 공유 라우트(`app/api/files/presign`·`files/[id]/complete`, `centrifugo/connection-token`)와 세션 없는 server-to-server `centrifugo/subscribe`(멤버십 row 기준)는 `approval_status` 를 읽지 않는다. 실행 가능한 동작은 첨부 presign·WS 연결/구독 정도로 실익이 낮고(상태 변경 액션은 전부 게이트됨), connection-token 은 route-local TTL 캐시와의 staleness 트레이드오프가 있어 별도 판단 필요. (발견: 서버 데이터 경계 구현 중 2026-07-24 — 원 P2 항목의 잔여 분리, red-team 리뷰로 requireActiveWorkspace 갭 소급 종결)

### repo 계층 쿼리빌더가 `any` — projection 드리프트 전면 미검출 (P2)
`drizzle/*.ts` 34개 중 **29개가 `private h(tx?: Tx): any`** 이고, `Db` 를 쓰는 나머지도 `type Db = any` 별칭이라 결국 같다. 즉 이 계층의 모든 `.select({...})` projection 이 타입 미검사이며, select 에서 컬럼을 빼도 tsc 가 통과하고 런타임에 `undefined` 가 흐른다(v0.4.8.0 에서 F4 를 고치다 실측 확인 — 캐스트 제거만으로는 아무것도 잡히지 않았다). `workspace.ts` 는 `h(): Tx` 로 전환했고 **파일 전체 에러가 1건**뿐이었다(그 1건도 진짜 버그였다 — `addMember` 가 인터페이스의 `MemberApprovalStatus` 를 `string` 으로 넓힘). 나머지 28개 파일도 같은 방식으로 전환 가능해 보이며, 파일당 독립적이라 점진 적용된다. `[[project_drizzle-select-schema-drift]]` 와 같은 계열. (발견: F4 수정 중, v0.4.8.0)

## Storage / R2

### R2 고아 객체 sweeper (P3)
`scripts/sweep-r2-orphans.ts` — ListObjectsV2(prefix `attachments/`) → `attachmentRepo.findExistingIds` 배치 대사 → row 없는 키 중 LastModified 24h 초과만 DeleteObjects. `--dry-run` 지원, PM2 cron(일 1회) 등록. 고아 발생 경로: RFP 삭제 cascade(`rfpRepo.deleteById`, `_purgeUnverifiedSignup`) + sweep-uploads 의 객체 삭제 실패 잔존분. bid_note 삭제는 bid.ts가 storage.delete() 명시 호출로 이미 커버. **주의**: 이 sweeper는 "row 없는 객체" 방향만 정리한다. 반대 방향 중 **pending row(업로드 미완료)는 presigned 전환으로 `/api/cron/sweep-uploads` 가 이미 커버** — 남는 미커버는 "ready row인데 객체가 없는" 희귀 케이스(현재 R2 presigned URL 이 NoSuchKey 를 반환)뿐. (발견: /ship adversarial 리뷰 2026-07-05, presigned 전환 반영 2026-07-05)

## 견적 확장 (current_terms)

### 오픈보드 공개 범위 제품 검토 — 특히 customPaymentMethodLabels (P2)
문서가 오랫동안 "구매사명·제목·홈페이지만"이라 서술해 온 탓에 가려져 있었지만, 오픈보드는 실제로 9필드를 공개해 왔다(코드·가드 테스트는 처음부터 일관, 산문만 스테일 — v0.4.3.0 에서 정정). 추가 6필드는 전부 비경쟁 정보라는 판단이지만 **`customPaymentMethodLabels` 는 구매사가 직접 입력한 자유 텍스트가 비초대 PG 전원에게 브로드캐스트되는 유일한 필드**다. 구매사가 거기에 내부 명칭·거래처명 같은 걸 적을 수 있어 노출 적절성은 코드 문제가 아니라 제품 결정이다. 검토 축: ① 그대로 공개, ② 게시판에서만 제거(초대 PG 에겐 유지), ③ 입력 시 공개 사실을 고지. (발견: /ship 적대적 리뷰 2026-07-21)

### 요청조건 뷰 솔루션 표기 무테스트 (P3)
`components/rfp/RequestConditionsView.tsx` 의 `formatSolution` — `self`/`other` + `currentSolutionDetail` 이면 `자체 개발 (ABC몰)` 처럼 상세를 괄호로 덧붙이는데, 이 컴포넌트는 전용 테스트 파일이 없고 딜룸 스위트 두 곳에서 `vi.mock` 으로 대체돼 어느 계층에서도 검증되지 않는다. 로직 자체(`solutionLabel`)는 커버됨 — 빠진 건 상세 접미사 분기와 렌더 경로. (발견: /ship 커버리지 감사 2026-07-21)

### SCREEN_DESIGN 이 삭제된 컬럼을 아직 문서화 (P4)
`SCREEN_DESIGN.md` 의 현재 카드 수수료 opt-out 설명이 `current_fee_visible_to_pg` 를 컬럼으로 서술하는데, 이 컬럼은 v0.2.26.2 에서 DROP 됐고 `current_terms` JSONB + `hidden_from_pg` 가 유일한 저장소다(CLAUDE.md 는 이미 정확). 문서만 갱신하면 되는 건이지만 스키마 서술이라 오해 비용이 있다. (발견: /ship maintainability 리뷰 2026-07-21)

### (조건부) hidden_from_pg write-edge 검증 (P3)
현재는 hidden_from_pg 가 hiddenFromPgFromVisibility(수수료 공개여부)로만 채워져 안전. **추후 buyer 가 임의 필드를 숨길 수 있게 되면** write-edge 에서 HIDEABLE_PG_PATHS 검증 추가 필요 — 안 하면 PG_STRIP 핸들러 없는 숨김 경로 fail-open 누출. (선택, doc-edge 채택 시 함께)

### currentTermsFromDiscrete 빈문자열 정규화 (P3)
'' 입력을 문서에 그대로 담음(현재 falsy 라 UI 무해). omit 으로 정규화하면 더 깔끔. (발견: /ship 리뷰 2026-06-18)

## Bid Wizard

### deriveAnyFeeFilled 경계값 전용 테스트 부재 (P3)
`components/inbox/bid-wizard/bid-wizard-validation.ts`의 `deriveAnyFeeFilled`(BidWizard.tsx에서 분리된 공용 함수, 튜토리얼 fixture 검증과 공유)에 전용 단위 테스트가 없다 — `fee='0'`(포함돼야 함), `fee='-1'`(제외돼야 함), 공백 문자열(`parseFloat`→NaN, 제외돼야 함), 다중 tier 중 하나만 채워진 경우, 빈 fees/methods 등 경계값이 미검증. (발견: /ship 테스트 스페셜리스트 리뷰, dev→main 릴리스 컷 2026-07-17)

**부분 해소 (v0.4.3.0)**: 스칼라 판정이 `isFeeFilled` 로 추출돼(진행률 표시 `BidStepFees` 와 공유 — 기준 갈림 자체를 제거) `0`·`-1`·빈 문자열·미입력 키 4개 경계값은 `__tests__/bid-wizard-validation.test.ts` 가 커버한다. **남은 것은 조합 축**: 다중 tier 중 하나만 채워진 경우, 커스텀 수단, 빈 fees/methods 에서의 `deriveAnyFeeFilled` 자체 동작.

## NTS / 사업자번호 조회

### 엣지 레벨 IP별 rate limit 부재 (P3)
v0.4.9.0 이 `lookup()` 에 총 데드라인(`NTS_LOOKUP_DEADLINE_MS`)을 걸어 **단일 요청의 홀드시간**은 잘렸지만, 남은 축은 **동시 요청 수**다. `lookupBizNoAction` 은 가입 플로우용으로 의도적으로 비인증이고 `deploy/Caddyfile` 에도 IP 단위 제한이 없어, 유일한 방어선은 여전히 in-process 전역 leaky-bucket(IP 단위 아님)뿐이다. 데드라인 덕분에 요청당 점유는 상한이 생겼으니 우선순위는 P1→P3 으로 내렸다. 검토: 이 액션에 한해 엣지/게이트웨이 레벨 IP별 rate limit. (발견: /ship 적대 리뷰 2026-07-17, 부분 해소 v0.4.9.0)

## Quote / 가입비 후속

### 정산 그리드 고아 셀 (P4)
`BidStepSettlement`·`QuoteTemplateDrawer`의 2열 그리드에 단일-스팬 필드 3개(정산한도·보증보험·가입비)라 마지막 행에 빈 셀이 남는다. /design-review로 시각 판정 후 정리. (발견: v0.3.6.0 /ship design specialist)

### 가입비 회수기간(payback) 표시 — 데이터 확인 후 결정 (P3)
`ImprovementSummary` 가입비 행은 이제 ₩0 을 '없어요' 로 읽히게 하고 '1회성 비용' 캐비앗을 상시 병기해 **헤드라인 판정 밖이라는 사실**을 알린다. 남은 축은 **materiality** 다 — 고액 가입비가 첫 해 수수료 절감을 잡아먹는 경우 '좋아져요' 헤딩이 여전히 낙관적으로 읽힌다.

계산 자체는 가능하다: `current_terms` 에 `annualPgVolume`·`feeRate` 가 있으므로 `가입비 ÷ (연간거래액 × 수수료차 ÷ 12)` = 회수 개월수이고, `BuyerDealRoomBody` 가 이미 같은 `rfp` 객체를 들고 있어 prop 하나 거리다. 신규 계약(`contractType==='new'`)은 두 필드가 서버에서 stripped 라 계산 불가 → 현재의 캐비앗으로 폴백.

**착수 전 확인할 것**: ① 가입비>0 인 견적 비율, ② `annualPgVolume` 입력률. 둘 다 낮으면 실질 대상이 거의 없는 기능이다. `SELECT count(*) FILTER (WHERE signup_fee > 0), count(*) FROM bids;` 로 갈린다.

**주의 — 순진한 대안은 틀렸다**: "가입비>0 이면 헤딩 중립화" 는 PG 다수가 가입비를 받으면 헤딩이 상시 중립이 되어 신호가 죽는다. 옳게 하려면 "첫 해 절감액을 가입비가 넘어설 때만" 이어야 하고, 그 판정이 곧 위 회수기간 계산이다. 둘은 별개 선택지가 아니다. (발견: v0.3.6.0 /ship red-team + opus review — 범위 정정·부분 해소 2026-07-22)

**참고 — 원 항목의 전제 2건은 부정확했다**: ① "보증보험과 동일 패턴" 은 렌더링에만 해당한다. 판정 제외의 실제 이유는 제품 결정이 아니라 구조다 — `CurrentTermsV1` 에 `signupFee` 키가 없어 구매사가 현재 가입비를 입력하는 경로 자체가 없고, 따라서 비교 기준선이 존재하지 않는다(보증보험은 `currentGuaranteeInsurance` 가 있다). ② "정렬 제외" 는 가입비 특정이 아니다 — `sortBidsByCardFee` 는 카드 수수료 단일 축이라 월 정산한도·보증보험도 똑같이 빠져 있다.
