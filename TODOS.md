# TODOS

## Workspace Logo

### workspaces.has_logo 컬럼 DROP (P3)
워크스페이스 로고가 `logo_updated_at`(캐시 버스트 `?v` + immutable) 단일 컬럼으로 전환됨. `has_logo` 는 더 이상 코드가 읽지/쓰지 않는 dead 컬럼(expand-contract 의 contract 단계 잔여). 배포 안정 확인 후 schema(`lib/db/schema/workspaces.ts`)에서 제거하고 `pnpm db:push` (또는 `ALTER TABLE workspaces DROP COLUMN has_logo;`). 데이터 손실 없음(재계산 불필요 — `logo_updated_at` 가 단일 출처). (도입: 워크스페이스 로고 캐시버스트, 2026-06-21)

## Chat / Realtime

### Presence: document observer-identity exposure in the threat model (P3)
공개 presence(`presence:ws:<V>`, D1)에서 raw `sub.presence()` 페이로드는 co-subscriber의 `user`(userId)+`connInfo.workspaceId`를 노출한다(앱 UI는 owner 필터로 binary online만 보여줘 새지 않지만, raw WS 클라이언트는 "X가 V를 관찰 중"을 열거 가능). 봉인 입찰 데이터(수수료·경쟁사 수)는 무관. 위협 모델 문서에 한 줄 명기. (발견: online-presence M1 whole-branch review 2026-06-21)

### Presence: guard same-workspace self-subscribe before M2 (P2)
누군가 `useWorkspacePresence(ownWorkspaceId)`를 호출하면 `<PresenceClient/>`의 self-broadcast와 같은 채널을 공유해 한쪽 `dispose()`가 다른 쪽 `removeSubscription`을 끊는 footgun. M1 wiring에선 소비처가 counterparty id만 넘겨 도달 불가(2-sided 모델). M2에서 같은-워크스페이스 관찰을 추가하기 전에 `managedSubscribe`/Provider에 공유-구독 가드 추가. (발견: M1 whole-branch review 2026-06-21)

## Auth / Signup

### ~~AuthService unique-violation→EMAIL_TAKEN 매핑 DRY~~ ✅ v0.2.25.1
`mapUniqueViolationToEmailTaken<T>` 헬퍼로 4곳 중복 해소(`completeSignup`·`signupViaInvite`·`joinCanonicalPgWorkspace`·`confirmEmailChange`). `users_email_unique` 컨스트레인트 특정화로 다른 테이블 23505 오진단 방지. user-insert 8필드는 이미 repo `create()` 단일 출처화돼 있어 insert 헬퍼 추출 불필요. 3470 green. (PR refactor+auth-email-taken-dry 2026-06-17)

## Design

## Kanban Board

### ~~보드 카드 이동의 키보드 대체 수단~~ ✅ v0.2.25.1
`BoardDraggableCard` 에 전용 드래그 핸들(GripVertical, `setActivatorNodeRef`) 추가 + `KeyboardSensor` 재도입. 핸들에서 Space/Enter 로 카드를 집고 화살표 키로 이동 — 카드 버튼(Enter-to-open)과 분리돼 충돌 없음. SR 지시문·announcements 도 키보드 방법 안내로 갱신. (PR fix/kanban-keyboard-drag-handle 2026-06-17)

### ~~보드 컬럼/카드 memo 가 현재 미발현 (children 인라인 패턴)~~ ✅ v0.2.25.4
children→data-prop 전환(BoardColumn·BoardDraggableCard), `EMPTY_OVERRIDES` 모듈 상수(useOptimistic 인라인 {} 방지), `columnData` useMemo, `PipelineBoard` useCallback 안정화. 3508 green. **Completed:** v0.2.25.4 (2026-06-17)

