# TODOS

## Chat / Realtime

### Centrifugo subscribe 프록시 공유 비밀 헤더
**Priority:** P1
프록시 ACL 엔드포인트(`/api/centrifugo/subscribe`)가 Caddy catch-all 로 외부에서 POST 가능 — allow/deny 1비트 오라클(악용에는 userId·wsId·rfpId uuid 를 모두 알아야 해 저위험). Centrifugo `proxy_http_headers` 로 정적 비밀 헤더를 보내고 라우트에서 상수시간 비교로 검증. **prod Centrifugo 설정 변경과 동시 배포 필요** — 독립 PR 로. (발견: /ship 보안 리뷰 2026-06-10, branch worktree-feat-chat-rail-team-chat)

### ChatService.sendMessage 의 rfpId 태그 접근권 검증
**Priority:** P1
클라이언트 제공 `rfpId` 태그를 접근권 검증 없이 영속(기존 코드 — 레일 defaultRfpId 가 경로를 새로 활성화). 표시 자체는 viewer 스코프 rfpById 로 안전하나, 교차 테넌트 uuid 오염 저장 + FK 에러 경유 존재 오라클. buyer=소유 / pg=canAccess 검증 후 불일치 시 태그 드랍 또는 INVALID_INPUT. (발견: /ship 보안 리뷰 2026-06-10)

### 라이브 self-echo 상관관계 id (멀티탭)
**Priority:** P2
낙관적 승격이 "첫 pending" 매칭이라 같은 유저 두 탭 동시 전송 시 echo 가 다른 탭의 pending 을 오인 승격할 수 있음(ThreadView·TeamThreadView 동일, 선례 패턴). 액션 입력에 클라이언트 tempId 를 받아 publish 페이로드로 왕복, tempId 매칭 승격으로 교체. 서버 페이로드 계약 변경 동반 — 별도 PR.

### RFP 접근 게이트 공유 헬퍼
**Priority:** P2
buyer-소유/PG-canAccess 규칙이 `TeamChatService.authorize` 와 subscribe 라우트 `authorizeTeamChannel` 두 곳에 중복. `canWorkspaceAccessRfp(rfpId, wsId)` 단일 출처로 추출 (둘 다 테스트 그린 유지).

### 대화 스레드 캐시(thread-cache) remount 신선도
**Priority:** P2
`/messages` 의 conversation thread-cache 는 invalidate-on-unmount 가 없어(기존 동작) 소프트 재방문 시 스테일 스냅샷 재생 가능. 팀 채팅에 적용한 패턴(TeamThreadPane unmount invalidate) 을 ThreadPane 에도 이식.

## Auth / Signup

### 가입 INSERT 후 비즈니스 early-return 의 고아 user 행 (기존 버그)
**Priority:** P2
`completeSignup`(`!input.wsName`)·`signupViaInvite`(`!claim.ok`) 가 `tx.insert(users)` *뒤에* `{ok:false}` 를 반환하면 콜백이 정상 resolve→postgres-js 가 부분 tx 를 commit→워크스페이스 없는 미인증 user 행이 남음. `MISSING_WS_NAME` 은 `signupCompleteAction` 이 액션에서 선검증하므로 현재 도달 불가지만, 서비스 내 가드를 `transaction()` 앞으로 hoist 하면 깔끔. claim 실패 경로는 throw-to-rollback 패턴 필요. 자가치유(재시도 시 멤버십 없어 purge 대상)되지만 의도치 않은 commit. (발견: /ship 어드버서리얼 2026-06-14, branch worktree-fix+signup-email-taken-pg-tx-rethrow. merge-base 기존 동작, 이 브랜치 비도입.)

