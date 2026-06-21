# 실시간 온라인 표시 (Online Presence) 설계

- **작성일**: 2026-06-21
- **개정**: 2026-06-21 **rev2** (아래 "변경 이력" 참조)
- **상태**: 설계 확정 (구현 전)
- **supersedes**: `2026-06-20-workspace-online-presence-design.md` (삭제됨).
- **봉인 결정(중요)**: **presence는 ACL 없이 완전 공개로 설계한다** (2026-06-21 rev2 사용자 결정). presence 채널은 *접속 중인지(online)* 만 다루며, 인증된 사용자라면 누구나 임의 워크스페이스의 online 여부를 관찰할 수 있다(서버측 관계 검증 없음). 이는 입찰 내용 봉인(`Bid.competitorCount does not exist by design`, 견적 금액·내용 비공개)과 **완전히 별개** — 입찰 데이터 봉인은 그대로 유지하고, **온라인 점에 한해서만** 전면 공개한다. 덕분에 식별정보 익명화·count 봉인·관계 ACL 기계장치가 전부 불필요해져 설계가 크게 단순해졌다(연결 자체는 인증 JWT가 게이트하므로 *비인증 접근은 불가*).
- **last-seen 결정(중요)**: **오프라인 "마지막 접속" 표시는 하지 않는다** (2026-06-21 rev2 사용자 결정). 어떤 면에서도 "마지막 접속 N전"·"활동 N분 전" 등 *시간 텍스트를 표기하지 않는다*. presence는 **점(dot)만** — active / idle / offline 3-state 시각 신호. 따라서 last-seen 영속 레이어(`workspace_presence` 테이블·disconnect/heartbeat·버킷 포매터) **전부 삭제** → **DDL 0 복원**.
- **관련 doc**: `SCREEN_DESIGN.md`(노출 면 갱신), `DESIGN.md`(idle 점 토큰 신설 — 텍스트는 없지만 흐린 점 토큰은 필요), `styles/tokens.css`(idle 점 토큰)

---

## 변경 이력 (rev2 — 2026-06-21)

rev1(같은 날) 설계를 **다면 적대적 리뷰**(코드·Centrifugo v6 문서 근거, 9차원 66건)로 검증한 뒤 사용자 결정 2건 + 검증된 수정으로 개정.

**사용자 결정**
- **D1. presence 완전 공개(ACL 제거).** rev1의 `existsActiveConversationBetween` 게이트 + subscribe-proxy presence 분기 삭제. presence 네임스페이스는 proxy 미사용(인증 연결이면 누구나 구독). rev1이 "같은 RFP PG 상호 노출"을 ACL로 구현하려다 (a) 그 ACL로는 실제 PG↔PG 관찰이 불가하고 (b) 단일 buyer 채널이 *무관한 다른 RFP*까지 노출하는 모순이 있었음 → 전면 공개로 일원화해 해소.
- **D2. last-seen 텍스트·영속 삭제.** rev1의 M3(offline last-seen) 레이어 전체 제거 → H1(존재하지 않는 disconnect proxy)·M5(M3 테스트 공백)·DDL 부담이 모두 소멸. DDL 0 복원.

**리뷰 반영(사용자 결정 불필요)**
- **presence_ttl 유령 키 제거.** `presence_ttl`은 v6 채널 옵션이 아님(조용히 무시 = 2026-06-20 운영장애 부류). ghost 창을 실재 노브(`client.ping_interval`/`pong_timeout`)에 재정박, 드리프트 가드는 *실재 키 단언 + 유령 키 부재 단언*. (§6.1·§6.4·§7)
- **늦은 관찰자 재조정 수정.** `connInfo`는 연결 시 고정·이후 publish로 안 바뀌고 history 미활성이라 rev1의 "presence info 또는 직전 publication"으로는 늦은 구독자가 현재 active/idle을 못 받음 → owner gossip(관찰한 join마다 현재 state 재publish) + `deriveActivity` 기본값 **unknown=idle(초록 아님)**. (§6.2)
- **토큰 게이트 보존.** rev1 §6.7 "핫패스 DB 제거"가 `isSessionRevoked`/`isEmailUnverified` 보안 게이트를 떨굴 위험 → 게이트 유지 + userId 키 단TTL(5–10s) 캐시, `TOKEN_TTL` **30m**(60m 아님). (§6.6)
- **pending/suspended/미인증은 의도적 offline 명시.** 셸 가드가 마운트 전 차단 + 토큰 라우트 401/403가 백스톱. (§6.1·§9-degradation)
- 인용 정정·a11y·테스트 보강 등 소폭(본문 반영).

