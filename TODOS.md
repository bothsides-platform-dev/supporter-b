# TODOS

## Biz Profile / NTS (사업자번호 조회)

### 미검증 사업자번호 백필 cron 미구현 (P1)
국세청 장애로 미검증 통과한 가입건(`biz_profiles.tax_type IS NULL` + `biz_no` non-null)은 **장애가 끝나도, 관리자 승인 뒤에도 영원히 미검증으로 남는다** — 지금은 수동 확인 외에 채울 경로가 없다. `app/api/cron/backfill-biz-profiles/` 를 기존 3개 cron 의 인증 패턴(상수시간·헤더 전용)으로 추가해 배치 재조회하고, 폐업/휴업 판명 시 `risk_flags` severity 를 `critical` 로 승격할 것. 배치 크기·주기는 leaky-bucket 10 req/s(쓰기 예약분 3 포함) 안에 들도록 보수적으로. 저하 모드 계획의 Phase 5 로 의도적으로 연기한 항목. (발견: 저하 모드 계획 2026-07-29, v0.4.29.0)

### 설정 사업자번호 변경에 admin 권한 체크 없음 (P2)
`updateWorkspaceBizProfileAction` 은 `requireBuyerActor()` 만 통과하면 되고 role 을 보지 않는다 — 구매사 워크스페이스의 **일반 멤버도** 등록 사업자번호를 바꾸고 `workspace.biz_profile_id` 를 재지정할 수 있다. v0.4.29.0 에서 서버측 NTS 재판정을 붙여 "아무 번호나" 는 막혔지만(실재하고 정상영업 중인 번호여야 함), 승인 끝난 워크스페이스를 타사 사업자번호로 바꿔치기하는 것 자체는 여전히 admin 이 아니어도 가능하다. 워크스페이스 멤버 관리와 같은 admin 게이트가 필요. 선존재 결함. (발견: /ship security 전문가 리뷰 2026-07-29, v0.4.29.0)

### 저하 코드 목록이 클라·서버 두 곳에 따로 있음 (P3)
"어떤 NTS 실패를 저하로 볼 것인가" 가 두 모양으로 중복된다: `components/rfp/nts-lookup.ts` 의 `DEGRADED_CODES` 는 닫힌 allowlist 이고, `_resolveBizProfile.ts` 는 `NTS_LOCAL_THROTTLED` 만 빼고 전부 저하시키는 blanket catch 다. 새 `NtsErrorCode` 를 추가하면 클라는 막고 서버는 통과시키는 방향으로 **기본값이 어긋난다**. `isDegradableNtsCode(code)` 를 `lib/integrations/nts.ts` 에 단일 출처로 두고 양쪽이 소비 + 모든 코드가 명시 분류됐는지 드리프트 가드 테스트. (발견: /ship maintainability 전문가 리뷰 2026-07-29, v0.4.29.0)

### 사업자번호 조회 결과 단기 캐시 없음 (P4)
화면에서 조회 → 제출 시 서버가 같은 번호를 다시 조회하므로, 완주 1건당 국세청 호출이 2회다(가입 buyer/PG·`/workspace/new`·설정 4경로 공통). 재조회는 신뢰 경계라 **없애면 안 되고**, 30~60초 TTL 인메모리 캐시(정규화 bizNo 키, 크기 상한)를 `getNtsClient().lookup` 앞에 두면 경계를 유지한 채 상위 호출과 제출 지연을 반으로 줄인다. (발견: /ship performance 전문가 리뷰 2026-07-29, v0.4.29.0)

### `createWorkspaceAction` 이 사업자번호 오류를 INVALID_INPUT 으로 뭉갬 (P4)
가입 경로는 `BIZ_NOT_FOUND`/`BIZ_STATUS_NOT_ACTIVE`/`BIZ_UNSUPPORTED_TYPE`/`BIZ_LOOKUP_RATE_LIMITED` 를 구분해 돌려주는데, `/workspace/new` 는 넷 다 `INVALID_INPUT` 으로 접어서 "이름이 잘못됐다" 와 구분되지 않는다. `CreateWorkspaceResult` 의 error 유니온을 넓히고 리졸버 배선을 공용 헬퍼로 뽑을 것(가입 액션과 8줄 중복). (발견: /ship maintainability 전문가 리뷰 2026-07-29, v0.4.29.0)

### 가입 화면에 신규 사업자번호 오류코드 문구 매핑 없음 (P4)
`signupCompleteAction` 이 돌려주는 `BIZ_*` 4종이 `app/(public)/signup/buyer/profile/page.tsx` 의 라벨 맵에 없어 전부 "가입을 완료하지 못했어요"로 낙하한다(회귀는 아님 — 예전엔 전부 `INVALID_INPUT` 이라 같은 문구였다). 새로 도달 가능해진 막다른 길: 워크스페이스 단계에서 장애로 저하 통과 → 장애 복구 → 마지막 단계 서버 재조회에서 미등록/폐업 판정 → 두 단계 앞의 사업자번호를 고칠 방법 없이 generic 오류. (발견: /ship 계획 완료 감사 2026-07-29, v0.4.29.0)

## Notifications

### 알림 환경설정 미구현 — 이메일 수신 거부 불가 (P2)
`/settings/notifications` 는 "들어갈 예정입니다" 스텁이고, 발송 경로(`notify()`)에 사용자 선호도 체크가 전혀 없다 — 모든 이메일이 무조건 발송되며 수신 거부 수단이 없다. 타입/채널별 수신 토글 스키마 + `notify()` enforcement + 설정 UI 가 필요. (발견: 알림 시스템 전수 조사 2026-07-07, v0.2.75.1)

