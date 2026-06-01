# 실시간 채팅 (풀 IM) — 구현 계획

> 점-시점 계획 아티팩트(`docs/superpowers/**` 컨벤션). 전송 방식 비교는 자매 문서
> [`2026-05-25-realtime-chat-architecture-design.md`](./2026-05-25-realtime-chat-architecture-design.md) 참조.
> **본 문서가 채택안**이며, 그 스펙의 "RFP×PG 채널" 모델은 폐기되고 아래 "워크스페이스 페어" 모델로 대체됨.
> 작성 2026-06-02. 구현 착수 전 사용자 Q&A로 확정.

## Context

`/messages` 라우트에는 **이미 완성된 채팅 UI 목업**이 있다 — 사이드바·커맨드팰릿·`G→M` 단축키까지 nav에 배선돼 있고, `MessageComposeButton`은 실제 3곳(`components/inbox/RfpBriefPanel.tsx`, `components/rfp/BidComparisonTable.tsx`, `components/rfp/BidDetailModal.tsx`)에 임베드돼 있다. 다만 백엔드가 없어 모든 전송이 `ComingSoonDialog`("구현중")로 귀결한다. 이 작업은 **그 채팅을 실제로 동작시키는 것**이다.

사용자 확정 결정(이번 세션 Q&A):
- **대화 모델**: RFP 무관 **워크스페이스 페어** — 구매사↔PG 한 쌍당 대화 하나. RFP는 메시지 태그/링크로만 표시. (2026-05-25 스펙의 "RFP×PG 채널"은 폐기.)
- **상대 타입**: **구매사 ↔ PG 만**. PG↔PG·구매사↔구매사 불가 → PG 상호 비공개(완전 비공개) 불변식 유지.
- **대화 시작**: 기존 RFP 연결 상대 목록 **+ 이메일 조회**. 콜드 컨택 **바로 전송 허용**(수락 게이트 없음). → "초대로만 연결되는 비마켓플레이스" 성격을 일부 완화하는 의도적 결정.
- **실시간 수준**: **풀 IM** — 즉시 전달 + **타이핑 표시 + 온라인 프레즌스 + 라이브 읽음 영수증**. (NineHire 실제 채팅은 비동기이나 사용자가 그 이상을 명시 선택.)
- **전송 계층**: **Centrifugo**(자체호스팅 Go 실시간 서버). 단일 Lightsail 2GB VM에 lean Go 바이너리 1식 추가, Caddy `wss://` 리버스프록시. 메시지 영속은 자사 Postgres, 비공개 ACL은 앱(subscribe proxy) → **자사 보관(PIPA/PG) 충족**.
- **UI/UX**: **NineHire 채팅 그대로** + 풀 IM 추가요소. 템플릿(불러오기/저장), 파일 첨부 포함.
- **알림**: 인앱 벨 + 이메일(outbox/Resend). (Kakao 알림톡은 범위 외 — `SOLAPI_*` 인프라 있으나 후속.)

**자사 보관**은 하드 제약: 메시지·첨부는 외부 SaaS를 경유/저장하지 않는다(Postgres only). Centrifugo는 메시지를 영속하지 않고 fanout/recovery 버퍼만 — 영속은 전적으로 자사 Postgres.

> **UI 시각 정합은 사용자 제공 NineHire 스크린샷이 있어야 "그대로" 매칭 가능**(헬프센터 페이지 삭제됨, 실제 앱은 로그인 뒤). 백엔드/전송/모델은 스크린샷과 무관하게 완전 확정. UI 단계 착수 시 스크린샷 적용. 미수령 시 기존 목 레이아웃을 베이스라인으로 진행.

## 데이터 모델 (`lib/db/schema/`)

신규 테이블 (Drizzle, 기존 컨벤션: uuid PK, withTimezone timestamp, 명시 인덱스):

- **`chat_conversations`** — 페어당 하나. `id`, `buyer_ws_id`(FK workspaces), `pg_ws_id`(FK workspaces), `last_message_at`, `created_at`, **`unique(buyer_ws_id, pg_ws_id)`**. (타입 정합 — buyer_ws_id는 buyer, pg_ws_id는 pg — 은 액션 로직에서 강제; FK로는 표현 불가.)
- **`chat_messages`** — `id`, `conversation_id`(FK, onDelete cascade), `author_user_id`(FK users), `author_ws_id`(FK workspaces, side 도출용), `body`(text), `rfp_id`(FK rfps, **nullable** — RFP 컨텍스트 태그), `created_at`. `index(conversation_id, created_at)`.
- **`chat_conversation_reads`** — 유저별 읽음 상태. `conversation_id`, `user_id`, `last_read_at`. `PK(conversation_id, user_id)`. 미읽음 배지 + 라이브 읽음 영수증 근거.
- **`chat_message_templates`** — `id`, `workspace_id`(FK, 워크스페이스 공유), `title`, `body`, `created_by`(FK users), `created_at`, `updated_at`. `index(workspace_id)`.
- **`attachments`** 확장 (`lib/db/schema/attachments.ts`): 4번째 exclusive-arc 암으로 `chat_message_id`(FK chat_messages, onDelete cascade) 추가. CHECK를 `num_nonnulls(rfp_id, bid_id, bid_note_id, chat_message_id) <= 1`로 상향 + partial index 추가.

