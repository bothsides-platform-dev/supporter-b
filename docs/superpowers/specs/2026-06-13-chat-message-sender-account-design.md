# 채팅 메시지 발신자(담당자) 표시 설계

- 날짜: 2026-06-13
- 브랜치: `feat/chat-message-sender-account`

## 배경 / 목적

buyer↔PG 라이브 채팅(`/messages` 페이지 및 상세 화면 `ChatRail`)에서 현재 스레드는
상대가 보낸 메시지 묶음에 **상대 워크스페이스 이름 + 워크스페이스 아바타**만 표시한다
(`components/messages/ThreadView.tsx`). 한 워크스페이스에 멤버가 여럿이면 같은 회사의
**어떤 담당자가 보냈는지 구분할 수 없다.**

DB는 이미 메시지마다 `chat_messages.author_user_id`(작성자 user FK)를 저장하지만,
스레드 로더(`loadConversationThread`)가 이를 `sender: 'self' | 'other'`로 접어 버린다.
즉 신원 데이터는 **이미 저장돼 있고, 표시만 안 하고 있다.**

목적: 스레드의 각 메시지에 **보낸 담당자(계정)의 이름·아바타**를 표시하고, 이메일은
호버로 확인할 수 있게 한다.

## 확정 결정 (브레인스토밍 합의)

1. **표시 위치** — 스레드 말풍선마다 발신자 이름+아바타. (인박스 대화 목록·헤더는
   워크스페이스 기준 유지 — 변경하지 않음)
2. **양쪽 모두** — 받은(other) 메시지뿐 아니라 보낸(self) 메시지에도 작성자 헤더 표시.
   한 대화를 우리 팀원 여러 명이 공유할 때 누가 응답했는지 보이게.
3. **표시 정보** — 이름 + 이니셜 아바타를 인라인으로. 이메일은 이름 **호버 시 툴팁**으로.
4. **스키마** — **변경 없음.** `chat_messages.author_user_id` FK는 이미 존재한다.
   읽기 시점에 `users`를 조인해 이름·이메일을 가져온다(팀 채팅 `rfp_team_messages`
   선례와 동일 — 비정규화 스냅샷 대신 **항상 최신 이름**).
5. **그룹핑 기준** — 같은 측이라도 작성자가 다르면 묶음·헤더 분리 → `authorUserId`
   기준(기존 `sender` 기준에서 변경). 팀 채팅(`TeamThreadView`)과 동일.

## 데이터 모델

변경 없음. 기존 컬럼만 활용한다:

- `chat_messages.author_user_id uuid NOT NULL REFERENCES users(id)` — 작성자.
  `onDelete` 미지정(NO ACTION)이라 **메시지를 보유한 user는 삭제 불가** → 작성자 행
  존재가 보장됨 → `innerJoin(users)`가 안전(행이 사라지지 않음).
- `users.name`(NOT NULL), `users.email`(NOT NULL UNIQUE) — 조인 대상.

신규 컬럼·테이블·인덱스·마이그레이션 **전부 없음**.
(기존 인덱스 `chat_messages_conv_created_idx (conversation_id, created_at)`가 asc 로드를
이미 뒷받침. `users.id`는 PK라 조인 키 인덱스도 이미 있음.)

## 서버 레이어

### 리포지토리 — `ChatMessageRepo`

신규 메서드 추가 (팀 채팅 `RfpTeamMessageRepo.listByScope` 선례 그대로):

```
listByConversationWithAuthor(conversationId, tx?): Promise<ChatMessageWithAuthor[]>
```

- `chat_messages` `innerJoin(users, eq(users.id, chat_messages.author_user_id))`
- projection = 기존 `MESSAGE_COLUMNS` + `authorName: users.name` + `authorEmail: users.email`
- `created_at` asc 정렬
- 신규 타입: `ChatMessageWithAuthor = ChatMessageRecord & { authorName: string; authorEmail: string }`
  (`lib/server/repositories/types.ts`)

기존 `listByConversation`(조인 없음)은 **그대로 둔다** — 인박스 목록 로더
(`listConversationsForViewer`)는 마지막 메시지/안읽음 판정에만 쓰므로 조인 부담을
지우지 않는다. 테스트 기반은 PGlite + Drizzle 단일 구현(팩토리의 'memory' 백엔드 =
PGlite)이라 **별도 메모리 repo 구현 없음** — Drizzle 메서드 하나면 prod·테스트 공용.

### 로더 — `loadConversationThread` (`lib/server/actions/chat/conversationLoaders.ts`)

- `listByConversation` → `listByConversationWithAuthor`로 교체.
- `ThreadMessage`에 `authorUserId`·`authorName`·`authorEmail` 매핑.
- 반환값에 `viewer: { userId, name }` 추가 — 클라이언트 낙관적(self) 말풍선이 서버
  왕복 없이 즉시 자기 이름을 그릴 수 있도록. viewer 이름은 `userRepo.findById(ws.userId)`로
  resolve(세션은 `name`을 신뢰성 있게 싣지 않음 — `auth.config.ts` jwt 콜백이 `token.name`
  미설정).

### 타입 — `ThreadMessage` (conversationLoaders.ts)

추가 필드:
```
authorUserId: string;
authorName: string;
authorEmail: string;
```
`sender: 'self' | 'other'`는 **유지**(정렬·말풍선 색 결정에 계속 사용).
`types.ts`가 이 타입을 재노출하므로 클라이언트는 자동 반영(단일 진실원천).