### 승인/거절 알림 미배선 (P3)
`workspace.approved/rejected`, `rfp.sent`, `membership.approved/rejected` 템플릿·outbox enum은 존재하지만 어디서도 발송하지 않는다. 승인 액션 자체는 admin 별도 레포(`admin-supporter-b`) 소관이라 발송 지점을 어느 레포에 둘지 경계 결정 필요. 관련: master/ops 멤버십 row를 admin 레포가 직접 insert하면서 `approval_status`를 명시적으로 non-approved로 쓰는 곳이 없는지 1줄 확인 필요(있다면 v0.2.75.1의 approved 필터로 master가 조용히 수신 중단됨). (발견: 알림 시스템 전수 조사 + /ship 적대 리뷰 2026-07-07)

### 알림 소소한 정합성 묶음 (P4)
① 알림 페이지 RSC는 100건, 훅 스토어(`useNotifications`)는 API 50건 하이드레이트 — 51~100번째 항목에서 배지/읽음 처리 불일치 가능. ② 인앱 알림 row는 `pending→read`만 전이하는데 렌더러(`NotificationActivityList`)와 `unreadCount`에 도달 불가능한 `sent`/`failed` 분기(빨간색 미읽음 렌더 포함)가 남아 있음. ③ 알림 `type`이 free-form text로 SSOT enum이 없고 렌더러에 타입별 라벨/아이콘 매핑도 없음. ④ `retryEmail`은 서비스·액션·훅·테스트 완비 + requeue/화이트리스트 결함도 해소(v0.4.20.x)됐지만 여전히 UI 호출 지점 0인 데드코드 — 배선 여부는 별도 결정(2026-07-07 보류). (발견: 알림 시스템 전수 조사 2026-07-07)

## Deal Room / Award

### 선정 후 구매사 담당자(createdBy) 탈퇴 시 승자 PG가 빈 딜룸 (P3)
선정 연락처 교환(`CounterpartyContactCard`)은 `findContactById`가 fail-closed라, 구매사 담당자(RFP `createdBy`)가 탈퇴/시스템계정이면 `buyerContact=null`이 된다. 승자 PG 분기는 `awardedToMe && buyerContact`로 카드를, `awarded && !awardedToMe`로 미선정 안내를 그리므로 — 승자인데 buyerContact만 null이면 카드도 안내도 안 떠 빈 화면이 된다(드묾·누출 아님·정상 fail-closed). 후속: 연락처 없음 안내 폴백 또는 워크스페이스 대표 담당자 폴백 검토. (발견: /ship 적대 리뷰 2026-06-27)

## Settings / Account

### ~~계정 탈퇴 Enter 제출 경로 무커버리지 (P3)~~ — 해결 (v0.4.23.0)
`DeleteAccountSection.tsx` 의 Enter 제출 경로에 테스트를 추가했다: 정상 Enter 제출, 빈 비밀번호 Enter 무제출, submitting 중 Enter 재진입 무중복. 커버리지를 붙이면서 빈 비밀번호 Enter 가 버튼 disabled 를 우회해 제출되던 실제 결함도 드러나 `handleSubmit` 초입에 `!password` 가드를 추가했다(버튼은 이미 막혀 있었지만 Enter 는 버튼을 안 거친다). (발견: /ship 적대 리뷰 2026-07-22, v0.4.9.1 · 해결 v0.4.23.0)

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

## Design

### ~~초대 수락 화면이 하드코딩 목업 + 거절 버튼 무동작 (P3)~~ — 해결 (v0.4.24.0, 삭제)
`app/(public)/invite/page.tsx` 를 배선하는 대신 **삭제**했다. 조사 결과 이 bare `/invite` 는 **어디서도 링크되지 않는 고아 라우트**였다 — 실 초대는 전부 `/invite/rfp/[token]`·`/invite/workspace/[token]` 로 가고(이메일 템플릿·서비스 레이어에 bare `/invite` 링크 0건), 목업이 읽던 `?token=` 을 생성하는 코드도 없었다. 토큰 없이는 바인딩할 실데이터 자체가 없으므로 배선은 성립하지 않는 선택지였다. 거절 액션도 실 워크스페이스 초대 플로우에 애초에 없는 기능이라(초대는 무시하면 되고 철회는 초대자 쪽에서 한다), 무동작 버튼이 가리고 있던 미구현 기능은 없다.

**주의 — `lib/auth/route-decision.ts` 의 `/invite` 는 지우면 안 된다.** 그것은 bare 페이지용 등록이 아니라 `PUBLIC_PREFIXES` 의 **서브트리 프리픽스**이고, 실 초대 경로 두 개가 여기에 의존한다 — 빼면 비인증 방문자의 워크스페이스 초대 링크가 `/login?next=...` 로 튕긴다. 같은 이유로 `app/(public)/invite/layout.tsx` 도 남겼다: 하위 두 페이지가 자기 metadata 를 선언하지 않아 그 레이아웃이 **토큰 URL 의 유일한 noindex 출처**다(파일에 주석으로 명시). (발견: /ship 적대 리뷰 F14, 2026-07-22, v0.4.11.0 · 해결 v0.4.24.0)