### 가입 race-collision .catch arm 테스트 (invite·canonical)
**Priority:** P2
`signupViaInvite`·`joinCanonicalPgWorkspace` 의 새 outer `.catch`(unique→EMAIL_TAKEN, non-unique→rethrow)는 `completeSignup` 의 throwingInsertDb 테스트와 동일 코드지만 직접 테스트 없음. invite/canonical 진입점은 유효 invitation·workspace 픽스처가 tx 까지 살아남는 더 풍부한 stub 필요. 추가로 postgres-js 의 "콜백 resolve 후 재던짐" 시맨틱을 모사하는 충실한 stub(동기 throw 가 아니라 resolve-후-reject)으로 회귀를 박제. (발견: /ship 테스트·어드버서리얼 2026-06-14)

### AuthService unique-violation→EMAIL_TAKEN 매핑 DRY
**Priority:** P3
`if (isUniqueViolation(err)) return {ok:false, error:'EMAIL_TAKEN'}; throw err;` 가 3개 가입 메서드 `.catch` + `confirmEmailChange` 까지 4곳 중복. 제네릭 헬퍼 `mapUniqueViolationToEmailTaken<T>` 로 추출. 가입 user-insert 8필드 리터럴도 3곳 중복(스키마 컬럼 추가 시 drift 위험) — `insertNewSignupUser(tx, …)` 헬퍼 검토. (발견: /ship 유지보수 리뷰 2026-06-14)

### 이메일 미인증 사용자의 서버 액션·API 데이터 경계 차단
**Priority:** P1
이메일 인증 게이트(0.2.19.0)는 (app) **페이지 렌더 경로만** 막는다. 서버 액션(`requireSession`/`requireBuyerSession`/`requirePgSession`)과 raw `auth()` API 라우트(`/api/files/*`·`/api/notifications/*`·`/api/centrifugo/connection-token`·`/api/workspace/*/avatar`·`/api/workspaces/search`)는 `emailVerified` 를 검사하지 않아, 미인증이지만 인증된 세션(가입 직후 자동 로그인)으로 직접 호출 시 견적 제출·RFP 생성·award·파일 업로드·realtime 토큰 발급이 가능. `requireSession` 에 emailVerified 검사 추가(액션 + 이를 쓰는 API 일괄 커버) + raw-auth API 약 7곳에 `isSessionRevoked` 옆에 미러. **footgun: verify 액션 3개(`sendMyEmailVerificationAction`·`checkMyEmailVerifiedAction`·`verifyEmailCodeAction`)는 반드시 면제** — 아니면 미인증 유저가 영영 인증 불가. 별도 TDD PR. (발견: /ship 어드버서리얼 2026-06-14, branch worktree-fix+pg-email-verification-gate. 기존 동작, 이 PR 비도입; 사용자가 후속으로 명시 연기.)

### ApprovalWaitingScreen 의 router.push('/home') cross-host 잠재 위험
**Priority:** P3
`approval-waiting-screen.tsx` 승인 폴링 성공 시 `router.push('/home')`(소프트 내비)를 쓴다. EmailVerifyScreen 은 0.2.19.0 에서 `window.location.assign` 으로 전환했으나 이 형제 화면은 그대로다. 미인증/승인대기 유저가 다른 호스트의 `/pending-approval` 에 있을 때 (app) 가드의 cross-host redirect 를 RSC fetch 로 따라가다 CORS 에 막힐 수 있음(좁은 윈도우, 기존 동작). `window.location.assign('/home')` 로 통일. (발견: /ship 어드버서리얼 2026-06-14)

## Design

### PG 인박스 상세 토글 위치 정돈
**Priority:** P2
ChatRailToggle 이 본문 위 우측 정렬 스트립에 고아처럼 떠 있음 — 구매사 상세처럼 PgRfpDetailContent 헤더 행 슬롯으로 이동.

### 레일 열림 + 1024px 본문 그리드
**Priority:** P3
w-96 레일이 열린 lg(1024px) 뷰포트에서 '내가 요청한 조건' `grid-cols-2` 가 좁아질 수 있음 — 육안 확인 후 `grid-cols-1 xl:grid-cols-2` 검토 (/design-review 경로).

