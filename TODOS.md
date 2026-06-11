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

## Completed
