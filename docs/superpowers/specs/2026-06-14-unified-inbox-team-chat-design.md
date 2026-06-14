# 통합 메시지함 — 팀 채팅을 /messages 에 흡수 (Unified Inbox)

- **작성일**: 2026-06-14
- **브랜치**: `feat/unified-inbox-team-chat`
- **상태**: 설계 승인됨 (사용자 승인 2026-06-14)

## 1. 목표 (Why)

딜룸의 "RFP 통합 채팅"(`ChatPanel` — 탭 `[상대방 채팅 | 팀 채팅]`)에서 나눈 **모든 대화**를 표준
메시지함 `/messages` 에서도 확인할 수 있게 한다.

현재 상태(감사 완료, 27-에이전트 워크플로 검증):

- **상대방 채팅**(구매사↔PG)은 이미 `/messages` 와 같은 스레드를 공유한다. 대화는
  `(buyer_ws_id, pg_ws_id)` **쌍 단위**(RFP 무관, `chat_conversations` UNIQUE)이고, 양쪽 모두 같은
  `ThreadView` + 같은 Centrifugo 채널을 쓴다. 유일한 결함은 `/messages` 에서 **RFP 칩이 렌더되지
  않는다**(`MessageInbox` 가 `ThreadPane` 에 `rfpById` 를 넘기지 않음).
