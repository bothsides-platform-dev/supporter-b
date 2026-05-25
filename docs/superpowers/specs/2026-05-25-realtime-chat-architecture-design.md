# 실시간 Chat — 아키텍처·솔루션 비교분석 (구현 전 검토)

> 목적: 구현이 아니라 **방식 비교분석**. Nakama 포함. 사용자 확정 전제 반영(실시간 풀 IM + 자사 보관 필수).

## 확정 전제 (사용자 Q&A)
- **배포 타깃**: AWS Lightsail = **always-on VPS** (서버리스 아님) → 상시 WebSocket/SSE 유지 가능.
- **실시간성**: **풀 IM** — 즉시 전달 + **타이핑 표시 + 온라인 프레즌스 + 읽음 표시**. (KakaoTalk/Slack급)
- **대화 단위**: DM(1:1) + **channel**(RFP×PG 토픽 룸; buyer 팀 + 단일 PG 팀, 경쟁 PG 공존 불가).
- **데이터 주권**: **자사 보관 필수** — 메시지가 외부 SaaS 클라우드에 저장/경유되면 안 됨(결제/PG·PIPA).
- **기존 인프라**: SSE 스트림 + per-user pub/sub(`bus.ts`), 2-phase 알림 dispatch, email outbox,
  스레드 선례(`bid_notes`), 첨부 exclusive-arc, Auth.js v5 + Drizzle/Postgres, Server Action 규약.

이 두 전제(**풀 IM** + **자사 보관 필수**)가 후보군을 강하게 가른다:
- 풀 IM(양방향 고빈도 시그널) → 단방향 SSE만으론 부족, **WebSocket 계열**이 정공법.
- 자사 보관 필수 → **외부 SaaS 전면 탈락**. self-host 가능한 것만 남음.

---

## 1. 전송(transport) 아키텍처 비교 — always-on VPS 기준

| 방식 | 양방향 | 프레즌스/타이핑 적합 | VPS 적합 | 자사 보관 | 풀 IM 결론 |
|---|---|---|---|---|---|
| SSE + POST | 받기만 push | △ 타이핑/프레즌스는 POST로 어색 | ◎(이미 사용) | ◎ | 알림엔 유지, **풀 IM엔 부족** |
| **WebSocket** | ◎ 풀듀플렉스 | ◎ 표준 패턴 | ◎ (VPS라 가능) | ◎ | **정공법** |
| Long-polling | △ | △ | ◎ | ◎ | 폴백용 |
| Postgres LISTEN/NOTIFY | pub/sub 백본 | ○ (전달 fanout) | ◎ | ◎ | WS와 결합해 멀티 인스턴스 fanout |

**전송 결론**: 풀 IM은 **WebSocket**. 서버리스였다면 WS가 어려웠지만 Lightsail(always-on)이라
제약이 사라짐. 알림은 기존 SSE 유지, **chat만 WS 레이어**로 분리하거나 통합.

---

## 2. 솔루션 비교 — "자사 보관 필수"로 외부 SaaS 탈락 후 남는 self-host 후보

| 솔루션 | 형태 | 자사 보관 | 풀 IM 기본제공 | 2번째 DB/인증 | 결론 |
|---|---|---|---|---|---|
| **자체 WebSocket(Socket.IO/ws)** | Node WS 서비스 직접 | ◎ 자사 Postgres | 직접 구현(표준 패턴) | 없음 — 같은 DB·Auth.js | **공동 1순위** — 최대 통제, 컴포넌트 0 추가 |
| **Centrifugo** | 오픈소스 **실시간 fabric**(Go) | ◎ 영속은 자사 DB | WS·프레즌스·이력·재연결·스케일아웃 흡수 | **없음** — Auth.js가 JWT 발급, 구독권한은 앱 콜백 | **공동 1순위** — WS 인프라 떠넘기고 데이터·ACL은 자사 |
| 자체 호스팅 Supabase Realtime | Elixir broadcast 서버 self-host | ◎ 자사 Postgres | 프레즌스○, 메시지 모델 직접 | 인증 별도 | 대안 |
| **Tinode** | 경량 오픈소스 chat 서버(Go) | ◎ Postgres 백엔드 | ◎ DM/그룹/프레즌스/타이핑/영수증 | **2번째 store + 멤버십 sync** | 서버 채택형 3순위 |
| **Nakama** | 오픈소스 **게임 백엔드**(Go) | ◎ self-host 시 자사 | ◎ chat·프레즌스 내장 | 2번째 DB+인증+Lua | **부적합**(아래) |
| Rocket.Chat / Mattermost | 완성형 Slack 대안 self-host | ◎(Mongo/Postgres) | ◎ | 별도 앱·권한모델 | 과중·임베드/ACL 마찰 |
| Matrix(Synapse/Dendrite) | 연합 IM 프로토콜 self-host | ◎ Postgres | ◎(+E2EE) | 매우 높음 — 복잡 | 오버킬 |
| ~~Sendbird / Stream / CometChat~~ | 완성형 chat SaaS | ✗ 벤더 클라우드 | ◎ | — | **탈락(자사 보관 위반)** |
| ~~Ably / Pusher~~ | 관리형 전송 SaaS | △ 저장은 자사 가능하나 실시간 트래픽 해외 경유 | 프레즌스○ | — | **탈락/비권장(국외 경유)** |