### ~~3차 텍스트 톤 소멸에 따른 위계 재설계 — 육안 확인 필요 (P3)~~ — 해결 (v0.4.25.0, ①은 원인 이관)
세 후보의 처리가 갈렸다.

- **② 업로드 지시문 / 용량 힌트 (`BidStepProposal.tsx`·`RfpAttachmentDropzone.tsx`) — 고침.** 지시문을 `md-label-large` + `on-surface` 로 승격해 13px/주톤 위 11px/보조톤의 2축 단차를 만들었다. `md-label-large` 를 고른 근거는 크기 확보가 아니라 역할이다 — 두 요소 모두 실제 컨트롤(`<button>` / `role="button"`)의 라벨이고 DESIGN.md §3 이 Label Large 를 "버튼·nav·Chip"에 배정한다. 톤은 2단으로 유지했으므로 `WizardStepSidebar`·`PgProcessStepRail` 선례와 같은 문법이다. 두 파일 모두 "두 단이 같은 표기로 다시 붙으면 실패"하는 회귀 테스트로 잠갔다.
- **③ `ProblemCard.tsx` 장식 숫자 — 고침.** `clamp(28px,4vw,44px)` → `clamp(18px,2vw,24px)`. 모든 뷰포트에서 자기 `h3`(`clamp(20px,2.8vw,30px)`)보다 작도록 잡았다(18<20 · 2vw<2.8vw · 24<30, 교차 없음). TODO 가 열어 둔 opacity 선택지는 **반려**했다 — DESIGN.md §12 가 `opacity-38` 을 disabled 전용으로 잡아 두어 같은 화면에서 반투명이 두 의미를 갖게 되고, 더 구조적으로는 대비 가드(`lib/design/__tests__/text-contrast.test.ts`)가 `tokens.css` 의 hex 를 읽어 비율을 계산하므로 합성색을 볼 수 없다. §2 가 색으로 만들기를 거부한 sub-AA 톤을, 하필 가드가 눈먼 지점에 만드는 셈이다. §2 의 처방("색이 아니라 타입스케일")이 곧 크기 축소다.
- **① `CostComparisonChart.tsx:22/25` — 위계 문제가 아니었다.** 원인은 아래 "랜딩 `text-[var(--text-*)]`" 실버그이고, 그 항목으로 이관한다. 두 줄은 지금 조상 크기(14px)를 상속하고 색 토큰까지 덮여 있어 "같은 색·크기·서체"로 보였을 뿐이다. 애초에 둘은 같은 baseline 행의 좌측 차트 제목 / 우측 단위 주석이라 **동급이 맞다** — 위계를 세울 쌍이 아니라 공간 분리가 구분을 지는 쌍이다.

(발견: /ship design 리뷰 2026-07-22, v0.4.11.0 · 해결 v0.4.25.0)

<details><summary>원문</summary>

v0.4.12.0 이 `outline` 을 텍스트에서 걷어내면서 텍스트 색이 2단(`on-surface`/`on-surface-variant`)으로 줄었다(같은 릴리스에서 라이트 `on-surface-variant` 를 `#5F646D` 로 어둡게 조정해 대비 자체는 전 표면 계층에서 AA 를 넘겼다 — 남은 것은 위계 문제다). AA 를 통과하면서 `on-surface-variant` 보다 옅은 색은 만들 수 없으므로(상한 L≤0.175 vs 실제 L=0.161) 그 아래 위계는 타입스케일로 만들어야 하는데, 스윕은 색만 올렸고 크기·굵기는 손대지 않았다. 명시적으로 접은 두 곳(`WizardStepSidebar` 라벨·`PgProcessStepRail` 제목 — 배지·도트가 상태를 대신 진다) 외에 리뷰가 지목한 잔여 후보: ① `components/landing/CostComparisonChart.tsx:25` 이어브로우와 단위 라벨이 같은 색·크기·서체가 됨, ② `BidStepProposal.tsx:57`·`RfpAttachmentDropzone.tsx:160` 의 "업로드 지시문 / 용량 힌트" 두 단이 한 톤으로 붙음, ③ `ProblemCard.tsx:13` 의 clamp(28–44px) 장식 숫자가 워터마크에서 읽히는 2차 요소로 바뀜(대형 텍스트라 AA 기준은 3:1 이므로 opacity 로 되돌릴 여지 있음). 전부 신뢰도 3–4 의 육안 판단 건이라 `/design-review` 로 실제 화면을 보고 결정한다. (발견: /ship design 리뷰 2026-07-22, v0.4.11.0)

</details>

### 랜딩 `text-[var(--text-*)]` 36곳이 폰트 크기를 적용하지 않고 색 토큰까지 덮는다 (P2)
`components/landing/**` 36곳이 폰트 크기를 `text-[var(--text-2xs)]` 형태로 쓴다. 두 겹으로 깨져 있다.

① **Tailwind v4 는 `text-[var(--x)]` 의 타입을 추론하지 못하고 무조건 `color:` 로 컴파일한다.** 빌드 산출물로 확인했다 — `.text-\[var\(--text-2xs\)\] { color: var(--text-2xs); }` (named `text-sm` 은 정상적으로 `font-size:` 를 낸다). 즉 36곳 전부 **폰트 크기가 한 번도 적용된 적이 없고** 조상 크기(body 14px)를 상속한다. ② **`--text-2xs`·`--text-md` 는 정의 자체가 없다** — `styles/tokens.css`·`app/globals.css`·Tailwind 기본 테마 어디에도 없다. `--text-xs/-sm/-base` 는 Tailwind 기본값으로 존재해 `color: 0.875rem` 같은 선언이 된다. 어느 쪽이든 computed-value 시점에 무효라 `color` 가 상속으로 떨어지고, 생성된 `.text-[var(--text-*)]` 규칙이 같은 레이어에서 `.text-[var(--md-sys-color-*)]` 보다 **뒤에** 와서 **의도한 색 토큰까지 조용히 덮는다.**