### 전송 — `ChatService.sendMessage` / `sendChatMessageAction`

- `ChatService.sendMessage`가 작성자(actor)의 `authorName`·`authorEmail`을 resolve 해
  결과에 포함한다(team service의 `result.authorName` 선례). resolve 는 표시 전용이므로
  트랜잭션 밖에서 `userRepo.findById(actor.userId)`.
- `sendChatMessageAction`의 best-effort 라이브 fanout(`publishChatEvent`) payload에
  `authorUserId`·`authorName`·`authorEmail` 추가 → 수신 측이 **리로드 없이** 이름 렌더.

## UI — `components/messages/ThreadView.tsx`

- 신규 prop `viewer: { userId: string; name: string }` (loader 반환값을 전달;
  `MessageInbox`·`ChatRail` 와이어링).
- 헤더 표시 조건: `!groupedWithPrev` — self·other **모두**. (현재 `!isSelf &&
  !groupedWithPrev`에서 `!isSelf` 제거)
- 그룹핑: `prev.authorUserId === m.authorUserId` (기존 `prev.sender === m.sender`).
- 헤더 렌더: `<Avatar name={authorName} size="sm" color={isSelf ? 'primary' : 'surface'} />`
  + 이름(13px medium). self 행은 이미 `items-end`라 우측 정렬; 헤더도 우측 정렬로 맞춘다.
- 이메일 호버: 이름을 `Tooltip`(`components/ui/tooltip.tsx`)으로 감싸 `authorEmail` 노출.
- 라이브 `onMessage`: append 시 `authorUserId`/`authorName`/`authorEmail` 세팅. self echo
  승격(pending→확정) 시 작성자 필드 **보존**(덮어쓰지 않음).
- 낙관적 self 말풍선: `authorUserId = viewer.userId`, `authorName = viewer.name`,
  `authorEmail`은 빈 문자열(자기 이메일 호버는 부차적; 리로드 시 조인으로 채워짐).
- `LiveMessagePayload` 타입에 작성자 필드 추가.

`ChatRail`(variant='rail')은 동일 `ThreadView`를 쓰므로 viewer prop만 넘기면 자동 반영.

## 비즈니스 규칙 / 엣지 케이스

- **작성자 행 존재 보장**: FK(NO ACTION)로 메시지 보유 user는 삭제 불가 → `innerJoin`
  안전, 폴백 불필요.
- **비활성/정지 계정**: 이름은 남아있으므로 그대로 표시.
- **self echo 승격**: `authorName` 등 작성자 필드 보존.
- **날짜 경계 그룹 리셋**: 기존 로직 유지(작성자 그룹핑과 직교).
- **호버 툴팁 모바일**: 터치 환경 제한 허용(이메일은 보조 정보, 인라인 이름이 주 식별자).
- **sealed-bid**: 대화는 이미 ws↔ws로 상호 신원이 공개된 관계 → 개인 이름 노출은 추가
  정보 누출이 아님(경쟁 PG 간 정보가 아니라 대화 당사자 내부 식별).

## 테스트 전략 (TDD — RED → GREEN)

각 변경은 **실패 테스트 먼저**. RED/GREEN 확인은 단일 파일(`pnpm test <path>`)로 빠르게.

1. **리포 (PGlite)** — `lib/server/repositories/drizzle/__tests__/chat-message.test.ts`(신규):
   `listByConversationWithAuthor`가 `authorName`/`authorEmail`을 조인 반환, `created_at` asc.
2. **로더** — `conversationLoaders.test.ts`: `loadConversationThread`가 양쪽(self·other)
   메시지에 `authorUserId`/`authorName`/`authorEmail` 부착; `viewer.{userId,name}` 반환.
3. **액션** — `sendChatMessage.test.ts`: publish payload에 `authorUserId`/`authorName`
   포함(`publishChatEvent` mock 검증).
4. **컴포넌트** — `ThreadView.test.tsx`:
   - (a) self·other **모두** 작성자 헤더 렌더
   - (b) 같은 측 **다른 작성자**면 그룹·헤더 분리
   - (c) 이름 **호버 시 이메일 툴팁**
   - (d) 낙관적 self 말풍선이 `viewer` 이름으로 표시
   - (e) 라이브 수신 메시지가 `authorName`과 함께 렌더

## 마이그레이션 / 배포

- **DDL 없음, 백필 없음, 데이터 변경 없음.** 순수 코드 변경.
- Centrifugo `message` payload에 필드 추가 — **하위호환**(구버전 수신 클라이언트는 미지
  필드 무시; 신규 필드가 없으면 기존처럼 동작).
- 서버/클라 독립 배포 안전 — 롤아웃 순서 무관.

## 범위 밖 (Non-goals)

- 인박스 대화 목록·스레드 헤더의 참여자 요약(워크스페이스 기준 유지 — "말풍선마다"만 선택).
- 팀 채팅(`TeamThreadView`) — 이미 멤버 이름을 표시(이 설계가 그 패턴을 차용).
- per-person 1:1 대화 분리(대화는 ws↔ws 유지).
- per-person 프로필 카드 / 멘션 / 멤버별 온라인 상태.
- `author_name` 스냅샷·이름 변경 이력.
