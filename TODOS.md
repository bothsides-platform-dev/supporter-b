# TODOS

## Deal Room / Award

### 선정 후 구매사 담당자(createdBy) 탈퇴 시 승자 PG가 빈 딜룸 (P3)
선정 연락처 교환(`CounterpartyContactCard`)은 `findContactById`가 fail-closed라, 구매사 담당자(RFP `createdBy`)가 탈퇴/시스템계정이면 `buyerContact=null`이 된다. 승자 PG 분기는 `awardedToMe && buyerContact`로 카드를, `awarded && !awardedToMe`로 미선정 안내를 그리므로 — 승자인데 buyerContact만 null이면 카드도 안내도 안 떠 빈 화면이 된다(드묾·누출 아님·정상 fail-closed). 후속: 연락처 없음 안내 폴백 또는 워크스페이스 대표 담당자 폴백 검토. (발견: /ship 적대 리뷰 2026-06-27)

## Workspace Logo

### workspaces.has_logo 컬럼 DROP (P3)
워크스페이스 로고가 `logo_updated_at`(캐시 버스트 `?v` + immutable) 단일 컬럼으로 전환됨. `has_logo` 는 더 이상 코드가 읽지/쓰지 않는 dead 컬럼(expand-contract 의 contract 단계 잔여). 배포 안정 확인 후 schema(`lib/db/schema/workspaces.ts`)에서 제거하고 `pnpm db:push` (또는 `ALTER TABLE workspaces DROP COLUMN has_logo;`). 데이터 손실 없음(재계산 불필요 — `logo_updated_at` 가 단일 출처). (도입: 워크스페이스 로고 캐시버스트, 2026-06-21)

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

## Signup / Auth

### 설정 페이지 WorkspaceBizNoForm blockedStatuses 누락 (P2)
워크스페이스 설정의 사업자번호 변경 폼(`WorkspaceBizNoForm.tsx`)이 `BizLookupField` 를 `blockedStatuses` 없이 사용한다. 기존 구매사 회원이 폐업·휴업 상태 번호로 변경할 수 있는 경로. `blockedStatuses={['closed', 'suspended']}` 를 추가해 설정 경로도 닫아야 한다. (발견: v0.2.27.2 adversarial 2026-06-20)

### PG 가입 BizLookupField blockedStatuses 누락 (P3)
PG 가입 플로우도 `BizLookupField` 를 사용하며 현재 `blockedStatuses` 가 없다. PG 도메인에서도 폐업·휴업 사업자를 차단해야 하는지 정책 결정 후 `blockedStatuses={['closed', 'suspended']}` 추가. (발견: v0.2.27.2 adversarial 2026-06-20, P3 — 정책 미확정)

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

## 견적 작성 (Bid Wizard)

### 정산주기 클라이언트 입력 상한을 서버 검증과 정렬 (P3)
`DayOffsetInput`(`components/forms/inputs.tsx`)에 상한이 없고 클라이언트 게이트 `isCycleValid`(`bid-wizard-validation.ts`)는 `cycleNum > 0`만 본다. 반면 서버 SSOT `SETTLE_CYCLE_RE`(`lib/utils/settle-cycle.ts`)는 1~999(3자리)만 허용 → PG가 `1000` 이상을 입력하면 1단계는 통과(초록 체크)하지만 제출 시 서버가 `INVALID_INPUT`으로 거절하고, `BidWizard`에 `SERVER_ERROR_STEP['INVALID_INPUT']` 매핑이 없어 검토(4단계)에서 필드 지목 없는 일반 오류로 끝난다. 비정상 입력(1000일 정산)이라 fail-closed·드묾·누출 아님. 수정: ① `DayOffsetInput`에 `isAllowed`로 상한(예: 999) 추가(공유 컴포넌트 — RFP 현재조건·배송주기 호출처도 함께 캡됨), ② `isCycleValid`를 `/^[1-9]\d{0,2}$/`로 강화해 1단계가 자체 힌트로 막게, ③ `SERVER_ERROR_STEP['INVALID_INPUT']`을 정산 단계로 매핑. 완료 시 `settle-cycle.ts` 주석의 "UI는 N≥1만 보장" 단서도 갱신. 관련: `bidToDraft`(`BidWizard.tsx`)는 재요청 prefill 시 `cycleNum`을 99로 클램프 → SETTLE_CYCLE_RE의 999 상한과 불일치(레거시 `D+150` 같은 값을 `D+99`로 조용히 정규화, PG가 재검토하므로 영향 낮음). 상한 정렬 시 함께 정리. (발견: /ship maintainability+adversarial 리뷰 v0.2.53.2, 2026-06-30)

## GEO / SEO

### llms.txt 쌍 route handler — 공통 헤더 상수 추출 (P2)
`app/llms.txt/route.ts`와 `app/llms-full.txt/route.ts`의 `Content-Type`·`Cache-Control`·`Vary` 헤더가 두 파일에 중복 선언된다. `lib/seo/llms.ts` 또는 공용 `route-utils` 모듈에 `TEXT_PLAIN_HEADERS` 상수를 추출해 단일 출처화하면 TTL 변경 등 헤더 수정이 한 곳만 건드린다. (발견: /ship maintainability v0.2.51.0, 2026-06-28)

### llms.ts buildLlmsTxt / buildLlmsFullTxt 머리말 블록 DRY 추출 (P2)
H1→blockquote→intro→'핵심 정보'→'검증 지표' preamble 렌더링 블록이 두 빌더 함수에 거의 동일하게 복사돼 있다. `pushPreamble(lines, origin, f)` 내부 헬퍼 추출로 단일 출처화. (발견: /ship maintainability v0.2.51.0, 2026-06-28)

### product-facts.ts BUYER_FACTS.metrics — LandingHero 드리프트 가드 (P2)
`BUYER_FACTS.metrics` 캡션 문자열이 `LandingHero.tsx:METRICS`를 수동 미러하며 드리프트 위험을 코멘트로 문서화해 뒀다. 두 파일을 공유 상수로 연결하거나 드리프트 가드 테스트(캡션 문자열 일치 단언)를 추가한다. (발견: /ship maintainability v0.2.51.0, 2026-06-28)

### proxy-matcher.ts EXCLUDED_SEGMENTS — 정규식 `.` 미이스케이프 (P2)
`'llms.txt'`·`'llms-full.txt'`(및 기존 `'robots.txt'`·`'sitemap.xml'`)를 그대로 negative lookahead 정규식에 합치면 `.`이 임의 문자와 매치된다. 현재 `/llmsXtxt` 같은 라우트가 없어 실 익스플로잇 경로는 없지만, 미래 경로 추가 시 의도치 않은 auth bypass 가능성. `EXCLUDED_SEGMENTS` 문자열에서 `.`을 `\\.`으로 이스케이프하거나 `escapeRegex` 헬퍼를 도입. (발견: /ship adversarial v0.2.51.0, 2026-06-28)

### rel=alternate 자동발견 링크 (P3)
buyer `<head>`에 `<link rel="alternate" type="text/plain" href="/llms.txt">` 추가로 AI 크롤러가 llms.txt를 head에서 자동발견 가능. Next.js `metadata.alternates` API로 추가. (llms.txt 계획 deferred 항목)