### ~~PG 인박스 데이터 조립 중복 + 보드 뷰 2중 페치~~ ✅ v0.2.25.2
`loadPgInboxData(wsId)` 공유 로더(`lib/server/board/pgInbox.ts`) 추출 + `pgInboxDataToRows`·`buildPgPipelineCards` 순수 빌더 분리. `inbox/page.tsx` 가 1회 로드 후 행·보드 양쪽에 공급, `loadPgPipelineBoard(wsId, prefetched?)` 진입점 추가로 보드 뷰 3-쿼리 2중 실행 제거. 기존 미테스트 `received→bidId 생략` 규칙도 신규 pgInbox.test.ts(13 케이스)로 커버. 2868 green.

### ~~종결 컬럼 정렬을 전이 시각 기준으로~~ ✅ v0.2.24.2
rfp.updatedAt 기준 내림차순 정렬 적용(buyer awarded/closed, PG won/lost). transition() 에서 updated_at 갱신 누락도 함께 수정. (PR fix+design-todos-p3 2026-06-17)

### ~~findByPgWs ORDER BY round 누락 — 재요청 시 Map 덮어쓰기 비결정적~~ ✅ v0.2.25.3
`findByPgWs` 에 `ORDER BY round ASC` 추가 + `pgInbox.ts`·`loadDashboard.ts` 의 `bidByRfp` Map 조립에 명시적 `max-round` 가드 추가. 정렬·소비 양쪽에서 항상 최신 라운드가 보존됨. 3493 green. **Completed:** v0.2.25.3 (2026-06-17)

### ~~rfp_bids 보드 죽은 표면 정리~~ ✅ v0.2.25.5
`BidCard` 컴포넌트, `CardType 'bid'`, `ColumnKind 'rfp_bids'`, `BidRepo.setBoardColumn`, 관련 시드·테스트 전면 제거. **Completed:** v0.2.25.5 (2026-06-17)

## Signup / Auth

### signupCompleteAction 서버 사이드 bizProfile.status 검증 (P2)
현재 `signupCompleteAction` 은 클라이언트가 보낸 `bizProfile.status` 를 그대로 신뢰한다. 클라 게이트(`BizLookupField blockedStatuses`)는 UX 보호이며, 수정된 클라이언트라면 `closed`/`suspended` 상태를 `active` 로 바꿔 보낼 수 있다. 완전한 서버 권위 검증을 위해서는 액션 내부에서 NTS 재조회 또는 zod `.refine(p => p.status === 'active')` 추가가 필요하다. (발견: v0.2.27.2 adversarial 2026-06-20, 명시적 후속 유예)

### 설정 페이지 WorkspaceBizNoForm blockedStatuses 누락 (P2)
워크스페이스 설정의 사업자번호 변경 폼(`WorkspaceBizNoForm.tsx`)이 `BizLookupField` 를 `blockedStatuses` 없이 사용한다. 기존 구매사 회원이 폐업·휴업 상태 번호로 변경할 수 있는 경로. `blockedStatuses={['closed', 'suspended']}` 를 추가해 설정 경로도 닫아야 한다. (발견: v0.2.27.2 adversarial 2026-06-20)

### PG 가입 BizLookupField blockedStatuses 누락 (P3)
PG 가입 플로우도 `BizLookupField` 를 사용하며 현재 `blockedStatuses` 가 없다. PG 도메인에서도 폐업·휴업 사업자를 차단해야 하는지 정책 결정 후 `blockedStatuses={['closed', 'suspended']}` 추가. (발견: v0.2.27.2 adversarial 2026-06-20, P3 — 정책 미확정)

## Bid Wizard

### ~~구간 수수료 그리드 환산 툴팁 양끝 열 오버플로 + aria 연결~~ ✅ v0.2.24.2
tooltipAlign prop(start|center|end) + useId/aria-describedby 연결 완료. (PR fix+design-todos-p3 2026-06-17)

## Email / Notifications