마이그레이션: 스키마를 `lib/db/schema/index.ts`에 등록 후 **`pnpm db:generate`**(스냅샷 워크플로) → `db:migrate`. (수기 SQL 금지.)

## 리포지토리 (`lib/server/repositories/`)

`types.ts`에 인터페이스 + `drizzle/`에 구현 + `factory.ts` 번들 등록(`getChatRepo` 등). 명시 컬럼 projection 패턴(BID_COLUMNS 선례) 준수 — 스키마 드리프트 방지.

- `ChatConversationRepo`: `findOrCreatePair(buyerWsId, pgWsId, tx?)`, `findById`, `listForWorkspace(wsId, viewerType, tx?)`(인박스 정렬: last_message_at desc), `touchLastMessageAt`.
- `ChatMessageRepo`: `save(msg, tx?)`, `listByConversation(conversationId, tx?)`(created_at asc).
- `ChatReadRepo`: `upsert(conversationId, userId, at, tx?)`, `getFor(conversationId, userId)`, `lastReadByCounterparty(...)`(읽음 영수증).
- `ChatTemplateRepo`: CRUD by workspace.
- **`WorkspaceRepo` 추가**: `memberUserIds(workspaceId, tx?): Promise<string[]>` — 알림 fanout + Centrifugo subscribe ACL용. (drizzle 구현은 이미 `workspaceMembers` 조인 사용 — 경량 추가. 현재 인터페이스엔 `isMember`/`listForUser`만 존재.)

## Server Actions (`lib/server/actions/chat/`)

기존 규약(`'use server'`, zod v4 strict, `requireBuyerSession`/`requirePgSession`/`requireSession`, tx, post-commit side-effect, discriminated `{ok}` 결과) 준수. (URL은 RFP code, FK는 uuid 주의.)

- **`sendChatMessageAction`** — 양 역할 공용. 입력: `{conversationId?}` 또는 `{counterpartyWorkspaceId | counterpartyEmail}` + `{body, rfpId?, attachmentIds?}`. 흐름:
  1. 세션 → `session.user.workspaceType`로 side 도출.
  2. 대화 해소: conversationId 있으면 조회+멤버십 검증(`isMember`); 없으면 상대 해소(email→`userRepo.findByEmail`→그 워크스페이스, 또는 workspaceId) → **buyer↔PG 타입 검증** → `findOrCreatePair`. (콜드 컨택 허용 — 게이트 없음.)
  3. tx: message insert + 첨부 링크(attachmentIds를 chat_message_id로) + `touchLastMessageAt` + **상대 워크스페이스 각 멤버에게** `dispatchNotification(tx, inAppNotif)` + 이메일 `outbox.enqueue`(대화별 dedupeKey로 coalesce — 폭주 방지).
  4. commit 후: `emitAfterCommit` + `flushAfterCommit` + **Centrifugo publish**(채널 `chat:conversation:<id>`에 message 이벤트).
- **`markConversationReadAction`** — `last_read_at` upsert + Centrifugo "read" 이벤트 publish(상대에게 읽음 표시).
- **템플릿**: `saveTemplateAction`/`listTemplatesAction`/`deleteTemplateAction`(workspace 공유).
- **인박스/스레드 로더**: `/messages` 페이지·스레드는 현재 워크스페이스 멤버십으로 필터(buyer면 buyer_ws_id=내WS, pg면 pg_ws_id=내WS). `getMockConversations` 제거.

## 알림 이메일 폭주 방지

풀 IM은 메시지 빈도가 높아 "메시지 1건=메일 1통"이면 즉시 스팸이 된다. 기존 `outbox_entries`
필드(`scheduledAt`·`dedupeKey`(부분 unique)·`status`·`attempts`)를 그대로 활용해 **계층형**으로 막는다.
인앱 벨은 항상 즉시(`dispatchNotification`), 아래는 **이메일에만** 적용.

1. **온라인 수신자 즉시 억제 (1차 레버, 가장 큰 효과)**
   전송 시 Centrifugo **presence API**로 대화 채널(`chat:conversation:<id>`)의 수신자 접속 여부를 조회 →
   접속 중이면 **이메일 enqueue 자체를 생략**(라이브로 본다). 오프라인 멤버에게만 다음 단계 진입.