---

## 1. 배경 / 문제

현재 "온라인 표시"는 **채팅 스레드 헤더의 상대 아바타 우하단 초록 점 하나**가 전부다(`components/messages/ThreadView.tsx:314-320`, `online &&` 게이트). 판정은 Centrifugo가 **그 대화 채널**(`chat:conversation:<id>`)의 접속자 수가 2명인지로 한다(`lib/hooks/useChatChannel.ts:62-66`, `presenceStats().numUsers >= 2`).

지금 점의 의미는 *"상대가 앱에 접속 중"* 이 아니라 **"상대가 지금 이 대화방을 열어두고 있음"** 이다(WS가 lazy 연결). 사용자 요구는 **"앱 탭이 열려 있으면(페이지 무관) 온라인"** 이므로, 전역 신호가 필요하다.

## 2. 목표 / 비목표

**목표**
- **online 정의**: 앱 탭이 열려 있는 동안(어느 페이지든) 온라인. 닫으면 오프라인.
- 4개 면 노출: 1:1 상대방(인박스 목록·홈 위젯·스레드 헤더) / 같은 워크스페이스 팀원 / 구매사가 보는 각 초대 PG / 딜룸 참여자.
- **3-state 점**: active(초록 solid) / idle(흐림 hollow) / offline(점 없음). **시간 텍스트 없음**(점만).
- **전부 push**(폴링 없음).

**비목표**
- **offline last-seen / "마지막 접속 N전" — 표시하지 않음**(텍스트 없음, 영속 없음; D2).
- **idle "활동 N분 전" 시간 텍스트 — 표시하지 않음**(흐린 점만; D2). idle은 *상태(불리언)* 만 신호한다.
- **presence ACL — 없음**(완전 공개; D1). 연결 JWT만이 게이트.
- 숨김/투명 모드(invisible) — always-on.
- 멀티노드 / 무깜빡임 배포(Redis) — §6.5, v1은 Memory 수용.
- **입찰 내용 봉인은 본 설계 범위 밖** — 견적 금액·내용 비공개는 기존대로 유지.

## 3. 확정된 결정

| 결정 | 값 | 근거 |
|---|---|---|
| online 의미 | **앱 열림**(연결 생존), 페이지 무관 | 사용자 — "앱이 켜져있으면 online" |
| 노출 면 | 1:1 상대 + 팀원 + 구매사-PG + 딜룸 (4면) | 사용자 |
| 점 정밀도 | **3-state**(active/idle/offline), **시간 텍스트 없음** | 사용자(rev2) + 업계 표준(소켓 생존만으로 초록점 금지) |
| **presence ACL** | **없음 — 완전 공개**(점 한정, 인증 연결이면 누구나 관찰) | 사용자(rev2, D1) — 관계 ACL·익명화·count 봉인 기계장치 전부 제거 |
| **offline last-seen** | **표시 안 함**(텍스트·영속 없음) | 사용자(rev2, D2) — M3 레이어 삭제, DDL 0 복원 |
| 딜룸 표시 단위 | **참여자 신원 roster**(per-user) | 사용자 |
| 프라이버시 | always-on, 숨김 없음, presence 완전 공개, last-seen 없음 | 사용자 |
| 인프라 | v1 **Memory 엔진**(Redis 미도입), 배포 시 ~수십초 점 공백 수용 | 사용자 |
| 아키텍처 | **A1** (워크스페이스 채널 self-broadcast + 관찰) | §6 |

## 4. 업계 표준 근거 (조사 요약)

