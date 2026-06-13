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

## Completed