2. **윈도우 단위 coalesce (디바운스)**
   오프라인 수신자라도 즉시 1통이 아니라, 시간버킷 키로 묶는다:
   - `dedupeKey = chat-digest:<conversationId>:<recipientUserId>:<floor(now/WINDOW)>` (WINDOW 예 3~5분)
   - `scheduledAt = 해당 윈도우 종료 시각`, `INSERT … ON CONFLICT (dedupe_key) DO NOTHING`
   → 같은 윈도우 안에 N개 메시지가 와도 outbox 행은 **1개**. 시간버킷을 키에 넣어 "이미 sent된 키 충돌"을
   회피한다(대안: dedupe unique를 `status='pending'` 부분 인덱스로 좁혀 sent 후 재enqueue 허용).

3. **발송 시점 digest 재계산**
   flush에서 본문을 그 순간 상태로 생성 — "○○님이 새 메시지 N건을 보냈어요" + 최근 메시지 미리보기.
   메시지당 메일이 아니라 **윈도우당 요약 1통**. (제목/본문은 enqueue가 아니라 flush 때 확정.)

4. **읽음 단락(short-circuit)**
   flush 직전 수신자 `last_read_at >= 트리거 시점`이면 **발송 취소**(윈도우 중 접속해 이미 읽은 경우).
   미읽음 잔량이 0이면 메일을 보내지 않는다.

5. **수신자별 쿨다운 상한(하드 캡)**
   대화×수신자당 최소 발송 간격(예 ≥10분) 보장 — 직전 sent 시각이 캡 이내면 `scheduledAt`을 뒤로 미뤄
   합산. 활동 폭주 시에도 시간당 메일 수에 천장.

**필요 인프라 — 주기적 flush**: 현 post-commit flush(`lib/server/outbox/post-commit.ts`)는 commit 직후
**즉시** 실행이라 미래 `scheduledAt`(지연) 행을 놓친다. 따라서 **due pending 행을 줍는 주기 flush(매 1분
cron/스케줄러)** 가 필요하다. (후속 메시지의 post-commit flush가 due 행을 부수적으로 줍는 보조 경로는 있으나,
대화가 멈추면 마지막 digest가 영영 안 나갈 수 있어 주기 flush가 정답.) — 신규 cron 1건 추가 필요.

**기본값**(조정 가능): WINDOW=3분, 쿨다운=10분, presence 미접속자에만 발송.

## 실시간 전송 — Centrifugo

- **서버**: `docker-compose.prod.yml`에 centrifugo 서비스 추가(`127.0.0.1:8000` 바인딩, config.json). 로컬 dev용 compose 변형.
- **Caddy**(`deploy/Caddyfile`): WS 경로 reverse_proxy 추가(예: `handle /connection/* { reverse_proxy 127.0.0.1:8000 }` — Caddy가 WS 업그레이드 투명 처리). 기존 app(`:3000`)/admin(`:3001`) 패턴과 동일.
- **연결 인증**: Next.js 라우트가 Auth.js 세션 검증 후 **연결 JWT**(sub=userId, HMAC `CENTRIFUGO_TOKEN_HMAC_SECRET`) 발급.
- **subscribe proxy**: Centrifugo가 구독 권한을 `/api/centrifugo/subscribe`로 콜백 → 앱이 `isMember`(페어 양쪽 중 하나)로 **비공개 ACL을 앱에 보존**. 채널당 `chat:conversation:<conversationId>`.
- **publish**: 영속(Postgres) 후 Centrifugo HTTP API로 채널 publish → 구독자 fanout. **타이핑**=클라가 ephemeral publish, **프레즌스**=Centrifugo 빌트인 join/leave, **읽음 영수증**=markRead가 read 이벤트 publish.
- **클라이언트**: `centrifuge-js` + `useChatChannel` 훅(기존 `lib/hooks/useNotifications.ts` 패턴 — ref-count 싱글턴 연결, 2-phase: REST 히스토리 + 라이브 prepend).
- **스케일아웃**: 현재 PM2 단일 fork(`instances:1`) → Memory engine, Redis 불필요. 멀티노드 확장 시 Redis/Nats engine(빌트인) — 지금은 미도입, 문서에 명시.
- **테스트**: publish는 best-effort — 단위 테스트에서 모킹(PGlite로 영속/액션만 검증, Centrifugo 미기동).

## UI (`app/(app)/messages/`, `components/messages/`)