Slack·Teams·Discord·WhatsApp·Figma + Pusher·Ably·Phoenix·Centrifugo 공통 = **2-레이어, per-user 집계** 모델:
- **L1 연결 생존(online)**: 소켓 ≥1. TTL로 비정상 끊김 자가 치유(불변식 **TTL ≈ 갱신주기 ×2–3**). 멀티탭/기기 = OR 집계.
- **L2 active/away**: *소켓 생존만으로 초록점을 켜지 않는다.* 활동 = Page Visibility + 키/마우스, idle 5–10분(Slack 10·Teams 5·Discord 10). (본 설계는 *상태만* 신호 — 시간 텍스트는 D2로 비노출.)
- 불변식: presence **휘발(영속 금지)** — last-seen을 안 쓰므로 본 설계는 이 불변을 100% 지킨다. **flap 디바운스 필수**, join/leave는 UI 힌트 → 재연결 시 스냅샷 재조정.

## 5. 채널 토폴로지

| 채널 | 신규? | proxy(ACL) | 용도 | 표시 단위 |
|---|---|---|---|---|
| `presence:ws:<wsId>` | **신규** | **없음(공개)** | 워크스페이스 online 브로드캐스트 + 팀원 로스터 | 상대=binary / 팀원=per-user |
| `chat:conversation:<id>` | 기존 | subscribe-proxy | 딜룸 상대측 참여자 로스터 + 활동 | per-user |
| `team:rfp:<rfpId>:<wsId>` | 기존(presence off) | subscribe-proxy | 딜룸 팀측 참여자 로스터 (M2) | per-user |

핵심: **"이 회사 online인가(binary)"** 는 `presence:ws` 브로드캐스트로, **"이 딜룸에 누가 있나(per-user)"** 는 1:1/팀 채널 presence로 분리. presence 채널만 공개(ACL 없음); 딜룸 로스터 채널(chat/team)은 기존 ACL 그대로(봉인 유지).

## 6. 아키텍처 (A1)

### 6.1 Layer 1 — 연결 생존 (online/offline)

- **새 채널** `presence:ws:<workspaceId>` = "이 워크스페이스의 누군가가 앱에 접속 중".
- **새 Centrifugo 네임스페이스** `presence` (`deploy/centrifugo/config.yaml`, 기존 `chat` 블록과 동일 v6 스키마 형식):
  - `presence: true`, `join_leave: true`, **`force_push_join_leave: true`**(v6 기본 false — 없으면 join/leave가 *관찰자 Map의 라이브 푸시 경로*에 전달 안 됨 → 점이 무에러로 죽음).
  - **`subscribe_proxy_enabled` 미설정**(공개). presence는 ACL이 없으므로 앱 프록시를 거치지 않는다(D1). ⚠️ **검증 필요**(§12): v6에서 client-side 구독이 proxy 없이 허용되는지 확인 — 필요 시 `allow_subscribe_for_client: true` 등 명시(채널은 `$` 비prefix 일반 채널). 연결 JWT는 여전히 필수.
  - **`presence_ttl`은 쓰지 않는다**(v6 채널 옵션 아님 — "unknown key"로 조용히 무시되는 2026-06-20 footgun 부류). presence 신선도는 서버 전역 `client.ping_interval`/`pong_timeout`이 지배. ghost 창 계산은 §6.4.