원인은 토큰 삭제 고아다: `3108b3a3`("Korean Editorial Modernism 토큰 → MD3 교체", 2026-05-10)가 구 스케일(`--text-2xs:0.625rem` … `--text-md:0.875rem`)을 지웠는데 사용처가 남았다.

**실제 대비 결함 3건**: `LandingNav.tsx:76` 헤더 CTA 의 `on-primary` 흰색이 덮여 파란 버튼 위 어두운 글자 · `CustomerTypesGrid.tsx:24`, `PgLanding.tsx:117` 의 primary 블루 강조 숫자가 본문 색으로 렌더.

**수정 방침 (사용자 결정, 2026-07-26): 크기 변화 없이 간다.** 36곳을 현재 렌더 크기와 같은 `text-sm`(14px)으로 고정해 무효 유틸리티와 색 클로버만 고친다 — 시각 델타는 색 복구뿐. 구 스케일(10/12/14px 3단) 복원은 별건으로 분리하고 `/design-review` 시각 승인을 받는다. **`--text-xs/-sm/-base` 를 `@theme` 에서 재정의하면 안 된다** — 그 세 이름은 Tailwind 기본값(12/14/16px)이고 앱 면 29곳(랜딩엔 0곳)이 named 유틸리티로 그 값에 의존한다.

**동반 가드**: `text-[var(--x)]` 의 var 가 색 토큰(`--md-sys-color-*`)이 아니면 실패하는 드리프트 가드를 `lib/design/__tests__/` 에 추가한다(`_source-scan.ts` 재사용, 접두어 SSOT 는 `design-hardrule-allowlist.mjs`). 주의 둘: 정식 표기 `text-[length:var(--md-typescale-*)]`(앱 20+곳)를 잡으면 안 되고, 클래스 리터럴은 반드시 `__tests__/` 안에만 둔다(`app/globals.css:12` 의 `@source not` 제외 대상 — 밖에 두면 Tailwind 스캐너가 읽어 `next dev` 가 500 으로 죽는다, `build` 는 exit 0 이라 CI 로 못 잡는다). 더 센 가드로 "className 안의 모든 `var(--x)` 가 정의돼 있는지" 검사하는 고아-변수 가드도 가능하다(전 레포 미정의 이름 14개뿐). 다만 착지 전 부수 수정 3건이 필요하다 — `--md-sys-color-surface-variant`(존재한 적 없는 토큰; `app/(public)/signup/pg/page.tsx:132`·`.../workspace/PgWorkspaceStep.tsx:95` 의 안내 박스에 배경이 없고 hover 가 죽어 있다), `components/ui/sidebar.tsx:484` 의 shadcn v3 잔재 `hsl(var(--sidebar-border))`, 그리고 인라인 `style` 로 주입되는 `--sidebar-width`/`--sidebar-width-icon` allowlist.

(발견: Design TODO 조사 2026-07-26 — 위 항목 ① 의 실제 원인)

### ~~인앱 테마 토글이 브라우저 크롬 색을 안 따라감 (P3)~~ — 해결 (v0.4.26.0)
`lib/theme/chrome-color.ts` 의 `syncChromeColor` 를 테마 스토어의 단일 초크포인트 `applyTheme`(`lib/stores/theme.ts`)과 `app/layout.tsx` 의 FOUC 방지 인라인 스크립트 두 곳에서 호출한다. 스토어 쪽 한 지점으로 명시 set·`system` resolve·`matchMedia change`·rehydrate 네 갈래가 전부 덮이고, 인라인 스크립트가 하이드레이션 전 구간을 맡는다.

**media 없는 태그 하나를 head 맨 앞에 만들어 소유한다.** HTML 은 "tree order 상 `media` 가 매치되는 **첫** theme-color 태그"를 쓰므로, 항상 매치되는 태그를 맨 앞에 두면 Next 의 media 스코프 태그 두 개를 늘 이긴다. 그 둘은 손대지 않고 JS 이전 첫 페인트·무JS 환경의 OS 기준 폴백으로 남는다.

**처음 구현은 Next 의 두 태그를 직접 덮어썼고, e2e 가 그것을 잡았다.** 하이드레이션에서 React 가 서버 렌더 값과 달라진 태그를 매칭하지 못해 같은 name 의 태그를 하나 더 끼워 넣는다 — 실측으로 theme-color 가 3개(우리가 덮은 light/dark + React 가 되살린 스테일 light)가 됐다. React 가 소유한 노드를 건드리지 않는 것이 교훈이고, `e2e/theme-persistence.spec.ts` 의 "하이드레이션 후에도 크롬 색이 인앱 테마를 유지한다" 가 이 회귀를 잠근다. 유닛 테스트만으로는 절대 잡히지 않았을 종류다.

**뷰 트랜지션은 훅하지 않았다.** `applyTheme` 안(t=0)에서 갱신한다. `transition.finished` 를 훅하면 크롬 갱신 경로가 둘로 갈리고, 폴백 3개(`startViewTransition` 부재·reduced-motion·`inFlight` 재진입)에 각각 호출을 달아야 한다. 크롬 색은 애니메이트되지 않으므로 얻는 것도 없다.