기존 컴포넌트가 이미 list/thread/composer 골격 제공 → **NineHire 레이아웃으로 진화** + 풀 IM 요소 추가:
- `MessageInbox`/`ConversationList`/`ThreadView`: 목 제거, 실 로더/액션 배선. 워크스페이스 페어 대화, 미읽음 배지(`last_read_at` 기반), RFP 태그 칩.
- `ThreadView` 컴포저: 실제 `sendChatMessageAction` 호출 + **템플릿 피커**(불러오기/저장) + **첨부**(기존 5개/20MB 한도 재사용 — Caddy 25MB 캡 이내; NineHire 50MB 미채택) + **타이핑 인디케이터** + **프레즌스 점** + **읽음 영수증**.
- `MessageComposeButton`(임베드 3곳): `ComingSoonDialog` 제거 → 실제 대화 시작/전송(상대 워크스페이스로 페어 대화 열기, rfpId 태그).
- 새 대화 시작 UI: 기존 RFP 연결 상대 목록 + 이메일 입력 진입점.
- **NineHire 시각 정합**: 사용자 스크린샷 기준으로 UI 단계에서 적용.

## TDD (프로젝트 Hard Rule — RED→GREEN→REFACTOR, `superpowers:test-driven-development`)

각 백엔드 유닛은 실패 테스트 먼저(`pnpm test <path>`로 RED 확인 후 구현). Node 20 경로 주의, PGlite 싱글턴, cmdk/clipboard jsdom 폴리필 주의(프로젝트 메모리 참조).
- repo 테스트: 페어 unique/findOrCreate, 메시지 정렬, 읽음 upsert, 템플릿 CRUD, `memberUserIds`.
- action 테스트: buyer/pg 양 역할 전송, ACL forbidden(상대 워크스페이스 비멤버), 이메일 콜드 컨택 해소+타입 검증(buyer↔PG만), markRead, 인박스/스레드 필터, 첨부 링크, **알림 dispatch + outbox enqueue row 검증**.
- 컴포넌트 테스트: ConversationList/ThreadView 컴포저(템플릿 삽입·전송 호출·첨부), 타이핑/프레즌스/읽음 렌더(props 주입).

## 구현 단계 (권장 순서)

1. **데이터 모델 + 마이그레이션** (스키마 5건, db:generate/migrate).
2. **리포지토리 + WorkspaceRepo.memberUserIds** (TDD).
3. **Server Actions: send/list/thread/markRead** (TDD) — 인앱 알림 + outbox 통합 포함.
4. **첨부** (exclusive-arc 4번째 암 + 컴포저 업로드).
5. **템플릿** (repo + actions + 컴포저 피커).
6. **Centrifugo 전송** — 서버/compose/Caddy/JWT/subscribe proxy/publish + `useChatChannel` + 타이핑·프레즌스·읽음 라이브.
7. **UI 진화** — NineHire 정합(스크린샷), 목 제거, MessageComposeButton 실배선.
8. **검증** — 전체 `pnpm test` 그린, typecheck/lint, e2e(선택), 라이브 수동 확인.

## 문서 동기화 (CLAUDE.md 의무)

- `CLAUDE.md` 스택표: Centrifugo + `centrifuge-js` 추가.
- `SCREEN_DESIGN.md`: `/messages` 실기능으로 갱신(§0 route map + 화면표).
- 배포 ADR: WS 포트/Caddy `wss://`/Centrifugo 운영(단일노드 Memory→멀티노드 Redis), `.env.production.example`에 `CENTRIFUGO_*` 추가.

## 검증 (end-to-end)

- 단위/컴포넌트: `pnpm test`(전체 그린), `pnpm tsc --noEmit`, `pnpm lint`(`.githooks/pre-commit` raw lint).
- 라이브: 로컬 Centrifugo 기동 → 구매사·PG 두 세션으로 (1) 콜드 컨택 이메일 전송 (2) 즉시 수신 (3) 타이핑/프레즌스 (4) 읽음 영수증 (5) 첨부/템플릿 (6) 인앱 벨 + 이메일 outbox row 확인.
- e2e: `/messages` 인박스·스레드 happy-path (선택, `pnpm e2e`).

## 미해결/주의

- **NineHire 스크린샷** — UI "그대로" 정합의 하드 선행조건(7단계). 미수령 시 기존 목 레이아웃을 베이스라인으로 진행.
- **첨부 한도**: 기존 5개/20MB 재사용(Caddy 25MB 캡). NineHire 10개/50MB는 Caddy·스토리지 상향 없이는 미채택.
- **이메일 폭주**: 메시지마다 메일 금지 — 상세 전략은 위 "알림 이메일 폭주 방지" 절(presence 억제 + 윈도우 coalesce + digest + 읽음 단락 + 쿨다운, 주기 flush cron 1건 추가). 3·6단계에서 구현.
- **Centrifugo = 영구 신규 운영 컴포넌트** — 2GB VM 메모리(Go 바이너리는 경미), 배포 절차 추가, 멀티노드 시 Redis.
- **콜드 컨택**은 "비마켓플레이스" 성격 완화 — 의도적 확정(전체 맥락에서 재확인됨).