### 핵심 판단: 결정축은 "ACL 안전"이 아니라 **통합 경제성**
- bespoke ACL(완전 비공개 1:N — 경쟁 PG 공존 금지, RFP×PG 채널)은 흔히 "외부 서버에 얹으면 샌다"로
  과장되기 쉽지만, Tinode·Centrifugo 모두 **커스텀 인증/구독권한 콜백**을 지원하므로 ACL을 앱에
  남길 수 있다 — 보안 문제가 아니다. **진짜 비용은 다른 데 있다**:
  - **2번째 데이터스토어 + 멤버십 sync 세금**: 범용 chat 서버(Tinode/Nakama)는 user/room을 자기
    store에 또 들고 있어, PG 초대·RFP 취소·멤버 변동 때마다 그쪽 상태를 **동기화**해야 한다.
  - 자체 WS / Centrifugo는 user·room·message가 **앱 Postgres 한 곳**, 인증은 **Auth.js 하나** →
    동기화 대상이 없다. 이 "하나의 DB·하나의 인증·하나의 배포 산출물"이 결정적 이점.
- **공동 1순위 둘의 갈림**: WS 인프라(프레즌스·재연결·스케일아웃 adapter)를 *직접 운영*하겠다면
  **자체 Socket.IO**(컴포넌트 0 추가), 그 fiddly한 인프라를 *떠넘기고* 데이터·ACL만 앱에 두겠다면
  **Centrifugo**(런타임 +1, 코드는 덜). 둘 다 자사 보관 충족. 소규모 팀엔 Centrifugo가 #3(작업량)을
  상당 부분 흡수해 실용적 우위일 수 있다.
- 배치: Next.js 커스텀 서버보다 **같은 VPS에 별도 실시간 서비스(Socket.IO 또는 Centrifugo) 분리** +
  Caddy `wss://` reverse-proxy 권장. 메시지 영속은 자사 Postgres(Drizzle), 인증은 Auth.js JWT 검증.

---

## 3. Nakama 재평가 (요청 핵심 — 실시간·self-host 전제에서 다시 봄)

전제가 "비동기"였을 땐 Nakama가 명백한 과설계였다. **실시간 + self-host(자사 보관)** 로 바뀌니
Nakama의 장점(실시간·프레즌스·이력·self-host로 자사 보관)이 *덜 틀리게* 보인다. 그래도 결론은 유지:

| 축 | Nakama | 영향 |
|---|---|---|
| 정체성 | **게임 백엔드**(matchmaking/leaderboard/turn-based 본체) | chat은 부가기능, 실사용 ~5% |
| DB | 자체 Postgres/CockroachDB | 앱 Postgres와 **분리** → RFP/bid 조인·ACL·백업 갈라짐 |
| 인증 | 자체 세션 | Auth.js와 **토큰 브리지** 별도 |
| 커스텀 ACL | Lua/TS runtime | 비공개 PG 규칙을 Nakama 안에 또 작성(매핑 리스크) |
| 운영 | 별도 상시 서버 | VPS에 게임 서버 1식 추가 |

**판정**: ❌ 비권장. self-host라 자사 보관은 되지만, 통합 경제성에서 진다 — 별도 DB·인증·게임
군더더기·Lua ACL이 전부 "2번째 store + sync 세금"이다. 같은 self-host라도 **순수 chat엔 Tinode가,
실시간 fabric엔 Centrifugo가 Nakama를 지배**한다. 결국 이 프로젝트 순위는 **자체 WS ≈ Centrifugo
> Tinode > Nakama**. Nakama가 정당해지는 유일한 경우는 *게임/실시간 멀티플레이가 제품 본질이 될
때*(해당 없음).

---

## 4. 종합 권고 (실시간 풀 IM + 자사 보관 필수)