**로직이 두 벌인 것은 의도다.** 인라인 스크립트는 번들 이전에 실행돼야 해서 `lib/theme/chrome-color.ts` 를 import 할 수 없다. 값은 양쪽 모두 `CANVAS_COLOR` 를 보간하므로 색 리터럴은 갈리지 않는다.

부수 정리: 캔버스 hex 의 JS 사본을 `lib/theme/canvas-colors.ts` 하나로 모았다(이전엔 `app/layout.tsx`·`app/manifest.ts` 에 흩어져 있었다). `app/__tests__/chrome-colors.test.ts` 가 tokens.css → `CANVAS_COLOR` → viewport/manifest 체인과 "두 파일에 hex 리터럴 없음"을 함께 고정한다. (발견: /ship design 리뷰 2026-07-21 · 해결 v0.4.26.0)

<details><summary>원문</summary>

`app/layout.tsx` 의 `viewport.themeColor` 는 `prefers-color-scheme`(OS 설정)으로만 분기하는 정적 선언이라, 사용자가 인앱 테마 토글로 OS 와 다른 테마를 고르면 캔버스는 다크인데 모바일 상태바는 라이트(또는 반대)로 남는다. 값 자체는 캔버스 토큰과 일치하며(`app/__tests__/chrome-colors.test.ts` 가 고정), DESIGN.md §2 에 범위 한정 문구로 명문화해 둔 상태 — 기능 결함이 아니라 미구현 축이다. 닫는 법: 테마 스토어가 클래스를 토글할 때 `<meta name="theme-color">` 의 content 도 함께 갱신해 크롬이 실효 캔버스를 따라가게 한다. (발견: /ship design 리뷰 2026-07-21)

</details>

### ~~AnimatedBrandMark 진입 애니메이션 — DESIGN.md 예외 미문서화 (P4)~~ — 해결 (v0.4.25.0, 문서만)
이 항목이 열려 있는 동안 문서는 이미 따라잡혀 있었다. DESIGN.md §9 에 세 번째 예외 `> **예외 — 브랜드 마크 진입 (Brand Mark Entrance).**` 이 4조건(하드 로드 1회 · reduced-motion 정적 렌더 · `pathLength`/`fillOpacity` 만 구동 · 브랜드 컬러 단일)과 함께 명문화돼 있고, §9 의 하드룰 문장·닫는 문장과 §6 "로딩 모션", CLAUDE.md 의 Motion 항목이 모두 네 예외를 같은 순서로 열거한다. 4조건은 전부 `components/primitives/__tests__/AnimatedBrandMark.test.tsx` 10 테스트(SSOT 경로 · aria-hidden · reduced-motion 정적 렌더 · 엘리먼트 타입 무교체 · `pathLength` 0→1 · 타이밍 · 순수 `<path>` 정착 · dash 시작점 · `DRAW_PATH`↔`BRAND_MARK_PATH` 기하 동일성)가 잠근다.

이번에 실제로 고친 것은 **미문서화 마운트 지점 하나**다: `SidebarBrand` 는 랜딩 데모 셸(`components/landing/demo-app/DemoSidebar.tsx`)도 마운트하는데 §9 구현 노트에 없었다. 랜딩 면이지만 이 컴포넌트는 §9 "랜딩·마케팅 모션"의 reduced-motion 면제를 **취하지 않는다**는 사실도 함께 적었다(나중에 "최적화"로 그 가드가 지워지는 것을 막기 위해).

**CLAUDE.md↔DESIGN.md 예외목록 드리프트 가드는 의도적으로 두지 않는다(YAGNI).** 이 항목이 스테일로 남아 막았을 실패는 *TODO 한 줄*이지 출하된 결함이 아니다. 문서 텍스트 테스트는 churn 대비 신호가 가장 낮아 — 한국어 문장을 다듬을 때마다 빨개지면 매처를 무의미해질 때까지 느슨하게 만드는 훈련이 된다. 기존 가드들(`mono-label-drift`·`outline-text-drift`·`text-contrast`)이 값을 하는 이유는 전부 **소스**를 걸으며 사람이 눈으로 검증할 수 없는 사실을 단언하기 때문이다. "네 예외" 개수 불일치는 10초면 눈에 띈다. (발견: /ship 문서 동기화 점검, dev→main 릴리스 컷 2026-07-17 · 해결 v0.4.25.0)

### ~~한글 본문이 단어 중간에서 줄바꿈된다 — `word-break: keep-all` 부재 (P2)~~ — 해결

`app/globals.css` 의 `body` 에 `word-break: keep-all` + `overflow-wrap: break-word` 를 걸고 DESIGN.md §3 에 "줄바꿈" 절로 규칙을 박았다. 짝인 `overflow-wrap` 이 없으면 공백 없는 긴 토큰(URL·이메일·`tmpl_…` 외부 ID)이 좁은 칸을 밀어낸다. **`anywhere` 가 아니라 `break-word`** 인 이유는 `anywhere` 가 flex 아이템의 min-content 폭까지 바꿔 기존 레이아웃을 흔들기 때문. 국소 해제는 Tailwind `break-normal` 한 클래스.