### RecipientCard rfpContext 의 uuid 노출 (기존 버그)
**Priority:** P2
FocusComparison → MessageComposeSheet 의 `rfpContext={{ code: props.rfpId(uuid), title: rfpCode }}` — RecipientCard 가 uuid 를 mono 로 표시. `code` 가 전송 rfpId(uuid) 겸 표시값으로 이중 사용되는 구조라 RfpContext 타입을 {id, code, title} 로 분리해야 함 (merge-base 기존 버그, 이 브랜치 비도입).

## Kanban Board

### 보드 카드 이동의 키보드 대체 수단
**Priority:** P1
센서 교체(Mouse+Touch)로 보드 드래그가 포인터 전용이 됨 — 기존 KeyboardSensor 는 래퍼 가짜 버튼(role/tabIndex 스프레드, 무라벨·중첩 버튼) 위에서만 동작하던 깨진 affordance 였고, 카드 버튼에 합치면 dnd-kit 이 Enter 클릭을 preventDefault 로 죽여 기각. 올바른 복원은 카드 버튼 **밖** 전용 드래그 핸들(스트레치드 버튼 패턴으로 PipelineCard 루트 재구성) + KeyboardSensor 재도입, 또는 카드 컨텍스트 메뉴 '이동' 액션. 모든 드래그 액션은 상세 화면 버튼 경로로 수행 가능(기능 잠금 아님). (발견: /ship adversarial·design 리뷰 2026-06-13, branch worktree-fix-kanban-board-ux)

### PG 인박스 데이터 조립 중복 + 보드 뷰 2중 페치
**Priority:** P2
`app/(app)/inbox/page.tsx` 의 pairs/bids/pendingRequotes 조립이 `loadBoard.ts` pg 분기와 한 줄 단위 중복이고, 보드 뷰에서는 둘 다 실행돼 동일 쿼리 3쌍이 요청당 2회 나감(행 수 작아 현재 무해). `loadPgInboxData(wsId)` 공유 로더로 추출해 양쪽이 소비하도록. (발견: /ship maintainability·performance 리뷰 2026-06-13)

### 종결 컬럼 정렬을 전이 시각 기준으로
**Priority:** P3
결과 컬럼 정렬 키가 buyer=createdAt, pg=submittedAt 이라 방금 취소/철회한 오래된 카드가 limit 10 절단 밖으로 밀려 '증발'처럼 보일 수 있음. 카드에 전이 시각(awarded/cancelled/withdrawn at)을 실어 내림차순 정렬하거나 최근 전이 카드 상단 고정. (발견: /ship red-team 리뷰 2026-06-13)