```
풀 IM(타이핑·프레즌스·읽음) + 자사 보관 필수 + bespoke PG-비공개 ACL + Lightsail VPS + 기존 Postgres/Auth.js
  → 공동 1순위 ① 자체 WebSocket(Socket.IO/ws): 컴포넌트 0 추가, 최대 통제 — WS 인프라 직접 운영
  → 공동 1순위 ② Centrifugo: WS·프레즌스·재연결·스케일아웃 흡수, 데이터·ACL은 앱(Auth.js JWT) — 코드 덜
     · 갈림: 인프라 직접 운영=①, 인프라 떠넘기고 코드 줄이기=② (소규모 팀엔 ②가 실용적일 수 있음)
  → 3순위(서버 채택 선호 시): Tinode self-host — 단, 2번째 store+멤버십 sync 세금
  → 차순위: 자체 호스팅 Supabase Realtime(프레즌스·broadcast만, 메시지 모델 직접)
  → ❌ Nakama(형상 불일치, ①②·Tinode에 밀림) / Rocket.Chat·Matrix(과중·임베드 마찰)
  → ❌ Sendbird·Stream·CometChat(자사 보관 위반) / Ably·Pusher(실시간 해외 경유)
```

**한 줄**: 자사 보관 필수가 SaaS·전송형(Ably/Pusher)을 다 지우고, 풀 IM이 SSE를 WebSocket으로
밀어올린다. 결정축은 ACL 안전이 아니라 **통합 경제성(하나의 DB·하나의 인증)** — 그래서 **자체
Socket.IO**와 **Centrifugo**가 공동 1순위. Nakama는 실시간·self-host로 덜 틀려졌지만 게임 형상이라
Tinode·Centrifugo에도 밀린다.

---

## 5. (참고) 자체 WebSocket 채택 시 재사용·신규 — 구현은 별도 승인 후
- **재사용**: 데이터 모델(chat_rooms[kind dm|channel, rfp_id, pg_ws_id]/members[last_read_at]/messages),
  비공개 ACL(`canChat`+`validateRoomMembers`, `pg_ws_id` unique로 구조적 보장), 첨부 exclusive-arc
  (+`chat_message_id`), 알림/이메일은 기존 dispatch+outbox, Server Action 규약.
- **신규(전송만 교체)**: Socket.IO 서비스(같은 VPS) — 이벤트 `message`/`typing`/`presence`/`read`,
  Auth.js 세션 검증, room=대화방 매핑, 메시지 영속화는 자사 Postgres(Drizzle).
- **풀 IM 추가분 (작업량 정직하게)**: 표준 패턴이긴 하나 *저난도는 아님* — 며칠~2주급. 까다로운 곳:
  멀티탭 프레즌스 + disconnect grace + last-seen(레이스·새로고침 flicker), 재연결 backfill(`since`
  커서·갭 감지·순서), 메시지 가시성마다 읽음 영수증 fan-in(`last_read_message_id`). **스케일아웃**:
  2번째 Node 프로세스(PM2 cluster/수평확장) 순간 Socket.IO는 Redis/Postgres adapter 필요 — 나중
  함정 말고 지금 명시. (이 작업량을 Centrifugo가 상당 부분 흡수하는 게 ②의 매력.)
- **문서 동기화**(CLAUDE.md 의무): SCREEN_DESIGN §0 IA, PG_RFP_SPEC §3/§8(신규 capability+비공개 양립),
  NOTIFICATION.md(chat 이벤트), 배포 ADR(WS 포트/Caddy reverse-proxy `wss://`, HTTP/2).

---

## 6. 공동 1순위 심층 비교 — ① 자체 Socket.IO vs ② Centrifugo (검증 완료)

검증 출처: Centrifugo GitHub/공식문서 — Apache-2.0, Redis/Nats engine으로 빌트인 스케일아웃,
메시지 **영속 안 함**(history는 재연결 recovery 버퍼), 전송 WS/SSE/WebTransport, JWT 인증 + connect/
subscribe/publish proxy로 백엔드 위임, "self-hosted alternative to Pusher/Ably/socket.io" 표방.

| 축 | ① 자체 Socket.IO | ② Centrifugo |
|---|---|---|
| 포지션 | 범용 WS 라이브러리(서버 직접 작성) | 자체호스팅 실시간 서버(전용 바이너리) |
| 추가 런타임 | 없음(앱과 같은 Node) | Go 서버 1식 (+멀티노드 시 Redis/Nats) |
| 라이선스 | MIT | Apache-2.0 |
| 클라이언트 | socket.io-client | centrifuge-js(공식 browser/mobile SDK) |
| 인증(Auth.js) | 핸드셰이크에서 세션쿠키/JWT 직접 검증 | 백엔드가 연결 JWT(HMAC) 발급 → Centrifugo 검증 |
| **bespoke PG-ACL** | 자체 코드(완전 통제) | **subscribe proxy 콜백 → 앱 코드**(여전히 자사) |
| 메시지 영속 | 자체 코드 → Postgres | 자체 코드 → Postgres(서버는 영속 X, recovery 버퍼만) |
| 프레즌스 | 직접 구현(멀티탭·grace 까다로움) | **빌트인**(join/leave) |
| 타이핑 | 직접 구현 | 채널 publish로 간단 |
| 읽음 영수증 | 직접 구현 | 모델링은 직접, 전달은 빌트인 |
| 재연결/backfill | 직접 구현(`since` 커서·갭·순서) | **빌트인**(history recovery) |
| 스케일아웃 | Redis adapter + **sticky sessions 필요** | Redis/Nats engine **빌트인**, WS 중심이라 sticky 부담 작음 |
| 초기 작업량 | 큼(WS 플럼빙 전부) | 중(서버 구성 + proxy 배선 + backend-publish) |
| 유지 작업량 | 실시간 코드 자체 유지 | 실시간은 업스트림 위임, 앱은 ACL/영속만 |
| 운영 부담 | 컴포넌트 0 추가 | Go 서버 + (확장 시)Redis |
| 통제/락인 | 와이어까지 통제 / 락인 0 | 서버 기능 범위 내 / 락인 낮음(self-host) |