### ~~채팅·팀 다이제스트 발송 배치화~~ ✅
`flushChatDigests`·`flushTeamChatDigests` 를 two-phase 구조로 전환: Phase 1 = 수신자당 재계산+취소 필터(변경 없음), Phase 2 = 살아남은 항목을 `sendEntriesInBatches(batchSender, enriched)` 로 일괄 발송. 수신자당 개별 `Sender` 호출(N회) → tick당 ceil(N/100)회 Resend 배치 호출. `route.ts` 도 `getResendSender()` 제거 → 세 flush 모두 동일 `batchSender` 사용. 3467 green. (fix+digest-batch-send 2026-06-17)

### ~~빈 RESEND_API_KEY dev-fallback 오설정 가드~~ ✅ PR#233
`ResendSender`·`ResendBatchSender`·`sendAdminEmail` production 빈 키 → `{ ok: false, error: 'resend_api_key_empty', retryable: false }` + `checkProductionConfig` 부팅 가드(`instrumentation.ts` — PM2 restart loop로 즉각 표면화). (PR fix/resend-empty-key-guard 2026-06-17)

## 견적 확장 (current_terms)

### ~~Phase E — 견적 현재조건 읽기·strip 단독 권위 (fallback 제거)~~ ✅ v0.2.26.1
rowToRfp 브리프 doc-only(개별 컬럼 폴백 제거) + loadPgRfpDetail hidden_from_pg 단독 strip(레거시 boolean 폴백 제거). dual-write·개별컬럼은 유지(롤백 안전). **배포 전제: backfill 완료 후 배포**(미완 시 레거시 행 현재조건이 구매사 화면에서 빈값 — 누출 아님). (2026-06-18)

### ~~Phase E2+F — 클린 컷오버 (개별 컬럼 제거, 문서 단독 저장)~~ ✅ v0.2.26.2
운영 데이터 disposable 전제로 개별 current_* 8컬럼 + current_fee_visible_to_pg DROP + dual-write·backfill 장치 삭제. rowToRfp 가 currentFeeVisibleToPg 를 hidden_from_pg 에서 파생. save() 문서/컬럼 비대칭도 해소(양쪽 문서 단독). 앱 레이어는 flat 유지(flat-edge). 배포=DB wipe→db:push→코드. (2026-06-18)

### (조건부) hidden_from_pg write-edge 검증
**Priority:** P3
현재는 hidden_from_pg 가 hiddenFromPgFromVisibility(수수료 공개여부)로만 채워져 안전. **추후 buyer 가 임의 필드를 숨길 수 있게 되면** write-edge 에서 HIDEABLE_PG_PATHS 검증 추가 필요 — 안 하면 PG_STRIP 핸들러 없는 숨김 경로 fail-open 누출. (선택, doc-edge 채택 시 함께)

### currentTermsFromDiscrete 빈문자열 정규화
**Priority:** P3
'' 입력을 문서에 그대로 담음(현재 falsy 라 UI 무해). omit 으로 정규화하면 더 깔끔. (발견: /ship 리뷰 2026-06-18)

### PG 멤버십 승인 서버 데이터 경계 강제 (P2)
`joinCanonicalPgWorkspace` 경로로 생성된 `approval_status = 'pending_approval'` 멤버는 UI 게이트(shell guard + `/pending-approval` 분기)로 차단되지만, 서버 액션/API 라우트(`requirePgSession()`) 레벨에서는 `memberApprovalStatus`를 검증하지 않아 직접 POST 요청으로 우회 가능. PR#199 emailVerified 유예와 동일 패턴 — 이번 PR에서 의도적으로 후속 유예. **구현 시 `requirePgSession()`에 `getMemberApprovalStatus` 체크 추가 또는 별도 미들웨어 gate.** (발견: 최종 코드 리뷰 2026-06-18)

## Completed