CSS 라 유닛 테스트로 못 잡는다 — 검증은 브라우저 시각 스윕(좁은 컨테이너 위주: 사이드바 nav·칩·칸반 카드·딜룸 레일·알림 목록·비교표 헤더·토스트·모바일 폭·랜딩 히어로)으로 했다. (발견: /qa dev→main 릴리스 워크 2026-07-26 · 해결: 템플릿 두 화면 디자인 통일 패스)

## SEO / Branding

### 브랜드명 리터럴 하드코딩 — SSOT 미참조 (P3)
`서포트 B`→`서포트비` 전환(v0.2.78.0) 과정에서 확인됨: 이메일/SMS 제목 템플릿 11개 파일(`lib/server/services/{rfp,bid,chat,team-chat,auth,workspace}.ts`, `lib/server/outbox/{chat-digest-flush,team-chat-digest-flush}.ts`, `lib/server/outbox/templates/_layout.tsx`, `lib/server/actions/auth/sendPhoneOtpAction.ts`, `lib/server/notifications/admin-signup.ts`)와 `scripts/generate-og-image.ts`가 브랜드명을 SSOT 참조 없이 리터럴로 하드코딩한다(SSOT 는 `siteConfig.name` 하나 — v0.4.3.0 에서 `PRODUCT_NAME` 이 거기서 파생하도록 정리됐다). 이번 리네임에서 12개 파일을 find/replace로 손대야 했던 것이 비용 증거. 후속: 공유 상수를 각 subject 템플릿에 interpolate하도록 리팩터(별도 PR — 템플릿 로직 변경이라 문구 교체보다 범위가 큼). (발견: /ship maintainability+adversarial 리뷰 2026-07-07, 브랜드 전환 PR — 두 리뷰어가 독립적으로 동일 패턴 지적)

## Landing

### 푸터 링크 5개가 `href="#"` — 그중 하나가 법적 고지 (P2)
`components/shell/Footer.tsx` 의 서비스 소개(34)·이용 방법(35)·요금 안내(36)·전자금융거래 약관(54)·공지사항(71) 이 전부 `href="#"` 라 클릭하면 페이지 최상단으로 점프할 뿐 아무 일도 없다. 법적 고지 3개 중 이용약관·개인정보 처리방침은 실제 Notion 문서로 연결되는데 **전자금융거래 약관만 죽어 있다** — 결제 플랫폼이라 이 항목부터 실제 URL 이 필요하다.

**목적지를 추측해서 채우면 안 된다.** 요금 안내는 랜딩에 `#pricing` 앵커가 있지만 푸터는 `/login` 등 앵커가 없는 면에도 렌더되므로, 거기로 걸면 죽은 링크가 깨진 링크로 바뀔 뿐이다. 실제 URL 을 받거나, 문서가 생길 때까지 해당 항목을 내리는 쪽으로 결정할 것. (발견: /qa dev→main 릴리스 워크 2026-07-26)

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

### 이메일 인증 성공 순간 라이브 리전이 통째로 언마운트 + 포커스 유실 (P3)
`EmailVerifySection` 은 성공 시 `if (verified) return <Chip label="✓ 이메일 인증 완료" />` 로 폼 서브트리 전체를 갈아끼운다 — 그 안에 있던 `role="status"` 라이브 리전도 같은 커밋에서 사라지므로 성공은 끝내 소리로 전해지지 않고, 사용자의 포커스는 방금 타이핑하던 입력칸과 함께 `<body>` 로 떨어진다. 자동 제출(v0.4.28.0)로 버튼 클릭이 사라지면서 되돌아갈 포커스 대상도 없어졌다. 4초 폴링(다른 탭 링크 인증 감지)이 타이핑 도중 `verified` 를 뒤집는 경로도 같은 증상이다. `PhoneVerificationField` 의 `setStep('verified')` → '인증 완료 ✓' 도 평범한 `<span>` 이라 동일. 고치려면 성공 노드를 유지되는 라이브 리전 안에 렌더하고 전환 시 포커스를 옮겨야 하는데, 두 컴포넌트의 성공 상태 구조를 함께 손봐야 한다. jsdom 은 언마운트 시 포커스 이동도 라이브 리전 낭독도 모델링하지 않아 유닛으로는 잡히지 않는다. (발견: /ship 적대 리뷰 2026-07-28, v0.4.28.0)

### PG 가입 BizLookupField blockedStatuses 누락 (P3)
PG 가입 플로우도 `BizLookupField` 를 사용하며 현재 `blockedStatuses` 가 없다. PG 도메인에서도 폐업·휴업 사업자를 차단해야 하는지 정책 결정 후 `blockedStatuses={['closed', 'suspended']}` 추가. 구매사 가입·설정 두 경로는 v0.4.9.0 에서 닫혔고, 차단 문구는 두 문맥이 공유하도록 '가입할 수 없어요'→'사용할 수 없어요' 로 중립화됐다. (발견: v0.2.27.2 adversarial 2026-06-20, P3 — 정책 미확정)

## Workspace / Members