### 다이어그램 ① 자체 Socket.IO
```
[Browser: socket.io-client] ⇄ wss ⇄ [Caddy] ⇄ [Socket.IO 서비스 (Node/PM2, 같은 VPS)]
                                                     │  같은 코드베이스·같은 DB
                                                     ├─ Auth.js 세션/JWT 검증(핸드셰이크)
                                                     ├─ membership + PG-비공개 ACL(자체 코드)
                                                     ├─ persist ─▶ [Postgres (Drizzle): rooms/members/messages]
                                                     ├─ room fanout (단일노드 in-proc)
                                                     └─ presence / typing / read (자체 구현)
[Next.js (app)] ─ Server Actions ─▶ [Postgres]    (RFP/bid/알림; 알림은 기존 SSE 유지)
멀티노드 확장 시:  Socket.IO ⇄ [Redis adapter]  (+ sticky sessions)
  보내기: emit"message" → ACL검증 → INSERT → room emit  / 받기: 구독 소켓 즉시 수신
```

### 다이어그램 ② Centrifugo
```
[Browser: centrifuge-js] ⇄ wss ⇄ [Caddy] ⇄ [Centrifugo (Go, 같은 VPS)]
        │                                        │ engine: Memory(단일) / Redis|Nats(멀티)
        │ ① 연결 JWT 요청                         ├─ presence / join-leave (빌트인)
        ▼                                        ├─ history = 재연결 recovery (빌트인)
[Next.js (app, Auth.js)] ◀ subscribe proxy ──────┤  └─ 재연결/backfill (빌트인)
        │  - 연결 JWT(userId) 발급                 │
        │  - 구독권한 = RFP×PG 비공개 ACL(proxy)    │
        ├─ 보내기: Server Action → INSERT ─▶ [Postgres (Drizzle)]
        └─ 그 후 Centrifugo HTTP API로 channel publish ─▶ (구독자 fanout)
  타이핑/프레즌스: ephemeral은 client→Centrifugo 직접(영속X) + presence 빌트인
```

### 결정 가이드
- **①을 택함**: 추가 런타임/Redis 운영을 피하고 싶다 · 와이어까지 통제 · 실시간 플럼빙을 직접 소유 ·
  단일 노드로 오래 감.
- **②를 택함**: 프레즌스·재연결·recovery·스케일아웃을 공짜로 · Go 서버 1식 추가 수용 · 앱엔 비즈니스
  로직(ACL/영속)만.
- **이 프로젝트(저동시성·소규모팀·풀IM·자사보관·단일VPS→추후확장) 권고: ② Centrifugo가 약간 우위.**
  가장 fiddly한 부분(프레즌스·재연결·recovery·스케일아웃)을 흡수하고, 메시지는 Postgres·ACL은
  Next.js proxy로 남아 **자사보관 + 비공개정책**을 둘 다 충족. "런타임 하나도 안 늘리겠다"가 강하면 ①.

---

## 출처
- [Centrifugo (GitHub)](https://github.com/centrifugal/centrifugo) — Apache-2.0, Redis/Nats engine, 메시지 비영속(recovery 버퍼), WS/SSE/WebTransport, "self-hosted alternative to Pusher/Ably/socket.io"
- [Centrifugo — Client JWT authentication](https://centrifugal.dev/docs/server/authentication)
- [Centrifugo — Architecture overview](https://deepwiki.com/centrifugal/centrifugo/1.1-architecture-overview)
- [Socket.IO — Using multiple nodes](https://socket.io/docs/v3/using-multiple-nodes/)
- [Socket.IO — Redis adapter](https://socket.io/docs/v4/redis-adapter/)
- [Scaling Socket.IO (Ably)](https://ably.com/topic/scaling-socketio)
- Nakama / Sendbird / Stream / Ably·Pusher 세부는 §2·§3 본문 참조(공식 product/pricing 페이지 기준).
```