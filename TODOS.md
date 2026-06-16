# TODOS

## Chat / Realtime

## Auth / Signup

### AuthService unique-violation→EMAIL_TAKEN 매핑 DRY
**Priority:** P3
`if (isUniqueViolation(err)) return {ok:false, error:'EMAIL_TAKEN'}; throw err;` 가 3개 가입 메서드 `.catch` + `confirmEmailChange` 까지 4곳 중복. 제네릭 헬퍼 `mapUniqueViolationToEmailTaken<T>` 로 추출. 가입 user-insert 8필드 리터럴도 3곳 중복(스키마 컬럼 추가 시 drift 위험) — `insertNewSignupUser(tx, …)` 헬퍼 검토. (발견: /ship 유지보수 리뷰 2026-06-14)

## Design

## Kanban Board

### 보드 카드 이동의 키보드 대체 수단
**Priority:** P1
센서 교체(Mouse+Touch)로 보드 드래그가 포인터 전용이 됨 — 기존 KeyboardSensor 는 래퍼 가짜 버튼(role/tabIndex 스프레드, 무라벨·중첩 버튼) 위에서만 동작하던 깨진 affordance 였고, 카드 버튼에 합치면 dnd-kit 이 Enter 클릭을 preventDefault 로 죽여 기각. 올바른 복원은 카드 버튼 **밖** 전용 드래그 핸들(스트레치드 버튼 패턴으로 PipelineCard 루트 재구성) + KeyboardSensor 재도입, 또는 카드 컨텍스트 메뉴 '이동' 액션. 모든 드래그 액션은 상세 화면 버튼 경로로 수행 가능(기능 잠금 아님). (발견: /ship adversarial·design 리뷰 2026-06-13, branch worktree-fix-kanban-board-ux) **진척(Phase 5-7, v0.2.23.0)**: `DndContext` 에 `accessibility`(스크린리더 라이브 리전 + 한국어 드래그 안내, KeyboardSensor 없이) 추가로 SR 내레이션은 확보 — 실제 키보드 재정렬 affordance 는 여전히 미해결(이 항목 유지).

### 보드 컬럼/카드 memo 가 현재 미발현 (children 인라인 패턴)
**Priority:** P3
Phase 5-7 split 에서 `BoardColumn`·`BoardDraggableCard` 를 `React.memo` 로 감쌌지만, `KanbanBoard` 가 컬럼에 `children`(컬럼별 카드 목록)을, 카드에 `renderCard(card)` 결과를 인라인으로 주입해 매 렌더 children 참조가 바뀌므로 memo 가 bail 하지 못한다(동작 동일, 최적화 미발현 — 핸들러 useCallback 만 유효). 진짜 컬럼/카드 단위 bail 은 (1) 컬럼이 카드 **데이터**(`grouped` 는 이미 useMemo)+안정 `renderCard` 를 받아 내부 렌더, (2) 소비처(`PipelineBoard`)가 `renderCard`/`columnOverflow` 를 `useCallback` 으로 안정화, (3) 컬럼별 `overflow` 객체 신원 안정화가 필요. DnD 보드라 동작 회귀 위험이 있어 단독 perf 패스로 분리. (발견: /ship adversarial 리뷰 2026-06-16, v0.2.23.0)

### PG 인박스 데이터 조립 중복 + 보드 뷰 2중 페치
**Priority:** P2
`app/(app)/inbox/page.tsx` 의 pairs/bids/pendingRequotes 조립이 `loadBoard.ts` pg 분기와 한 줄 단위 중복이고, 보드 뷰에서는 둘 다 실행돼 동일 쿼리 3쌍이 요청당 2회 나감(행 수 작아 현재 무해). `loadPgInboxData(wsId)` 공유 로더로 추출해 양쪽이 소비하도록. (발견: /ship maintainability·performance 리뷰 2026-06-13)

### ~~종결 컬럼 정렬을 전이 시각 기준으로~~ ✅ v0.2.24.2
rfp.updatedAt 기준 내림차순 정렬 적용(buyer awarded/closed, PG won/lost). transition() 에서 updated_at 갱신 누락도 함께 수정. (PR fix+design-todos-p3 2026-06-17)

### rfp_bids 보드 죽은 표면 정리
**Priority:** P3
BidCard·loadBoard rfp_bids 분기·cardType 'bid' 경로가 어디에도 마운트되지 않음(비교 화면 재설계 PR#97 이후). 부활 계획 없으면 제거, 보존이면 'no current mount point' 주석 명시. (발견: /ship red-team 리뷰 2026-06-13)

## Signup / Auth

## Bid Wizard

### 견적 입력 사전채움 값이 표시와 어긋날 수 있음 (소수 3자리+ / cycleNum>99)
**Priority:** P2
`NumericFormat`(decimalScale=2)·cycleNum(isAllowed≤99)은 타이핑은 제대로 막지만, **마운트 시점에 전달된** 값은 정규화/재방출하지 않음. 레거시 데이터(이번 PR 이전 type=number 로 입력된 소수 3자리+ 요율이나 cycleNum 150 등)가 재요청·드래프트 복원으로 사전채움되면 수수료 표는 `1.23`(절삭)으로 보이지만 state·검토 단계·제출은 `1.2345`(원본)을 유지 — 표시와 제출이 어긋남. 검토 단계가 원본 값을 보여줘 발송 전 안전망은 있고, 신규 입력은 항상 ≤2자리라 영향 없음(레거시 한정). 픽스: 사전채움 경로(`bidToDraft`/`fmtPct`)에서 요율을 2자리로 반올림하고 cycleNum 을 99 로 클램프. (발견: /ship adversarial 리뷰 2026-06-14, branch worktree-fix+bid-numeric-inputs)

### ~~구간 수수료 그리드 환산 툴팁 양끝 열 오버플로 + aria 연결~~ ✅ v0.2.24.2
tooltipAlign prop(start|center|end) + useId/aria-describedby 연결 완료. (PR fix+design-todos-p3 2026-06-17)

## Email / Notifications

### 채팅·팀 다이제스트 발송 배치화
**Priority:** P3
일반 outbox flush 는 `resend.batch.send`(콜당 100통, rate-limit 1요청)로 묶어 보내지만, `flushChatDigests`·`flushTeamChatDigests` 는 본문을 발송 시점에 재계산해야 해서 여전히 수신자당 단건 발송이다(백오프/분류는 적용됨). 다이제스트는 (스코프·수신자·3분 윈도) coalesce + tick당 50건 상한이라 버스트가 작지만, 멤버 많은 워크스페이스에서 한 윈도가 동시에 만료되면 단건 발송이 초당 2요청을 넘길 수 있다. 재계산/취소 필터 후 살아남은 다이제스트를 `sendEntriesInBatches` 로 묶어 발송하도록 확장 검토. crontab `flock -n` 로 cron 중첩 더블센드는 이미 차단. (발견: /ship 어드버서리얼 2026-06-15, 본 PR 의도적 연기)

### 빈 RESEND_API_KEY dev-fallback 오설정 가드 (기존 동작)
**Priority:** P3
`RESEND_API_KEY` 가 빈 문자열이면 `ResendSender`/`ResendBatchSender` 가 dev 모드로 떨어져 `[email DEV]` 로그만 남기고 행을 `sent` 로 표시한다 — 운영에서 키를 빈 값으로 잘못 설정하면 메일이 조용히 안 나간다. 부팅/런타임 가드(예: `NODE_ENV==='production'` 이면 빈 키를 에러로)로 오설정을 표면화. 본 PR 비도입(기존 `ResendSender` 동작 미러). (발견: /ship 어드버서리얼 2026-06-15)

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