### 워크스페이스 정렬 변경이 chat.ts/shell-access.ts의 순서 의존 로직에 준 부수효과 (P4)
사이드바 워크스페이스 스위처 드랍다운을 PG우선+이름순으로 정렬하려고 `WorkspaceRepo.listForUser`/`listAllWorkspacesForMaster`의 `ORDER BY`를 리포지토리 레이어에서 바꿨다(v0.4.28.2). 이 두 메서드 결과가 표시 목적 외에도 쓰이는 곳이 있다: ① `chat.ts`의 `counterpartyEmail`로 채팅을 시작하는 경로가 `memberships.find(m => m.type === wantType)`로 첫 매칭 워크스페이스를 고르는데, 동일 타입 멤버십이 여러 개인 유저는 이제 가입순 대신 이름순으로 뽑힌다. ② `shell-access.ts`의 `workspaces.find(...) ?? workspaces[0]` fallback(세션의 workspaceId가 현재 멤버십 목록에 없는 드문 경우)도 동일하게 영향받는다. 두 경우 모두 동일 타입 멤버십이 여러 개인 유저에게만 해당하는 좁은 엣지 케이스라 리스크를 감수하고 그대로 배포하기로 결정(/ship 적대 리뷰에서 발견, 사용자 확인 후 수용). 후속: 필요해지면 정렬을 리포지토리 레이어 대신 WorkspaceSwitcher 클라이언트 쪽으로 옮겨 두 소비처의 원래 순서 의미를 보존. (발견: /ship 적대 리뷰 2026-07-29)

### 미승인 PG 멤버의 인라인-게이트 API 라우트 잔여 노출 (P4)
승인 게이트(2026-07-24, `isPgMembershipBlocked` — `requirePgSession` + `requireActiveWorkspace` 이중 배선으로 PG 전용 표면과 채팅·보드·계약 라이프사이클 등 양측 공용 액션까지 차단)가 닫고 남은 표면: `auth()`+3층 인라인 게이트를 직접 쓰는 공유 라우트(`app/api/files/presign`·`files/[id]/complete`, `centrifugo/connection-token`)와 세션 없는 server-to-server `centrifugo/subscribe`(멤버십 row 기준)는 `approval_status` 를 읽지 않는다. 실행 가능한 동작은 첨부 presign·WS 연결/구독 정도로 실익이 낮고(상태 변경 액션은 전부 게이트됨), connection-token 은 route-local TTL 캐시와의 staleness 트레이드오프가 있어 별도 판단 필요. (발견: 서버 데이터 경계 구현 중 2026-07-24 — 원 P2 항목의 잔여 분리, red-team 리뷰로 requireActiveWorkspace 갭 소급 종결)

## Storage / R2

### R2 고아 객체 sweeper (P3)
`scripts/sweep-r2-orphans.ts` — ListObjectsV2(prefix `attachments/`) → `attachmentRepo.findExistingIds` 배치 대사 → row 없는 키 중 LastModified 24h 초과만 DeleteObjects. `--dry-run` 지원, PM2 cron(일 1회) 등록. 고아 발생 경로: RFP 삭제 cascade(`rfpRepo.deleteById`, `_purgeUnverifiedSignup`) + sweep-uploads 의 객체 삭제 실패 잔존분. bid_note 삭제는 bid.ts가 storage.delete() 명시 호출로 이미 커버. **주의**: 이 sweeper는 "row 없는 객체" 방향만 정리한다. 반대 방향 중 **pending row(업로드 미완료)는 presigned 전환으로 `/api/cron/sweep-uploads` 가 이미 커버** — 남는 미커버는 "ready row인데 객체가 없는" 희귀 케이스(현재 R2 presigned URL 이 NoSuchKey 를 반환)뿐. (발견: /ship adversarial 리뷰 2026-07-05, presigned 전환 반영 2026-07-05)

## 견적 확장 (current_terms)

### 오픈보드 공개 범위 제품 검토 — 특히 customPaymentMethodLabels (P2)
문서가 오랫동안 "구매사명·제목·홈페이지만"이라 서술해 온 탓에 가려져 있었지만, 오픈보드는 실제로 9필드를 공개해 왔다(코드·가드 테스트는 처음부터 일관, 산문만 스테일 — v0.4.3.0 에서 정정). 추가 6필드는 전부 비경쟁 정보라는 판단이지만 **`customPaymentMethodLabels` 는 구매사가 직접 입력한 자유 텍스트가 비초대 PG 전원에게 브로드캐스트되는 유일한 필드**다. 구매사가 거기에 내부 명칭·거래처명 같은 걸 적을 수 있어 노출 적절성은 코드 문제가 아니라 제품 결정이다. 검토 축: ① 그대로 공개, ② 게시판에서만 제거(초대 PG 에겐 유지), ③ 입력 시 공개 사실을 고지. (발견: /ship 적대적 리뷰 2026-07-21)

### ~~요청조건 뷰 솔루션 표기 무테스트 (P3)~~ — 해결 (v0.4.23.0)
`components/rfp/RequestConditionsView.tsx` 전용 테스트(`__tests__/RequestConditionsView.test.tsx`)를 추가해 `formatSolution` 상세 접미사 분기(`self`/`other` + 상세 → 괄호 병기)와 렌더 경로를 커버했다: 상세 있음/없음, 솔루션사 선택 시 접미사 미부착, 어휘 밖 값 fail-open, 운영 필드 유무에 따른 섹션·행 생략. (발견: /ship 커버리지 감사 2026-07-21 · 해결 v0.4.23.0)

### ~~SCREEN_DESIGN 이 삭제된 컬럼을 아직 문서화 (P4)~~ — 해결 (v0.4.23.0)
`SCREEN_DESIGN.md` 의 현재 카드 수수료 opt-out 설명을 `current_terms` JSONB + `hidden_from_pg` 저장 구조로 갱신하고, v0.2.26.2 에서 DROP 된 `current_fee_visible_to_pg` 는 앱 계층 파생값(`currentFeeVisibleToPg`)임을 명기했다. (발견: /ship maintainability 리뷰 2026-07-21 · 해결 v0.4.23.0)