- **연결 토큰에 `info:{ workspaceId }`** (`issueCentrifugoConnectionToken(userId, activeWorkspaceId)`). 연결의 모든 presence 엔트리가 이 workspaceId를 달고 다닌다(centrifuge-js presence 응답의 `connInfo`). 공개 설계이므로 평범하게 노출 — 단순함의 핵심. (chat/team 채널 동작은 불변 — 하위호환.)
- **self-broadcast**: 앱 진입 시 모든 *셸 진입 가능* 사용자가 자기 `presence:ws:<내ws>` 구독 → "나 접속 중" 등록 + 팀원 로스터. `<PresenceClient/>`를 `(app)` 셸에 마운트(`app/(app)/layout.tsx`, `ToasterProvider`/`CommandPalette` 옆) — **WS를 즉시 연다**(지금은 lazy). pending/suspended/미인증 세션은 셸 가드(`lib/auth/shell-access.ts`)가 마운트 전에 리다이렉트하므로 자연히 브로드캐스트 안 함(의도적 offline, 토큰 라우트 401/403가 백스톱).
- **관찰 (interest-based, Slack `presence_sub` 규율)**: 각 면이 **지금 화면에 렌더되는** 상대/PG의 `presence:ws:<V>`만 구독 — viewport 관심 집합(인박스: viewport 대화 행 / 비교: viewport PG 행 / 딜룸: 상대). 스크롤 아웃 시 unsubscribe. 동시 채널 수 **cap = 50**(초과 시 *온스크린 우선·오프스크린 오래된 것부터 evict*), **배치** subscribe/unsubscribe(트레일링 ~150ms), **재연결 시 관심 집합 재수립**. 비용이 인구 아닌 *렌더하는 것*에 비례. (레포에 가상스크롤 라이브러리 없음 — viewport 추적은 `IntersectionObserver` 수동 구현.)
- **online 판정 (단일 규칙)**: `presence:ws:<V>`의 presence 맵에서 **`connInfo.workspaceId === V`인 엔트리가 ≥1** 이면 V online. (관찰자는 자기 workspaceId가 V가 아니라 자연 제외 — 역할 태그·익명화 불필요, *그냥 비교*. `connInfo` 누락/위조 토큰은 fail-closed = not online.) 초기 스냅샷은 클라가 `presence()` 직접 호출, 이후 join/leave로 라이브.
- **관찰자가 맵에 나타남(수용)**: presence 활성 채널은 *구독자 전원*이 맵에 등장하므로, V를 관찰하려 구독한 다른 ws도 `presence:ws:<V>` 맵에 보인다. online 판정은 `workspaceId===V` 필터라 영향 없음. "누가 누구를 보는가"가 노출되지만 presence 완전공개(D1) 하에서 무해로 수용. (제거하려면 §11 A3 서버 fan-out — 클라가 채널에 안 들어감.)

### 6.2 Layer 2 — 활동 (active / idle, 점만)

- **클라 활동 훅**(신규, ~30줄; 레포에 `visibilitychange`/`document.hidden` 사용 0건 확인됨): Page Visibility + pointer/keyboard로 last-interaction 추적. `document.hidden` 또는 무상호작용 **7분** → idle. (⚠️ 모바일 백그라운드 탭은 브라우저 타이머 스로틀로 7분 타이머가 늦을 수 있음 — `visibilitychange:hidden`을 *즉시* idle 트리거로 함께 사용해 보완.)
- **상태 전이 publish**: 클라가 active↔idle 전이 시 자기 채널에 `{ state }` publish(시간 `at`은 표시 안 하므로 불필요). 관찰자는 publish하지 않음(read-only).
- **늦은 관찰자 재조정 (gossip)**: `connInfo`는 연결 시 고정이고 history 미활성이라 늦게 구독한 관찰자는 직전 전이를 받지 못한다. → **owner는 자기 채널의 `join`을 관찰할 때마다 현재 `{ state }`를 재publish**(가벼운 gossip). 더해 관찰자는 `subscribed`/reconnect/focus 시 `presence()`로 재계산. `deriveActivity`의 기본값: owner 엔트리는 있으나 활동 신호를 못 본 경우 **unknown = idle(초록 아님)**.
- **3-state 점**: V의 owner(workspaceId===V) 엔트리 중 **하나라도 active** → active(초록 solid); 있으나 전부 idle/unknown → idle(흐림 hollow); 0 → offline(점 없음). **시간 텍스트 없음.**
- **새 디자인 토큰**: idle 점(흐림/중립 — 텍스트는 없지만 점은 active와 시각 구분 필요). `DESIGN.md` + `styles/tokens.css`(현재 active 점은 일반 `--md-sys-color-tertiary` 차용; presence 전용 idle 토큰 신설). **a11y**: 색상 전용 신호 금지 — 상태별 `aria-label`("온라인"/"자리 비움"/오프라인은 점 미렌더), idle 토큰은 비텍스트 대비 ≥3:1 검증(DESIGN.md가 해당 팔레트 AA-주의로 표시).
- 면별: 구매사-PG·딜룸 3-state. 팀원 면은 3-state 또는 binary 택1(기본 3-state).

### 6.3 표시 단위 (granularity)