- **이메일 인증 서버 데이터 경계 강제 (2026-06-17, PR#223 open)**: PR#199(UI 게이트)에서 의도적으로 유예된 서버 액션/API 라우트 레벨 emailVerified 게이트 구현. `requireSession()` 에 `isEmailUnverified()` 추가(→ `requireBuyerSession`·`requirePgSession` 자동 포함) + 7개 `auth()` 직접 호출 API 라우트(centrifugo connection-token, notifications GET/SSE, files GET/upload, workspace avatar POST/DELETE, workspaces search buyer 분기) 각각 403 게이트. verify 3개 액션은 면제 유지. 2871 green.

- **Chat/Realtime + Design 6건 해소 (v0.2.24.1, 2026-06-16, branch fix/chat-realtime-todos)**:
  (1) **Centrifugo subscribe 프록시 비밀 헤더** — `CENTRIFUGO_PROXY_SECRET` env-gated `X-Centrifugo-Proxy-Secret` 상수시간 검증(`app/api/centrifugo/subscribe/route.ts`). 미설정 시 스킵(하위호환). `.env.production.example` 에 변수 추가 — **prod 배포 시 Centrifugo config 의 proxy http-headers 에 동일 값 지정 필요**.
  (2) **ChatService.sendMessage rfpId 접근권 검증** — `canWorkspaceAccessRfp` 로 교차 테넌트 uuid 검증; 불일치 시 태그만 드롭(메시지 정상 전송). `result.rfpId` 를 브로드캐스트에 사용해 드롭된 태그가 라이브로 새지 않도록.
  (3) **self-echo tempId 왕복** — `applyLiveEcho` 에 `tempId?` 파라미터 추가(정확 매칭, 없으면 첫 pending 폴백). 액션·publish 페이로드·ThreadView·TeamThreadView 전체 왕복.
  (4) **RFP 접근 게이트 공유 헬퍼** — `lib/server/rfp-access.ts`의 `canWorkspaceAccessRfp` 단일 출처로 `TeamChatService.authorize` + subscribe 라우트 `authorizeTeamChannel` 두 곳 중복 해소.
  (5) **ThreadPane thread-cache unmount 무효화** — `useEffect(() => () => invalidateThread(conversationId), [conversationId])` 추가. TeamThreadPane 과 동일 패턴 이식.
  (6) **RecipientCard rfpContext uuid 노출** — `RfpContext = { id, code?, title? }` 타입 분리. `id`(전송 uuid) 는 렌더 금지; `code`·`title` 각각 존재 시만 표시. 호출 사이트 3곳(FocusComparison·RfpBriefPanel·BidContextStrip) 및 MessageComposeSheet 수정.
  Design stale 항목 2건 제거: "PG 인박스 상세 토글 위치 정돈"(ChatRailToggle 삭제로 해소, PR#186) · "레일 열림 + 1024px 본문 그리드"(재현 불가).

- **리포지토리 경계 ESLint 강제 + 드리프트 가드 (v0.2.22.2, 2026-06-15)**: `@typescript-eslint/no-restricted-imports`(규칙 `repo-boundary/db-access`)로 `repositories/**` 밖의 `@/lib/db/{schema,client}` 값 import 금지(`import type`·서비스 동적 `import()`는 허용) + 독립 fs-walk 드리프트 가드(`lib/server/__tests__/repo-boundary.test.ts`). allowlist 는 SSOT `lib/server/db-boundary-allowlist.mjs`(4개: storage×2·`_purgeUnverifiedSignup`·`_shared`). injection-only 사이트의 죽은 `db` 파라미터(`searchWorkspaces`·`getMembership`·`accountExistsForEmail`·`canAccessAttachment`)를 제거해 allowlist 를 9→4 로 축소. CLAUDE.md 경계 규칙 명문화. (stale "메모리 테스트 구현" 문구·데드 `'memory'` 유니온은 #204 에서 이미 해소.)

- **딜룸 후속 TODO 4건 해소 (2026-06-14, dev 머지)**: 정식 페이지 통일(`DealRoomFull`, PR #186) · `/submitted` 견적작성 탭 흡수(PR #188) · `<lg` 하단시트 채팅 + 반응형 레일(PR #189) · 전체화면 이전/다음 결정성(`useDealRoomNav` 슬라이스, PR #187). 딜룸 모달 본 PR #185 위 스택으로 진행.