### rfp_bids 보드 죽은 표면 정리
**Priority:** P3
BidCard·loadBoard rfp_bids 분기·cardType 'bid' 경로가 어디에도 마운트되지 않음(비교 화면 재설계 PR#97 이후). 부활 계획 없으면 제거, 보존이면 'no current mount point' 주석 명시. (발견: /ship red-team 리뷰 2026-06-13)

## Signup / Auth

### OTP 입력 칸 Enter 키 → 폼 조기 제출
**Priority:** P3
담당자 정보 단계에서 인증번호 입력 후 Enter 를 누르면 폼이 제출되어(확인 버튼은 type=button) 인증 전 "휴대전화 인증을 완료해주세요" 가 뜸. OTP 입력의 Enter 를 handleVerify 로 라우팅하거나 그 입력에서 폼 제출을 막기. (발견: /ship 근본원인 분석 2026-06-13, branch worktree-fix-signup-profile-ready-guard-bounce)

### 비공개 모드 sessionStorage 차단 시 가입 막다른 길
**Priority:** P3
sessionStorage 가 차단되면(사파리 비공개 등) readSignupDraft 가 {} 반환 → 프로필 단계 ready=false 로 첫 가입 화면 redirect, 폼 진입 불가(기존 동작, 이 브랜치 비도입). 비공개 모드 안내 또는 대체 캐리어 검토. (발견: /ship adversarial 리뷰 2026-06-13)

## Bid Wizard

### 견적 입력 사전채움 값이 표시와 어긋날 수 있음 (소수 3자리+ / cycleNum>99)
**Priority:** P2
`NumericFormat`(decimalScale=2)·cycleNum(isAllowed≤99)은 타이핑은 제대로 막지만, **마운트 시점에 전달된** 값은 정규화/재방출하지 않음. 레거시 데이터(이번 PR 이전 type=number 로 입력된 소수 3자리+ 요율이나 cycleNum 150 등)가 재요청·드래프트 복원으로 사전채움되면 수수료 표는 `1.23`(절삭)으로 보이지만 state·검토 단계·제출은 `1.2345`(원본)을 유지 — 표시와 제출이 어긋남. 검토 단계가 원본 값을 보여줘 발송 전 안전망은 있고, 신규 입력은 항상 ≤2자리라 영향 없음(레거시 한정). 픽스: 사전채움 경로(`bidToDraft`/`fmtPct`)에서 요율을 2자리로 반올림하고 cycleNum 을 99 로 클램프. (발견: /ship adversarial 리뷰 2026-06-14, branch worktree-fix+bid-numeric-inputs)

### 구간 수수료 그리드 환산 툴팁 양끝 열 오버플로 + aria 연결
**Priority:** P3
`FeeRateCell` 환산 툴팁이 `left-1/2 -translate-x-1/2` 중앙 정렬이라 5열 그리드의 영세(맨 왼쪽)·일반(맨 오른쪽) 열에서 가장자리로 넘칠 수 있음. 또 `role="tooltip"` 이 입력과 `aria-describedby` 로 연결돼 있지 않아 스크린리더는 환산값을 못 읽음(단, 기존엔 힌트 자체가 없어 순수 개선분). 픽스: 열 위치별 정렬(start/center/end) prop + 안정 id 의 aria-describedby. (발견: /ship 디자인 리뷰 2026-06-14, /design-review 경로)

## Email / Notifications

### 채팅·팀 다이제스트 발송 배치화
**Priority:** P3
일반 outbox flush 는 `resend.batch.send`(콜당 100통, rate-limit 1요청)로 묶어 보내지만, `flushChatDigests`·`flushTeamChatDigests` 는 본문을 발송 시점에 재계산해야 해서 여전히 수신자당 단건 발송이다(백오프/분류는 적용됨). 다이제스트는 (스코프·수신자·3분 윈도) coalesce + tick당 50건 상한이라 버스트가 작지만, 멤버 많은 워크스페이스에서 한 윈도가 동시에 만료되면 단건 발송이 초당 2요청을 넘길 수 있다. 재계산/취소 필터 후 살아남은 다이제스트를 `sendEntriesInBatches` 로 묶어 발송하도록 확장 검토. crontab `flock -n` 로 cron 중첩 더블센드는 이미 차단. (발견: /ship 어드버서리얼 2026-06-15, 본 PR 의도적 연기)

### 빈 RESEND_API_KEY dev-fallback 오설정 가드 (기존 동작)
**Priority:** P3
`RESEND_API_KEY` 가 빈 문자열이면 `ResendSender`/`ResendBatchSender` 가 dev 모드로 떨어져 `[email DEV]` 로그만 남기고 행을 `sent` 로 표시한다 — 운영에서 키를 빈 값으로 잘못 설정하면 메일이 조용히 안 나간다. 부팅/런타임 가드(예: `NODE_ENV==='production'` 이면 빈 키를 에러로)로 오설정을 표면화. 본 PR 비도입(기존 `ResendSender` 동작 미러). (발견: /ship 어드버서리얼 2026-06-15)

## Completed

- **딜룸 후속 TODO 4건 해소 (2026-06-14, dev 머지)**: 정식 페이지 통일(`DealRoomFull`, PR #186) · `/submitted` 견적작성 탭 흡수(PR #188) · `<lg` 하단시트 채팅 + 반응형 레일(PR #189) · 전체화면 이전/다음 결정성(`useDealRoomNav` 슬라이스, PR #187). 딜룸 모달 본 PR #185 위 스택으로 진행.