- **상대/PG 닿음** = `presence:ws:<V>`에 owner 엔트리 ≥1 (**binary**). 어느 개인인지까지는 표시 안 함(원하면 per-user도 가능 — workspaceId+userId 둘 다 info에 있음).
- **팀원 로스터** = `presence:ws:<내ws>`에서 `workspaceId===내ws`인 엔트리의 userId(per-user). self는 자기 userId로 제외.
- **딜룸 참여자 로스터** = 1:1 `chat:conversation:<id>` presence(상대측) + (M2) `team:rfp:<id>:<내ws>` presence(팀측). self는 userId로 제외.
- **offline** = 점 없음. 마지막 접속 시각·텍스트 없음(D2).

### 6.4 신뢰성 (flap / 재조정 / ghost 창)

- **비대칭 flap 디바운스**: online은 join/subscribed 시 **즉시**, offline은 leave 후 **OFFLINE_DEBOUNCE_MS(=4000) 유예** — join/subscribed/reconnect가 유예 취소(명명 상수). (딜룸이 **인터셉트 모달**이라 열고닫을 때 재구독=깜빡임 → 디바운스 필수. 워크스페이스 전환은 *다른* `presence:ws` 채널로의 이동이라 정상 leave이지 flap 아님.) 관찰자 join은 V의 offline 유예를 취소하지 않음(workspaceId 필터로 owner만 대상).
- **스냅샷 재조정**: 모든 면에서 `subscribed`/reconnect/**window focus·visibilitychange** 시 `presence()`로 재계산(트레일링 ~250ms 디바운스) — at-most-once join/leave 유실 자가 치유.
- **ghost 창 (정직한 수치)**: 비정상 끊김의 offline 전환은 v6 실재 노브로 지배 — `client.ping_interval`(기본 ~25s) + `pong_timeout`(기본 ~8s) + 서버 presence 갱신 주기(~25s). 좁히려면 `ping_interval`/`pong_timeout`을 *명시 튜닝*. 약속: **"정상 종료=즉시 offline, 크래시=최대 ~60s 내 offline"**(SCREEN_DESIGN 명시; rev1의 "~30–35s"는 존재하지 않는 `presence_ttl`에 기댄 과약속이라 정정).

### 6.5 인프라 (v1 = Memory)

- **Memory 엔진 유지.** presence는 순수 장식(§9 억제 불변으로 알림 무관)이라 수용: **매 `docker compose up -d centrifugo` 시 모든 점이 ~5–30s 사라졌다 자동 복구**(관심 집합은 재연결 시 재수립). last-seen이 없으므로 영속 상태 동기화 우려도 없음.
- **런북 단언**(`docs/DEPLOY_LIGHTSAIL.md`): "Memory presence는 **단일 Centrifugo 프로세스에서만 정확**." 멀티노드/cluster 금지.
- **업그레이드 경로**: 멀티노드·무깜빡임이 필요해지면 `presence_manager:{ enabled:true, type:redis }` + Valkey 컨테이너. DDL/코드 변화 없음.

### 6.6 토큰 / 재연결 경화

- eager `<PresenceClient/>`로 **모든 탭이 WS를 상시 보유** → Centrifugo 재시작 시 전 탭이 동시에 재연결.
- `connection-token` 라우트: 토큰 *발급* 자체는 이미 DB-free(`token.ts`). 핫패스 DB는 보안 게이트 `isSessionRevoked`+`isEmailUnverified`(`route.ts:30-31`)뿐 — **이 게이트는 유지한다**(떨구면 비번재설정/이메일변경/미인증 세션이 TTL 내내 WS 유지). 재연결 폭주 비용은 **userId 키 단TTL(5–10s) 인프로세스 캐시**로 흡수(폭주를 유저당 ~1 DB read/window로 축약), 두 PK 조회는 users 1행으로 통합.
- `TOKEN_TTL` 10m → **30m**(60m 아님 — 폐기 창 절충). 폐기 SLA 명시: "sv-bump/미인증은 ≤10s(캐시 TTL) 내 새 WS·재연결 차단". TTL 상향이 안전한 건 *발급 시 이 게이트가 돌기 때문*.
- `centrifuge-js`는 기본적으로 재연결 백오프에 full jitter를 적용 — 별도 jitter 추가 불요. 실 레버는 `minReconnectDelay`/`maxReconnectDelay`.
- **출시 전 부하 테스트**: 단일 Centrifugo 재시작을 실제 동시 탭 수로 → connection-token 캐시 적중률·Postgres 풀 관찰.

## 7. 컴포넌트 / 변경 지점

| 구성 | 파일 | 변경 | 단계 |
|---|---|---|---|
| 연결 토큰 발급 | `lib/server/realtime/token.ts` | payload에 `info:{workspaceId}`, TTL 10m→30m | M1 |
| 연결 토큰 라우트 | `app/api/centrifugo/connection-token/route.ts` | `session.user.workspaceId` 전달, sv/email 게이트 **유지** + userId 단TTL 캐시 | M1 |
| 세션 게이트 캐시 | `lib/auth/session.ts` (또는 신규 헬퍼) | `isSessionRevoked`/`isEmailUnverified` userId 5–10s LRU | M1 |
| online 순수함수 | 신규 `lib/realtime/presence.ts` | `onlineWorkspaceIds(entries)`, `deriveActivity(entries, V) → 'active'\|'idle'\|'offline'` (순수·시간 무관) | M1 |
| Centrifugo config | `deploy/centrifugo/config.yaml` | `presence` 네임스페이스(`presence`/`join_leave`/`force_push_join_leave`, **proxy 없음**) | M1 |
| config 드리프트 가드 | `deploy/__tests__/*.test.ts` | presence 네임스페이스 **실재 키 단언** + **`presence_ttl` 부재 단언**(proxy-secret 가드 동형) | M1 |
| 전역 self-broadcast | `app/(app)/layout.tsx` + 신규 `<PresenceClient/>` | 자기 ws 채널 구독, WS eager open | M1 |
| 관찰 Provider/훅 | 신규 `WorkspacePresenceProvider` + `useWorkspacePresence(wsId) → {online, activity}` | **viewport 관심 집합**만 구독(interest-based: cap=50·배치·재연결 재수립, §6.1), `Map` 유지, 비대칭 디바운스, focus 재조정 | M1 |
| 활동 훅 | 신규 `useActivityState()` | Page Visibility + 키/마우스, 7분 idle, `visibilitychange` 즉시 idle, 전이 시 `{state}` publish | M2 |
| idle 토큰 | `DESIGN.md`, `styles/tokens.css` | idle(흐림) 점 토큰 + a11y 대비 | M2 |
| 인박스 목록 | `components/messages/ConversationList.tsx` | 행 아바타에 점, viewport 관찰 | M1 |
| 홈 위젯 | `components/home/RecentMessagesPanel.tsx` | 아바타에 점 | M1 |
| 스레드 헤더 | `components/messages/ThreadView.tsx` | 점 출처를 `useWorkspacePresence`로 교체(`useChatChannel.online` 소비처는 여기 1곳뿐 — 확인됨). **타이핑 우선**, 3-state, offline 무표시 | M1 |
| 비교/선정 | `components/rfp/comparison/FocusComparison.tsx` (+ `RfpPendingRequests.tsx`) | 각 PG 행에 3-state 점, viewport 관찰 (`pgWsId` 이미 노출) | M2 |
| 딜룸 로스터 | 딜룸 ChatPanel/참여자 영역 | 1:1+팀 presence per-user 로스터 | M2 |

> 기존 `useChatChannel.online`(대화채널 numUsers>=2)은 헤더 점 용도에서 빠지고 타이핑·메시지 수신만 담당. (소비처는 `ThreadView.tsx:158` 단 1곳 — `ThreadView.test.tsx:232` 테스트도 함께 갱신.)
>
> **rev1 대비 삭제된 행**: `existsActiveConversationBetween` repo, subscribe-proxy presence 분기, `workspace_presence` 테이블·repo, disconnect 라우트, last-seen 표시 — D1·D2로 전부 불필요.

## 8. 데이터 흐름

1. 로그인 후 클라가 `/api/centrifugo/connection-token` 호출 → (sv/email 게이트 통과 시) 토큰 `sub=userId`, `info.workspaceId`.
2. `<PresenceClient/>` 마운트 → 자기 `presence:ws:<내ws>` 구독 → presence 등록(엔트리에 workspaceId) + WS open.
3. 면 진입 → `WorkspacePresenceProvider`가 화면의 상대 ws id(중복 제거, viewport) 각각 구독 — proxy 없이 바로 구독(공개).
4. 초기 `presence()` → `connInfo.workspaceId===V` 엔트리 ≥1 ? → online. 이후 join/leave/활동 publication·owner gossip → (비대칭 디바운스) `Map<wsId,{online,activity}>` 갱신. focus/reconnect 시 재조정.
5. 면 컴포넌트가 `useWorkspacePresence(wsId)` 구독 → 3-state 점(텍스트 없음).

## 9. 이메일 억제 불변 (회귀 금지)

`isUserPresentInConversation`(`lib/server/realtime/centrifugo.ts`)는 **대화 채널을 그대로 읽는다**(서버 HTTP presence API, `client.user`=userId만 사용). `presence:ws`로 **재포인팅 금지** — "아무 탭 열림"이 "그 대화를 봄"으로 넓어지면 다이제스트가 잘못 취소돼 알림 누락. presence:ws 멤버십·`info.workspaceId`는 **어떤 다이제스트도 취소하지 않는다.**
- 진짜 가드(기존): `centrifugo.test.ts:168`이 `params.channel === 'chat:conversation:conv-1'`을 단언 — presence:ws로 바꾸면 RED. **이 테스트를 §9 불변의 구조 가드로 인용/유지**한다(신규 트립와이어 대신).
- 불변 확장: M2의 팀 채팅 다이제스트(`team-chat-digest-flush`)도 팀 presence를 얻지만 **suppression은 여전히 팀 *대화* 채널만 본다**.

> **graceful degradation**: `NEXT_PUBLIC_CENTRIFUGO_WS_URL` 미설정(dev·테스트) → `getCentrifuge()` null → 구독 0, 점 없음, 정적 로더 정상. subscribe 권한 오류 → 해당 채널 구독 실패 → 그 상대 offline 표시(안전). pending/suspended/미인증 → 셸 밖 + 토큰 라우트 401/403 = 의도적 offline.

## 10. 단계

- **M1 (코어 online, binary, 공개)**: `info:{workspaceId}` 토큰(+게이트 유지·캐시·TTL 30m) + `presence:ws` 네임스페이스(proxy 없음) + force_push + online 순수함수 + self-broadcast + 관찰 Provider(interest-based, cap 50) + 비대칭 디바운스. 노출: 인박스 목록·홈·스레드 헤더(상대 binary). 억제 회귀 가드(§9), config 드리프트 가드(실재 키 + 유령 키 부재).
- **M2 (활동 + roster + 확장 면)**: 활동 훅(3-state, 텍스트 없음) + 늦은 관찰자 gossip 재조정 + idle 토큰·a11y + 구매사-PG 면(`FocusComparison`) + 딜룸/팀 per-user 로스터.
- ~~**M3 (offline last-seen 영속)**~~ — **삭제됨(D2).** offline = 점 없음, 영속 없음, DDL 0.

## 11. 검증 필요 가정 (구현 시 — Centrifugo v6)

1. 연결 토큰 `info`(conn_info) → presence 엔트리의 `connInfo` **및** join/leave ClientInfo에 그대로 노출되는지(centrifuge-js presence 응답 형태). 단위/통합 확인. (라이브 경로는 join/leave 의존이지 스냅샷만 아님.)
2. `force_push_join_leave` 켰을 때 join/leave가 구독자에 실제 전달되는지(드리프트 가드 + 통합).
3. **presence 네임스페이스 client-side 구독이 proxy 없이 허용되는지**(D1). 필요 시 `allow_subscribe_for_client`(또는 동등 옵션) 명시. 연결 JWT는 필수 유지.
4. presence 신선도/ghost 창을 지배하는 실재 노브(`client.ping_interval`/`pong_timeout` 기본값·튜닝 가능 범위) 확인 → SCREEN_DESIGN의 "~60s" 약속 확정.

> rev1의 "disconnect proxy가 비정상 끊김에 발화하는지"는 **삭제** — last-seen 제거로 무의미(애초에 OSS v6엔 disconnect/unsubscribe proxy 없음). 봉인 관련 검증(meta→proxy, chan_info 익명화, count 노출)도 완전 공개로 **불필요**.

## 12. 테스트 계획 (TDD — RED 먼저)

- **순수함수** `onlineWorkspaceIds`/`deriveActivity`: workspaceId 그룹핑(owner vs 관찰자 혼재 맵에서 V만 추출), 빈 맵, active>idle 우선, **unknown=idle**, **늦은 구독 후 idle 도출(절대 active 아님)**, 관찰자만=offline, **`connInfo` 누락/위조=not online(fail-closed)**. (시간 의존 없음 — 순수.)
- **연결 토큰**: payload `info.workspaceId` 포함, secret 없으면 throw, TTL=30m 값(**기존 `token.test.ts:43-44` `<=11m` 단언이 RED → 갱신**).
- **연결 토큰 라우트**: sv-stale 401·미인증 403가 클레임 리팩터 후에도 유지, 캐시 적중 시 DB read 1회.
- **Provider/훅**: 미설정 no-op, map 갱신, **비대칭 디바운스**(online 즉시·offline 4s·취소·관찰자 join은 취소 안 함), 중복 ws 단일 구독, viewport in/out sub/unsub, **cap=50 오버플로 evict**, **재연결 시 관심 집합 재수립**, focus 재조정. (기존 `useCentrifugoSubscription` mock 하네스 + `vi.useFakeTimers()` 재사용.)
- **활동 훅(M2)**: visibilitychange→즉시 idle, 7분 타이머, 전이 `{state}` publish, owner gossip(관찰 join→재publish), self 제외.
- **컴포넌트**: ConversationList 점 유무, ThreadView 타이핑 우선순위·3-state·offline 무표시·상태별 aria-label.
- **억제 회귀**(§9): `centrifugo.test.ts:168` 채널 단언 유지(presence:ws 재포인팅 시 RED).
- **config 드리프트**: `presence` 네임스페이스 + `presence`/`join_leave`/`force_push_join_leave` 키 존재 + **`presence_ttl` 부재** + (proxy 미사용 단언).

## 13. 배포

- `deploy/centrifugo/config.yaml`에 `presence` 네임스페이스 추가 → **컨테이너 재생성**(`docker compose up -d centrifugo`). 앱 재빌드 불필요. ⚠️ v6 스키마로(메모리 `project_centrifugo-proxy-secret-v6-footgun`), 기존 `chat` 블록 미러. **disconnect `proxy` 블록 없음**(D2). 배포 후 시작 로그에 `"unknown key in configuration file"` grep으로 유령 키 없음 확인.
- **DDL**: **0**(D2로 `workspace_presence` 삭제). 신규 env 0. 연결 토큰 `info` 추가는 하위 호환(chat/team 불변).
- ⚠️ 이 재시작이 **presence-깜빡임 이벤트**(§6.5) — 런북에 결합 명시. last-seen이 없으므로 깜빡임 후 잔류 상태 우려 없음.

## 14. 범위 밖 / 향후

- **offline last-seen(회사·개인 단위)**: D2로 제외. 수요 생기면 후속 — *반드시 presence 휘발 불변(§4)·프라이버시(공개 하에선 "잠수 N일"이 강한 경쟁 신호)를 재검토*. 재도입 시 OSS v6엔 disconnect proxy가 없으므로 **클라 스로틀 하트비트(+`navigator.sendBeacon` on `pagehide`)** 가 유일 메커니즘.
- **A3 (서버 fan-out 피드 = interest-based)** — *순수 확장(scaling) + 관찰자-맵 노출 제거용*: 허브 fan-out 천장(인기 ws 채널에 관찰자 폭증)이 단일 프로세스 한계에 닿으면 승급. 관찰자가 공유 채널 대신 자기 피드 1개 구독 + 클라가 visible 로스터 선언 → 서버가 그 집합만 watch·push. A1의 viewport 관심 집합(§6.1)이 그대로 interest 선언으로 재사용, 표시 계약(`useWorkspacePresence`) 불변. (관찰자가 V의 채널에 안 들어가므로 §6.1의 "관찰자가 맵에 나타남"도 해소.)
- **데모/샘플 워크스페이스**: `isDemo`/`isSample`는 항상 offline로(점·관찰 면제) — `lib/server/workspaces/search.ts`의 "데모 제외" 선례 미러. M2에서 반영.
- **숨김/투명 모드.**