### (조건부) hidden_from_pg write-edge 검증 (P3)
현재는 hidden_from_pg 가 hiddenFromPgFromVisibility(수수료 공개여부)로만 채워져 안전. **추후 buyer 가 임의 필드를 숨길 수 있게 되면** write-edge 에서 HIDEABLE_PG_PATHS 검증 추가 필요 — 안 하면 PG_STRIP 핸들러 없는 숨김 경로 fail-open 누출. (선택, doc-edge 채택 시 함께)

### currentTermsFromDiscrete 빈문자열 정규화 (P3)
'' 입력을 문서에 그대로 담음(현재 falsy 라 UI 무해). omit 으로 정규화하면 더 깔끔. (발견: /ship 리뷰 2026-06-18)

## Bid Wizard

### 정산한도 0 차단이 클라이언트 전용 — 서버는 여전히 0 을 받는다 (P2)
v0.4.27.0 이 `isSettleLimitValid`(0 초과)로 견적 위저드와 템플릿 드로어를 막았지만, 게이트는 프론트에만 있다 — `lib/server/actions/bid/submitBidAction.ts:18` 은 `settleLimit: z.number().nonnegative()` 라 0 을 그대로 받는다. 원 커밋의 명시적 결정("프론트 전용, 서버 스키마는 그대로")이며 이번 릴리스에서도 사용자 승인으로 유지했다.

**남은 구멍은 배포 창이다.** 배포 직후 탭을 열어 둔 PG 의 구 번들은 `EMPTY_BID_DRAFT.settleLimit='0'` + 게이트 없는 검증을 그대로 들고 있어 0 을 제출할 수 있고, 서버가 받으면 구매사 비교 화면에 '한도 0원'이 다시 뜬다 — 이 릴리스가 없애려던 바로 그 오독이다. 스크립트·직접 액션 호출도 같은 경로.

**착수 시 범위**: `.nonnegative()` → `.positive()` 한 줄이지만 `settleLimit: 0` 을 쓰는 기존 테스트 6곳(`submitBid.test.ts:135,372,400`·`withdrawBid.test.ts:103`·`scenario-b.test.ts:290`)을 유효값으로 갱신해야 한다. **기존 행은 별개 축이다** — 운영 DB 에 이미 `settle_limit=0` 인 견적이 있으므로 서버 검증만으로는 과거 데이터가 정리되지 않는다(표시 계층 폴백 필요 여부를 함께 판단할 것). (발견: /ship 사전 리뷰, dev→main 릴리스 컷 2026-07-26)

### 비교 화면의 `0원` 표기 폴리시 — 보증보험만 남았다 (P3)
같은 패널 안에서 0 이 세 가지로 읽힌다: 가입비는 `없어요`(PR#432), 월 정산한도는 이제 **0 자체를 못 만들게** 막았고(v0.4.27.0), **보증보험만 `0원` 으로 남았다**. 실측(`/rfp/P-2604-0001` 비교 패널): `월 정산한도 80,000,000원` · `보증보험 0원`.

**정산한도에 쓴 해법(입력 차단)을 보증보험엔 쓸 수 없다** — 보증보험은 필수가 아니고 0 이 정당한 값이라(보험 없음) 막을 게 아니라 **표기**를 정해야 한다. 즉 남은 것은 "보험 없음"을 어떻게 읽히게 할지의 제품 결정이고, 가입비가 이미 `없어요` 로 답한 것과 같은 질문이다. CLAUDE.md 는 확정 결정에 닿는 판단을 QA 패치로 넣지 말고 멈추고 묻게 하므로 여기 남긴다.

원 발견은 직전 릴리스 QA 의 ISSUE-005(`정산한도·보증보험 0원`)였는데 TODOS 에 등재되지 않아 유실될 뻔했다 — 정산한도 절반은 그 사이 해소됐다. (발견: /qa dev→main 릴리스 워크 2026-07-26 · 범위 정정 /qa 릴리스 검증 워크 같은 날)

### deriveAnyFeeFilled 경계값 전용 테스트 부재 (P3)
`components/inbox/bid-wizard/bid-wizard-validation.ts`의 `deriveAnyFeeFilled`(BidWizard.tsx에서 분리된 공용 함수, 튜토리얼 fixture 검증과 공유)에 전용 단위 테스트가 없다 — `fee='0'`(포함돼야 함), `fee='-1'`(제외돼야 함), 공백 문자열(`parseFloat`→NaN, 제외돼야 함), 다중 tier 중 하나만 채워진 경우, 빈 fees/methods 등 경계값이 미검증. (발견: /ship 테스트 스페셜리스트 리뷰, dev→main 릴리스 컷 2026-07-17)

**해소 (v0.4.23.0)**: 스칼라 판정 4개 경계값(v0.4.3.0)에 이어 조합 축도 `__tests__/bid-wizard-validation.test.ts` 가 커버한다 — 빈 fees/methods, 구간제 수단의 단일 구간만 채워진 경우·구간 없는 평키(키 규약 위반=미입력), 선택되지 않은 수단 무시, 비구간 단일 수단, 커스텀 수단(값 유무), 다수 수단 혼재(음수·빈칸 제외)까지 `deriveAnyFeeFilled` 자체 동작을 검증한다.

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