- **팀 채팅**(`rfp_team_messages`)은 `(rfpId, workspaceId)` **단위**로 구조가 다르며, **딜룸 전용**이다.
  읽음상태·안읽음·알림이 전혀 없고(`team-chat.ts:22` "v1: no mentions/notifications/read-state — 확정
  결정"), 워크스페이스 전역 목록 쿼리도 없다(`listByScope(rfpId, wsId)` 단일 RFP만 존재).

## 2. 확정된 제품 결정 (사용자 선택)

1. **범위**: 상대방 채팅 + 팀 채팅 **둘 다** `/messages` 에서 확인.
2. **표시 방식**: **하나의 통합 목록 + 필터 칩** `[전체 | 상대방 | 팀]`.
3. **읽음/알림**: **풀 패리티** — 팀 채팅도 읽음상태·안읽음 배지·알림(인앱+이메일)까지.
   - ⚠️ 이는 코드의 v1 "팀 채팅 알림 없음 — 확정 결정"을 **의도적으로 확장**하는 결정이다. 관련 주석
     3곳(`team-chat.ts`, `rfp-team-messages.ts`, `sendTeamMessageAction.ts`) + `SCREEN_DESIGN.md` 갱신을
     본 작업에 포함한다.
4. **딥링크 파라미터**: `/messages?t=<rfpId>` (기존 `?c=<conversationId>` 유지).
5. **알림 다이제스트 윈도**: 상대방 채팅과 동일 **3분**.

## 3. 아키텍처 접근

상대방(쌍 단위)과 팀(RFP 단위)은 구조가 달라 **하나의 테이블로 합치지 않는다**. 대신 **얇은 통합
로더**로 표현 계층에서 병합한다.

```
listConversationsForViewer()   (기존, 상대방)  ─┐
listTeamThreadsForViewer()     (신규, 팀)      ─┼─▶ listInboxForViewer()  (신규 합성)
                                                 │     · kind 태깅 + lastMessageAt desc 병합
                                                 └────▶ InboxListItem[] (discriminated union)
```

- 선택 식별자는 통합 키로: `c:<conversationId>` (상대방) / `t:<rfpId>` (팀).
- 각 로더는 작고 독립 단위 — 단위 테스트 용이.
- `/messages` page 와 home widget 모두 `listInboxForViewer()` 를 소비.

### `InboxListItem` 타입 (discriminated union)

```ts
type InboxListItem =
  | { kind: 'counterparty'; conversationId: string; counterparty: {...};
      rfpId: string | null; preview: string; lastMessageAt: string | null; unread: boolean }
  | { kind: 'team'; rfpId: string; rfpCode: string; rfpTitle: string;
      preview: string; lastMessageAt: string | null; unread: boolean };
```

## 4. 컴포넌트별 설계

### A. 팀 채팅 읽음상태 (DDL — additive)

- 신규 테이블 `rfp_team_message_reads` — `chat_conversation_reads` 와 동형:
  - 컬럼: `rfp_id`, `workspace_id`, `user_id`, `last_read_at`, (PK = `(rfp_id, workspace_id, user_id)`).
- 신규 repo `RfpTeamMessageReadRepo` (Drizzle + memory 구현, 기존 read repo 패턴 복제).
- `TeamChatService.markRead({ rfpId }, actor)` — `last_read_at = now` upsert.
- `markTeamThreadReadAction({ rfpId })` — `TeamThreadView` 마운트 시 발화(상대방 `ThreadView.tsx:254`
  의 `markConversationReadAction` 패턴 미러).
- **unread 계산**: 마지막 팀 메시지가 내 `last_read_at` 이후 **AND** 작성자 `author_user_id ≠ 나`.
  (상대방의 `authorWsId !== ws.workspaceId` 와 동형 — 자기 메시지는 안읽음 아님.)

### B. 목록 / 로더

- `listTeamThreadsForViewer()` (신규) — 세션 워크스페이스가 관여한 RFP 중 **팀 메시지가 존재하는** 것을
  모아 각 항목을 `{ kind:'team', rfpId, rfpCode, rfpTitle, preview, lastMessageAt, unread }` 로 반환.
  - 신규 repo 메서드 `listThreadsForWorkspace(workspaceId)` — RFP별 마지막 메시지 + 미리보기 집계
    (현재는 `listByScope(rfpId, wsId)` 단일 RFP만 있음).
  - unread 는 위 A 의 read repo 와 조인.
- `listInboxForViewer()` (신규) — `listConversationsForViewer()` + `listTeamThreadsForViewer()` 를
  `kind` 로 태깅, `lastMessageAt desc` (nulls last) 병합.

### C. 인박스 UI

- `ConversationList` 상단에 **필터 칩** `[전체 | 상대방 | 팀]` — Linear 토큰, 6px shape, 칩 색=상태매핑
  규칙 준수(중립은 surface). 선택 칩만 강조.
- 행 렌더 분기:
  - `counterparty`: 상대사명 + 아바타 (현행 유지).
  - `team`: `👥 팀 · {rfpCode} {rfpTitle}` 라벨 (아이콘 + 라벨 + 미리보기 + 안읽음 점).
- 스레드 선택 라우팅 (`MessageInbox`):
  - `kind==='counterparty'` → `ThreadPane` → `ThreadView` (현행).
  - `kind==='team'` → `TeamThreadView` (딜룸 팀 탭과 동일 컴포넌트 — 열람 + 전송 그대로 동작).
- **상대방 스레드 RFP 칩 복원**:
  - `loadConversationThread` 가 스레드에 등장한 rfpId 들의 `{ code, title }` 맵(`rfpById`)을 함께 반환.
  - `ThreadPane` 가 surface 무관하게 `rfpById` 를 구성해 `ThreadView` 에 전달.
  - 효과: `/messages` 에서도 메시지별 RFP 칩이 보임. 딜룸도 단일-RFP 맵 → 전체-RFP 맵으로 일관(약한
    시각 변화 — 다른 RFP 메시지에도 칩이 붙음, 의도된 개선). `defaultRfpId`(컴포저 자동 태깅)는 딜룸
    전용 prop 으로 유지.

### D. 딥링크 / 교차링크

- `/messages?t=<rfpId>` 신규. `messages/page.tsx` 가 `searchParams.t` 도 읽어 초기 선택 결정.
  `?c` 와 `?t` 는 상호배타 — 한 번에 하나만 선택한다. 둘 다 들어온 비정상 케이스는 `?c` 우선.
- `MessageInbox` 의 `initialSelectedId` 를 통합 키(`c:`/`t:`)로 일반화.
- `ChatPanel` **팀 탭에도 "메시지함에서 열기"** 추가 → `/messages?t=<rfpId>` (현재 상대방 탭에만 있는
  비대칭 해소, `ChatPanel.tsx:158-164` 참조).
- home `RecentMessagesPanel` — `listInboxForViewer()` 소비, 팀 행도 노출, `kind` 에 따라 `?c`/`?t` 딥링크.

### E. 알림 (풀 패리티)

- `TeamChatService.sendMessage` 에 알림 팬아웃 추가 — **상대방 챗 다이제스트 패턴 미러**
  (`ChatService` 의 3분 윈도 dedupe + 인앱 알림 + 이메일 아웃박스 + post-commit flush).
- **수신자 = 같은 워크스페이스 멤버 − 작성자** (팀 채팅은 워크스페이스 내부 대화).
- 신규 알림 타입(예: `team_chat_message`) + react-email 템플릿(상대방 `chatMessage` 템플릿 변형).
- 인앱 알림이 생기므로 사이드바 **알림 배지**(`useNotifications`)에 팀 활동이 자연 반영 — 상대방 챗과
  동일 경로.
- dedupe 키: `team-digest:<rfpId>:<recipientUserId>:<3분버킷>` (상대방의 `chat-digest:...` 동형).

### F. 실시간 / 읽음

- 팀 스레드 선택 시 `TeamThreadView` 가 기존 `useTeamChannel` 로 라이브 구독(이미 구현). 추가 없음.
- 목록 unread 신선도는 상대방과 동일(서버 스냅샷 + `force-dynamic` 재렌더). 목록의 라이브 갱신은
  상대방도 하지 않으므로 범위 외(패리티 유지).

## 5. 단위 분해 (각 단위의 책임/인터페이스/의존)

| 단위 | 책임 | 의존 |
|---|---|---|
| `rfp_team_message_reads` 스키마 + repo | 팀 스레드 읽음 워터마크 저장/조회 | drizzle, memory |
| `TeamChatService.markRead` / `listThreadsForWorkspace` 집계 | unread·목록 비즈니스 로직 | read repo, message repo |
| `listTeamThreadsForViewer` / `listInboxForViewer` | 로더(세션 검증 + 병합·정렬) | services |
| `ConversationList` 필터 칩 + 팀 행 | 표시·필터 | InboxListItem |
| `MessageInbox` 통합 선택 라우팅 | 스레드 분기(ThreadView/TeamThreadView) | 통합 키 |
| `loadConversationThread` rfpById | 상대방 스레드 RFP 칩 데이터 | rfp repo (code/title) |
| `TeamChatService` 알림 팬아웃 | 인앱+이메일 알림 | NotificationRepo, OutboxRepo, 멤버 조회 |
| 딥링크 `?t` + ChatPanel 팀 탭 링크 | 교차 네비게이션 | — |

## 6. 테스트 전략 (TDD — RED→GREEN 필수)

각 단위는 실패 테스트 먼저. 핵심 케이스:

- **read repo**: upsert·조회·없을 때 null.
- **unread 계산**: 마지막이 내 read 이후+타인 → unread; 내 메시지 → not unread; read 이후 없음 → not.
- **`listThreadsForWorkspace`**: 여러 RFP 집계, 메시지 없는 RFP 제외, 미리보기=마지막 메시지.
- **`listInboxForViewer`**: 두 종류 병합 + `lastMessageAt desc` 정렬, 한쪽 빈 경우.
- **알림 팬아웃**: 수신자 = 멤버 − 작성자, 3분 dedupe, 인앱+아웃박스 생성, 작성자 제외.
- **필터 칩**: 전체/상대방/팀 필터링.
- **딥링크**: `?t=<rfpId>` 초기 선택, 통합 키 매칭, 목록에 없으면 빈 상태.
- **RFP 칩**: `/messages` 에서 rfpById 채워져 칩 렌더(회귀: 현재는 안 보임).

면제: `page.tsx`/단순 조립 shell, 순수 스타일. (CLAUDE.md TDD 규칙 준수.)

## 7. 배포 / 마이그레이션

- **DDL**: `rfp_team_message_reads` 1개 테이블 additive. drizzle-kit push 전 statement 리뷰
  (공유 5432 DB 주의 — additive 이지만 `--force` blind 금지, [[drizzle-push-shared-db-cross-branch-drop]]).
- **알림 타입 enum**: DB enum + TS 양쪽 추가.
- backfill 불필요. 기존 팀 스레드는 read 행이 없어 첫 로드 시 안읽음으로 표시되며, 사용자가 한 번
  열면 mark-read 로 정리된다(허용 가능한 1회성 노이즈).

## 8. 구현 단계 (한 스펙, 2-PR 권장)

- **1단계 (가시적 "모두 확인")**: §4 A·B·C·D·F — 팀 스레드를 `/messages` 에서 보고/보내고 읽음처리 +
  상대방 RFP 칩 복원 + 통합 목록·필터·딥링크.
- **2단계 (알림 패리티)**: §4 E — 팀 메시지 알림 팬아웃(인앱+이메일).

각 단계는 독립적으로 그린·배포 가능. writing-plans 에서 단계별 작업 분해.

## 9. 영향받는 문서

- v1 "알림 없음 확정 결정" 주석: `lib/server/services/team-chat.ts`,
  `lib/db/schema/rfp-team-messages.ts`, `lib/server/actions/chat/sendTeamMessageAction.ts`.
- `SCREEN_DESIGN.md` — 메시지함(/messages) IA: 통합 목록 + 필터 칩 + 팀 스레드.
