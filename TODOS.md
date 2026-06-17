# TODOS

## Chat / Realtime

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

### rfp_bids 보드 죽은 표면 정리
**Priority:** P3
BidCard·loadBoard rfp_bids 분기·cardType 'bid' 경로가 어디에도 마운트되지 않음(비교 화면 재설계 PR#97 이후). 부활 계획 없으면 제거, 보존이면 'no current mount point' 주석 명시. (발견: /ship red-team 리뷰 2026-06-13)

## Signup / Auth

## Bid Wizard

### ~~구간 수수료 그리드 환산 툴팁 양끝 열 오버플로 + aria 연결~~ ✅ v0.2.24.2
tooltipAlign prop(start|center|end) + useId/aria-describedby 연결 완료. (PR fix+design-todos-p3 2026-06-17)

## Email / Notifications

### ~~채팅·팀 다이제스트 발송 배치화~~ ✅
`flushChatDigests`·`flushTeamChatDigests` 를 two-phase 구조로 전환: Phase 1 = 수신자당 재계산+취소 필터(변경 없음), Phase 2 = 살아남은 항목을 `sendEntriesInBatches(batchSender, enriched)` 로 일괄 발송. 수신자당 개별 `Sender` 호출(N회) → tick당 ceil(N/100)회 Resend 배치 호출. `route.ts` 도 `getResendSender()` 제거 → 세 flush 모두 동일 `batchSender` 사용. 3467 green. (fix+digest-batch-send 2026-06-17)

### ~~빈 RESEND_API_KEY dev-fallback 오설정 가드~~ ✅ PR#233
`ResendSender`·`ResendBatchSender`·`sendAdminEmail` production 빈 키 → `{ ok: false, error: 'resend_api_key_empty', retryable: false }` + `checkProductionConfig` 부팅 가드(`instrumentation.ts` — PM2 restart loop로 즉각 표면화). (PR fix/resend-empty-key-guard 2026-06-17)

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
