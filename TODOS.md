# TODOS

## Deal Room / Award

### 선정 후 구매사 담당자(createdBy) 탈퇴 시 승자 PG가 빈 딜룸 (P3)
선정 연락처 교환(`CounterpartyContactCard`)은 `findContactById`가 fail-closed라, 구매사 담당자(RFP `createdBy`)가 탈퇴/시스템계정이면 `buyerContact=null`이 된다. 승자 PG 분기는 `awardedToMe && buyerContact`로 카드를, `awarded && !awardedToMe`로 미선정 안내를 그리므로 — 승자인데 buyerContact만 null이면 카드도 안내도 안 떠 빈 화면이 된다(드묾·누출 아님·정상 fail-closed). 후속: 연락처 없음 안내 폴백 또는 워크스페이스 대표 담당자 폴백 검토. (발견: /ship 적대 리뷰 2026-06-27)

## Chat / Realtime

### Presence: document observer-identity exposure in the threat model (P3)
공개 presence(`presence:ws:<V>`, D1)에서 raw `sub.presence()` 페이로드는 co-subscriber의 `user`(userId)+`connInfo.workspaceId`를 노출한다. 앱 UI 는 새지 않는다 — 회사 점은 owner 필터 binary online, 사람 점(UserProfileCard)은 ACL 로더가 내려준 `presenceWorkspaceId`(본인·같은 팀·대화 상대 한정)에 대해서만 per-user online 을 읽는다. 다만 raw WS 클라이언트는 워크스페이스 UUID 만 알면 `sub.presence()` 로 그 채널의 online userId 를 열거 가능(이 노출은 D1 공개 채널의 성질이지 앱 코드 때문이 아님). 봉인 입찰 데이터(수수료·경쟁사 수)는 무관. 위협 모델 문서에 한 줄 명기 + 장기적으로 presence:ws 를 subscribe-proxy(멤버십/대화 게이트)로 ACL 하는 것 검토. (발견: online-presence M1 whole-branch review 2026-06-21; per-user 소비 추가: v0.2.38.0 아바타 신원 카드)

## Chat / Morph animation

### 전송 morph 와이어링 중복 추출 (P3)
`ThreadView`·`TeamThreadView`가 morph 오케스트레이션(reduce/useMessageMorph/pendingFlight state, handleSend의 from-rect 측정, pendingFlight setter, measure-to useEffect 14줄 + eslint-disable 문구, opacity-0 래퍼 + `<MorphFlightLayer>`)을 거의 동일하게 복제. `useMessageMorph`는 상태 컨테이너만 추출하고 측정/스케줄 계약("useStickToBottom 뒤 선언", "clear 전 from 측정", "effect에서 to 측정")이 두 곳에 산재. 해소: `useMessageMorph({ listRef })`가 pendingFlight + measure-to effect까지 소유하고 `scheduleFlight(fromEl, key, text)` 반환 → 각 뷰는 handleSend에서 호출 + 레이어 렌더만. (발견: /ship maintainability 리뷰 2026-06-22)

### morph 클론 z-index가 딜룸 모달 위에 그려짐 (P3)
`MorphFlightLayer`가 body로 portal(`z-[100]`)되어 딜룸 모달(`z-50`) 위에 클론을 그림. 0.34s 비행 동안 클론이 모달 헤더 영역을 가로지르면 위에 덮어 보일 수 있음(`pointer-events-none`이라 클릭 차단은 없고, 두 끝점이 채팅 영역 안이라 대부분 무해, 비-모달 표면에선 정상). body-portal은 메시지 목록 overflow 클리핑 회피를 위한 의도적 선택 — 모달 안으로 portal하면 클리핑 재발. 필요 시 z를 모달 컨텍스트에 스코프. (발견: /ship adversarial 2026-06-22)

### prop-resync 중 localKey 유실 → 일시적 이중 말풍선 (P3)
`ThreadView`의 `prevMessages !== messages` 리싱크가 서버 행(localKey 없음)으로 교체 → flight 진행 중이면 행이 realId로 키잉되어 `isMorphing(realId)=false`로 실 말풍선이 즉시 보이고 클론도 비행 중 → 최대 0.34s 이중 표시(클론 완료 시 self-heal). 드문 레이스. 해소: 리싱크 시 활성 flight 전부 clear(hook에 `clearFlights()` 노출). TeamThreadView는 remount라 무영향. (발견: /ship adversarial 2026-06-22)

### 빠른 연속 전송 시 단일 pendingFlight 슬롯 (P3)
`pendingFlight`가 단일 state 슬롯이라 같은 틱에 두 번 전송하면 마지막 것만 morph(앞 메시지는 애니메이션 없이 즉시 표시 — 안전, 정합성 문제 없음). 연속 전송 일관성을 원하면 큐/배열로 전환. (발견: /ship adversarial 2026-06-22)

## Design

### font-mono uppercase tracking on non-numeric UI labels (C4) (P3)
`font-mono text-[10px] tracking-[0.1em] uppercase` 패턴이 폼 라벨·버튼·nav 링크 등 비수치 UI 요소 ~180곳에 남아 있음 (DESIGN.md 하드 룰 위반: "no `font-mono uppercase tracking` on labels/nav"). 대표 파일: `app/(public)/login`·`signup`·`password`·`auth`·`invite`, `components/auth/PasswordField`·`PhoneVerificationField`·`ResendCountdown`, `components/inbox/bid-wizard/BidContextStrip`, `components/settings/*`, `components/rfp/*`. 수정 방향: `font-mono text-[10px] tracking-[0.1em] uppercase` → `font-sans text-[11px] tracking-tight` + sentence case. 별도 worktree 권장(시각 변경 광범위). 또한 `font-mono tabular-nums` 직접 사용이 `md-numeric` 미전환 상태로 ~30건 잔존(`components/settings/`, `components/rfp/`, `components/landing/` 등) — C4 스윕 시 병행 정리. (도입: font-system audit PR#280 v0.2.35.1, 2026-06-22)

## Landing

### DemoCursor rAF 루프가 데모가 화면 밖으로 나가도 계속 돎 (P3)
`components/landing/demo-app/DemoCursor.tsx`의 `requestAnimationFrame` 루프는 매 프레임 `querySelector` + `getBoundingClientRect`(강제 리플로우)를 무조건 재예약한다. 두 데모 셸이 `useInView(..., { once: true })` 뒤에서 마운트하므로 데모가 한 번 화면에 들어오면 커서가 영영 언마운트되지 않고, 탭이 열려 있는 한 스크롤을 벗어나도 초당 ~60회 강제 리플로우가 지속된다(리크는 아님 — cleanup은 정상). 수정 방향: IntersectionObserver로 데모 창이 뷰포트에 있을 때만 루프를 돌리거나, 대상을 찾은 뒤 정적이면 cadence를 낮춘다. 랜딩 모션 예외 표면이라 무해하지만 CPU/배터리 낭비. (발견: /ship adversarial 리뷰 2026-07-02, `feat/landing-scroll-pin-sections`)

### ScrollPinnedSection의 미사용 progress·scrollToStep + steps=0 잠재 나눗셈 (P4)
`components/landing/ScrollPinnedSection.tsx`가 render-prop payload로 `progress`(MotionValue)·`scrollToStep`을 노출하지만 현재 소비처(`ScrollDrivenProblem`·`ScrollDrivenSolution`)는 `pinned`·`activeStep`만 쓴다(옛 `DemoStepBar` 소비처는 삭제됨). `scrollToStep`은 `(index+0.5)/steps`, `activeStep`은 `Math.floor(v*steps)`로 `steps===0`이면 `Infinity`/`-1`이 나온다 — 현재는 배열 길이가 상수 ≥4라 도달 불가. 미사용 필드 제거하거나 `steps<=0` 가드 추가. (발견: /ship maintainability+adversarial 리뷰 2026-07-02, `feat/landing-scroll-pin-sections`)

### 랜딩 데모 셸 DRY: PG 트리거/힌트 맵·진입 스케일 스타일 중복 (P4)
PG 데모 셸(`PgDemoAppShell.tsx`)은 페이지별 트리거/힌트를 로컬 `PAGE_TRIGGER`/`PAGE_HINT` 맵으로 인라인하는데, 구매사 셸은 `demo-triggers.ts`의 공용 함수(`demoTriggerSelector`/`demoCursorHint`)를 쓴다 — 같은 개념을 두 방식으로 구현해 드리프트 위험. 또 진입 스케일 인라인 스타일(`scale(1.1)`·`700ms cubic-bezier(...)`)이 두 셸에 그대로 복붙됨. 공용 함수/상수로 통합 검토. (발견: /ship maintainability 리뷰 2026-07-02, `feat/landing-scroll-pin-sections`)

## Signup / Auth

### 설정 페이지 WorkspaceBizNoForm blockedStatuses 누락 (P2)
워크스페이스 설정의 사업자번호 변경 폼(`WorkspaceBizNoForm.tsx`)이 `BizLookupField` 를 `blockedStatuses` 없이 사용한다. 기존 구매사 회원이 폐업·휴업 상태 번호로 변경할 수 있는 경로. `blockedStatuses={['closed', 'suspended']}` 를 추가해 설정 경로도 닫아야 한다. (발견: v0.2.27.2 adversarial 2026-06-20)

### PG 가입 BizLookupField blockedStatuses 누락 (P3)
PG 가입 플로우도 `BizLookupField` 를 사용하며 현재 `blockedStatuses` 가 없다. PG 도메인에서도 폐업·휴업 사업자를 차단해야 하는지 정책 결정 후 `blockedStatuses={['closed', 'suspended']}` 추가. (발견: v0.2.27.2 adversarial 2026-06-20, P3 — 정책 미확정)

### proxy-matcher EXCLUDED_SEGMENTS가 세그먼트 경계 없이 prefix 매칭 (P3)
`lib/auth/proxy-matcher.ts`의 `PROXY_MATCHER` 음의 전방탐색은 세그먼트 경계(`/` 또는 끝)를 강제하지 않아, `api`·`_next`·`fonts`·`file`·`globe`·`next`·`vercel`·`window`·`landing` 등 모든 항목이 접두어 매칭된다(예: 미래에 `/landing-editor`·`/next-steps` 같은 실제 보호 라우트가 생기면 인증 미들웨어를 통째로 건너뛴다). 현재는 충돌하는 라우트가 없어 무해하지만, 새 라우트 추가 시 이 목록과의 충돌을 확인하는 절차나 세그먼트 경계 강제(`(?:/|$)` 등)를 검토할 것. (발견: /ship coverage+adversarial 리뷰 2026-07-01, `fix/pg-landing-image-auth-redirect`)

### proxy-matcher 죽은 제외 항목 4개 정리 (P4)
`file`·`globe`·`next`·`vercel`·`window` 는 create-next-app 기본 SVG 에셋(`public/next.svg` 등) 때문에 추가됐던 항목인데, 해당 파일들은 이미 삭제되어 `public/`에 `fonts/`·`landing/`만 남아 있다. 지금은 아무것도 제외하지 않으면서 흔한 영어 단어라 미래 라우트와 충돌 여지만 남기는 상태. 제거 검토(단, 위 세그먼트 경계 이슈와 함께 처리하는 게 효율적). (발견: /ship adversarial 리뷰 2026-07-01, `fix/pg-landing-image-auth-redirect`)

## 견적 확장 (current_terms)

### (조건부) hidden_from_pg write-edge 검증
**Priority:** P3
현재는 hidden_from_pg 가 hiddenFromPgFromVisibility(수수료 공개여부)로만 채워져 안전. **추후 buyer 가 임의 필드를 숨길 수 있게 되면** write-edge 에서 HIDEABLE_PG_PATHS 검증 추가 필요 — 안 하면 PG_STRIP 핸들러 없는 숨김 경로 fail-open 누출. (선택, doc-edge 채택 시 함께)

### currentTermsFromDiscrete 빈문자열 정규화
**Priority:** P3
'' 입력을 문서에 그대로 담음(현재 falsy 라 UI 무해). omit 으로 정규화하면 더 깔끔. (발견: /ship 리뷰 2026-06-18)

### PG 멤버십 승인 서버 데이터 경계 강제 (P2)
`joinCanonicalPgWorkspace` 경로로 생성된 `approval_status = 'pending_approval'` 멤버는 UI 게이트(shell guard + `/pending-approval` 분기)로 차단되지만, 서버 액션/API 라우트(`requirePgSession()`) 레벨에서는 `memberApprovalStatus`를 검증하지 않아 직접 POST 요청으로 우회 가능. PR#199 emailVerified 유예와 동일 패턴 — 이번 PR에서 의도적으로 후속 유예. **구현 시 `requirePgSession()`에 `getMemberApprovalStatus` 체크 추가 또는 별도 미들웨어 gate.** (발견: 최종 코드 리뷰 2026-06-18)

**부분 해소 (v0.2.48.0)**: admin 권한 표면(WorkspaceService invite/resend/cancel/changeRole/removeMember + renameWorkspace + listAuditLogs + audit-log 페이지)은 `isApprovedAdmin`(role=admin AND approvalStatus=approved)로 서버에서 차단했고, countAdmins·adminRecipients·deleteAccount last-admin 판정·rfp 초대 메일 수신자도 승인된 admin 만 집계/수신. **남은 범위**: 비-admin pg 서버액션 전반에 대한 blanket `requirePgSession()` 승인 게이트는 여전히 미구현.

### changeMemberRole — LAST_ADMIN 오탐: pending_approval admin 강등 (P1)
`WorkspaceService.changeMemberRole` 의 LAST_ADMIN 가드(`if (input.role === 'member' && target.role === 'admin')`)가 `countAdmins`(승인된 admin 만 집계)를 호출하기 전에 `target.approvalStatus`를 검사하지 않는다. 결과: 유일한 승인 admin 이 아직 미승인(pending_approval) admin 을 member 로 강등하려 하면 — 그 미승인 admin 은 실질 권한을 행사한 적 없음에도 — 거짓 `LAST_ADMIN` 에러가 발생한다. **수정**: `changeMemberRole` line 279 조건에 `&& target.approvalStatus === 'approved'` 추가. TDD: pending_approval target 강등 시 LAST_ADMIN 없이 성공하는 회귀 테스트 먼저 작성. (발견: /ship adversarial v0.2.51.0, 2026-06-28)

