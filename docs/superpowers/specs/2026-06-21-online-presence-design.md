# 실시간 온라인 표시 (Online Presence) 설계

- **작성일**: 2026-06-21
- **상태**: 설계 확정 (구현 전)
- **supersedes**: `2026-06-20-workspace-online-presence-design.md` (삭제됨). 그 문서의 핵심 봉인 보호 메커니즘(`meta + chan_info` self/observer)은 본 설계 §6.4로 흡수했고, 범위·의미론을 대폭 확장했다.
- **관련 doc**: `SCREEN_DESIGN.md`(노출 면 갱신), `DESIGN.md`(상태 점 토큰 — idle 토큰 신설), `CLAUDE.md`(봉인 입찰 불변식), `styles/tokens.css`(idle 점 토큰)

---

## 1. 배경 / 문제

현재 "온라인 표시"는 **채팅 스레드 헤더의 상대 아바타 우하단 초록 점 하나**가 전부다(`components/messages/ThreadView.tsx:313-320`). 판정은 Centrifugo가 **그 대화 채널**(`chat:conversation:<id>`)의 접속자 수가 2명인지로 한다(`lib/hooks/useChatChannel.ts:62-66`, `presenceStats().numUsers >= 2`).

즉 지금 점의 의미는 *"상대가 앱에 접속 중"* 이 아니라 **"상대가 지금 이 대화방을 열어두고 있음"** 이다(WS가 lazy 연결 — 채팅을 열어야만 연결). 사용자 요구는 **"앱 탭이 열려 있으면(페이지 무관) 온라인"** 이므로, 전역 신호가 필요하다.

## 2. 목표 / 비목표

**목표**
- **online 정의**: 앱 탭이 열려 있는 동안(어느 페이지든) 온라인. 닫으면 오프라인.
- 4개 면 노출: ① 1:1 상대방(인박스 목록·홈 위젯·스레드 헤더) ② 같은 워크스페이스 팀원 ③ 구매사가 보는 각 초대 PG(비교·선정 화면) ④ 딜룸 참여자.
- **3-state 점**(§3 결정): active(초록) / idle(흐림, "N분 전 활동") / offline(표시 없음).
- **전부 push**(폴링 없음). 상대 접속/이탈·활동전이 시 즉시 갱신.
- **봉인 입찰 불변식 유지**: PG는 다른 PG의 정체를 알 수 없다(`Bid.competitorCount does not exist by design`). competitorCount **미노출**.

**비목표 (이번 범위 아님)**
- 완전 오프라인(연결 끊김) 상태의 **last-seen**("마지막 접속 2시간 전") — 영속(DB) 필요, §15 향후.
- 숨김/투명 모드(invisible) — always-on(전문 B2B 맥락 수용).
- 멀티노드 / 무깜빡임 배포(Redis presence_manager) — §6.6, v1은 memory 수용.

## 3. 확정된 결정 (브레인스토밍 기록)

| 결정 | 값 | 근거 |
|---|---|---|
| online 의미 | **앱 열림**(연결 생존), 페이지 무관 | 사용자 — "앱이 켜져있으면 online" |
| 노출 면 | 1:1 상대 + 팀원 + 구매사-PG + 딜룸 (4면) | 사용자 선택(복수) |
| 점 정밀도 | **3-state**(active/idle/offline) + idle fuzzy "N분 전" | 사용자 — 업계 표준 검토 후 binary 재고. 소켓 생존만으로 초록점 켜는 건 Slack/Teams/Discord/WhatsApp/Figma 전부 회피 |
| 딜룸 표시 단위 | **참여자 신원 roster**(per-user) | 사용자 선택 |
| 프라이버시 | always-on, 숨김 없음 / fuzzy last-seen은 **연결-idle 한정**(무DB) | 사용자 — 숨김X, fuzzy 재검토 |
| 인프라 | v1 **Memory 엔진**(Redis 미도입), 배포 시 ~수십초 점 공백 수용 | 사용자 — presence는 순수 장식이라 수용 가능 |
| 봉인 | **competitorCount 미노출**(②). `meta+chan_info` 보호 | 사용자 선택 ② |
| 아키텍처 | **A1** (워크스페이스 채널 self-broadcast + 관찰) | §6, 현 규모 적합. A3(서버 fan-out)는 §15 북극성 |

## 4. 업계 표준 근거 (조사 요약)

Slack·Teams·Discord·WhatsApp·Figma + Pusher·Ably·Phoenix·Centrifugo 공통 = **2-레이어, per-user 집계** 모델:
- **Layer 1 — 연결 생존(online)**: 소켓 ≥1. TTL로 비정상 끊김 자동 치유(Centrifugo 60s·Pusher 75s·Ably 30s). 멀티탭/기기 = OR 집계로 1인.
- **Layer 2 — active/away**: *모든 제품이 소켓 생존만으로 초록점을 켜지 않는다.* Slack `online≠active`(10분 idle→빈 점), Teams 5분 idle→Away·잠금 즉시, Discord idle은 클라가 보낸 afk 신호("하트비트는 소켓 생존만 증명, 사람 활동은 증명 못 함"). 활동 = Page Visibility + 키/마우스, idle 밴드 5–10분.
- 불변식: presence **휘발(영속 금지)**, **flap 디바운스 필수**(오프라인 전환 3–5초 유예), join/leave는 at-most-once UI 힌트 → 재연결 시 presence 스냅샷으로 재조정.

본 설계는 이 2-레이어를 그대로 따른다.

## 5. 채널 토폴로지 (한눈에)

| 채널 | 신규? | 용도 | 표시 단위 | 봉인 |
|---|---|---|---|---|
| `presence:ws:<wsId>` | **신규** | 워크스페이스 online 브로드캐스트 + 팀원 로스터 | 상대=binary / 팀원=per-user | observer 익명화(§6.4) |
| `chat:conversation:<id>` | 기존 | 딜룸 상대측 참여자 로스터 + 활동 | per-user (1:1이라 안전) | 1:1 — 안전 |
| `team:rfp:<rfpId>:<wsId>` | 기존(presence off) | 딜룸 팀측 참여자 로스터 (M2) | per-user (ws 분리라 안전) | ws 분리 — 안전 |

핵심: **"이 회사 online인가(binary)"** 는 `presence:ws` 브로드캐스트로, **"이 딜룸에 누가 있나(per-user)"** 는 1:1/팀 채널 presence로 분리한다. 후자만 신원을 노출하며 둘 다 봉인 안전.

## 6. 아키텍처 (A1)

### 6.1 Layer 1 — 연결 생존 (online/offline)

- **새 채널** `presence:ws:<workspaceId>` = "이 워크스페이스의 누군가가 앱에 접속 중".
- **새 Centrifugo 네임스페이스** `presence` (`deploy/centrifugo/config.yaml`, **기존 `chat` 블록과 동일 v6 스키마 형식**):
  - `presence: true`, `join_leave: true`, **`force_push_join_leave: true`**(없으면 join/leave가 구독자에 전달 안 됨 — 에러 0인데 점 죽음), `subscribe_proxy_enabled: true`.
  - 명시 튜닝: `presence_ttl: 30s`(전역 또는 네임스페이스), 클라 `ping_interval: 20s` / `pong_timeout: 5s` → 비정상 끊김 ghost 창 ~30–35s.
- **self-broadcast**: 앱 진입 시 모든 인증 사용자가 자기 `presence:ws:<내ws>` 구독 → "나 접속 중" 등록 + 팀원 로스터. (`<PresenceClient/>`를 `(app)` 셸에 마운트 — 이게 **WS를 즉시 연다**, 지금은 lazy라 채팅 열어야만 연결됨.)
- **관찰 (interest-based, Slack `presence_sub` 규율)**: 각 면이 **지금 화면에 렌더되는** 상대/PG의 `presence:ws:<V>`만 구독한다 — 관계 있는 *전체*가 아니라 **viewport 관심 집합**(인박스: viewport 대화 행 / 비교: viewport PG 행 / 딜룸: 상대). 가상 스크롤로 뷰포트만, 스크롤 아웃 시 **unsubscribe**. 동시 관찰 채널 수 **cap**, 집합 변경은 **배치** subscribe/unsubscribe, **재연결 시 현재 관심 집합 재수립**. 비용이 *인구*가 아니라 *렌더하는 것*에 비례 → §6.7 ACL 메모이즈와 상보적으로 subscribe-proxy Postgres 부하를 근본에서 제한(특히 카디널리티 큰 **구매사 비교·인박스** 면). 전부 push. (Centrifugo엔 "1채널+관심 ID 리스트" 네이티브 API가 없으므로 interest는 *구독 채널 집합의 동적 관리*로 구현; 풀 단일-피드 형태는 §15 A3.)
- **online 판정**: 상대 채널의 owner(self)가 1개 이상 연결돼 있는가. presenceStats의 단순 numClients는 **관찰자까지 세므로 쓰지 않는다** — §6.4의 `chan_info.role==='self'` 필터로 self만 카운트.

### 6.2 Layer 2 — 활동 (active / idle / fuzzy)

- **클라 활동 훅**(신규, ~30줄; 레포에 `visibilitychange`/`document.hidden` 사용 0건 확인): Page Visibility + pointer/keyboard 리스너로 last-interaction 추적. `document.hidden` 또는 무상호작용 **7분** 경과 → idle.
- **상태 전이 publish**(Discord식): 클라가 active↔idle 전이 시 자기 채널에 `{ state:'active'|'idle', at }` 를 publish. **관찰자는 publish하지 않는다**(read-only) — 그래야 채널에 owner 신원만 실린다(§6.4 보강).
- **재조정**: 늦게 구독한 관찰자는 (재)구독 onSubscribed 시 owner의 현재 상태를 presence info(또는 직전 상태 publication)로 동기화.
- **3-state 점**: owner 워크스페이스의 self 중 **하나라도 active** → active(초록); self는 있으나 전부 idle → idle(흐림 + "N분 전 활동", at에서 클라 계산); self 0 → offline(표시 없음).
- **fuzzy는 무DB**: `at`(last-active)은 **연결 중에만** 의미 — presence/publication에 실려 휘발. 연결이 끊기면 self 0 → 그냥 offline(표시 없음). 완전 오프라인 last-seen은 §15.
- **새 디자인 토큰**: idle 점(흐림/중립). `DESIGN.md` + `styles/tokens.css`에 추가(현재 토큰셋은 present/absent 2단계뿐).
- 면별 적용: 구매사-PG·딜룸은 3-state. 팀원 면은 3-state 가능(공짜) 또는 binary 유지(저위험) — 구현 시 택1, 기본 3-state.

### 6.3 표시 단위 (granularity)

- **상대/PG 닿음** = per-ws **binary**(self ≥1). 어느 개인이 접속했는지 노출 안 함.
- **팀원 로스터** = `presence:ws:<내ws>`의 self 항목(per-user, userId 포함 — 동일 ws라 안전). self는 자기 userId로 제외(내가 내 팀원 목록에 안 뜸).
- **딜룸 참여자 로스터** = 1:1 `chat:conversation:<id>` presence(상대측, per-user, 1:1이라 안전) + (M2) `team:rfp:<id>:<내ws>` presence(팀측). self는 userId로 제외.

### 6.4 🚨 봉인 누출 방지 (필수 — 옛 스펙에서 흡수)

A1에서 관찰자는 상대 ws 채널을 **직접 구독**한다. **같은 buyer의 RFP에 들어온 여러 PG가 모두 `presence:ws:<buyerWs>`를 공동 관찰**하면, Centrifugo `presence()`/join·leave가 구독자 info를 다른 구독자에게 노출 → PG들이 서로를 열거(=competitorCount 추론)할 수 있다. **이것이 핵심 누출 벡터다.**

**식별정보(identity) 차단:**
- **연결 토큰에 `meta:{ workspaceId }` 추가**(`issueCentrifugoConnectionToken(userId, workspaceId)`). `meta`는 연결에 귀속돼 subscribe-proxy 요청에 전달되지만 **다른 구독자에게 노출되지 않는다.**
- **subscribe-proxy가 채널별 `chan_info`를 세팅**:
  - 요청자 `meta.workspaceId === V`(자기 채널) → 허용 + `chan_info = { role:'self', userId }`.
  - `≠ V`(관찰) → ACL 통과 시 허용 + **식별정보 없는** `chan_info = { role:'observer' }`.
- online 판정·로스터는 `role==='self'` 항목만 사용. 관찰자는 서로의 정체를 알 수 없다.
- **활동 publication도 owner(self)만 송신**(§6.2) → 채널에 흐르는 publication 신원은 owner뿐. 관찰자 신원은 어디에도 안 실린다.

**잔여 위험(COUNT) — 검증 완료(2026-06-21), (b)vs(c) 결정 보류:**
- identity는 막아도 `presence()`/`presence_stats`/join·leave가 관찰자 **수(count)** 를 노출하면 약한 competitorCount(대략적 경쟁 수)가 샐 수 있다.
- ⚠️ **검증 결과: "owner의 join/leave만 관찰자에 push" 메커니즘은 Centrifugo v6 OSS에 없다.** `join_leave`/`force_push_join_leave`는 네임스페이스 단위 boolean이라 per-client/per-role 스코핑 불가. 따라서 **A1 공유 채널에선 count 완전 봉인 불가** — `allow_presence_for_subscriber=false`로 `presence()`/`presence_stats` 벡터는 닫아도 join/leave delta(±1)는 켜면 그대로 새고, 끄면 실시간성을 잃어 사실상 A3 폴링이 된다. → **"A1 내 완화로 count 봉인"(구 (a))은 불가로 기각.**
- 실 선택지는 둘:
  - **(b) 수용 + 값싼 경화**: `allow_presence_for_subscriber=false`(클라 enumerate 차단) + 점은 **boolean만 렌더**(숫자 금지) + `competitorCount`는 코드/DB에 영구 부재. identity 봉인, count는 거친 *watcher* 잔여(buyer self·구경꾼·좀비 탭 포함, 노이즈·상향 편향)로 수용.
  - **(c) A3 승급(§15)**: 관찰자가 공유 채널에 안 앉으므로 count까지 **구조적** 봉인. 비용·승급 트리거는 §15.
- **결정 보류**: (b) vs (c)는 사용자 검토 중. identity 봉인(chan_info)은 v1 필수로 확정.

### 6.5 신뢰성 (flap / 재조정)

- **비대칭 flap 디바운스**: online은 join/subscribed 시 **즉시**, offline은 leave 후 **4초 유예**(Pusher 3s / Liveblocks 5s 밴드) — join/subscribed/reconnect가 유예 타이머를 취소. (딜룸이 **인터셉트 모달**이라 열고닫을 때마다 재구독=깜빡임, 워크스페이스 전환은 호스트 넘는 하드 재연결 → 디바운스 필수.)
- **스냅샷 재조정**: 모든 presence 면에서 `subscribed`/reconnect/**window focus·visibilitychange** 시 권위 상태(서버 presence 또는 presence())로 재계산 — at-most-once join/leave 유실 자가 치유.
- ghost 창: 비정상 끊김은 ping/pong(~20–25s) + 잔여 TTL(~30s)로 ~30–35s 내 offline. 약속을 "정상 종료=즉시, 크래시=~30s 내 offline"로 명시(SCREEN_DESIGN).

### 6.6 인프라 (v1 = Memory, 사용자 결정 Q2)

- **Memory 엔진 유지.** presence는 순수 장식(아래 §9 억제 불변으로 알림에 영향 없음)이라 수용 가능: **매 `docker compose up -d centrifugo`(배포/재시작) 시 모든 점이 ~5–30s 사라졌다 자동 복구**(클라 재연결·재구독·재조정 후).
- **런북 단언**(`docs/DEPLOY_LIGHTSAIL.md`): "Memory presence는 **단일 Centrifugo 프로세스에서만 정확**. PM2 cluster/2노드 금지(프로세스별 presence 단편화, 재조정 불가)."
- **업그레이드 경로 명시**: 무깜빡임 배포·멀티노드가 필요해지면 `presence_manager:{ enabled:true, type:redis }`(chat fanout broker는 memory 유지) + Valkey/KeyDB 컨테이너 1개. DDL/코드 변화 없음.

### 6.7 토큰 / 재연결 경화

- ②의 eager `<PresenceClient/>`로 **모든 탭이 WS를 상시 보유**(지금은 채팅 보는 탭만). Centrifugo 재시작 시 전 탭이 동시에 재연결 → 토큰 재발급·subscribe ACL이 Postgres 직격.
- `app/api/centrifugo/connection-token/route.ts`: 토큰을 **세션/JWT 클레임에서 발급**(핫패스 Postgres 조회 제거 또는 revocation ~수초 캐시). `sub=userId`는 이미 JWT에 있음.
- `lib/server/realtime/token.ts`: `TOKEN_TTL` 10m → **30–60m**(실 ACL 경계는 subscribe-proxy이지 연결 토큰이 아님).
- `centrifuge-js` `minReconnectDelay`/`maxReconnectDelay` + jitter 지정 → 재시작 시 재연결을 수십 초로 분산.
- subscribe-proxy ACL을 `(requesterWsId, targetWsId)` 기준 ~60s 메모이즈.
- **출시 전 부하 테스트**: 단일 Centrifugo 재시작을 실제 동시 탭 수로 → Postgres 풀 관찰(가장 유력한 사고 벡터).

## 7. 컴포넌트 / 변경 지점

| 구성 | 파일 | 변경 | 단계 |
|---|---|---|---|
| 연결 토큰 발급 | `lib/server/realtime/token.ts` | payload에 `meta:{workspaceId}`, TTL 30–60m | M1 |
| 연결 토큰 라우트 | `app/api/centrifugo/connection-token/route.ts` | `session.user.workspaceId` 전달, 핫패스 DB 제거 | M1 |
| subscribe-proxy | `app/api/centrifugo/subscribe/route.ts` | `presence:ws:<V>` 분기(meta→self/observer 판별→ACL→`chan_info`). UUID 가드 + fail-closed. ACL 메모이즈 | M1 |
| repo: 활성 공유대화 | `lib/server/repositories/**` | `existsActiveConversationBetween(wsA, wsB)` 신규 | M1 |
| online 순수함수 | 신규 `lib/realtime/presence.ts` | `isWorkspaceOnline(entries)`(self 필터), `deriveActivity(entries) → 'active'|'idle'|'offline'` | M1 |
| Centrifugo config | `deploy/centrifugo/config.yaml` | `presence` 네임스페이스(+force_push_join_leave) + TTL/ping 튜닝 | M1 |
| config 드리프트 가드 | `deploy/__tests__/*.test.ts` | presence 네임스페이스 키 단언(기존 proxy-secret 테스트 미러) | M1 |
| 전역 self-broadcast | `components/shell/*` + 신규 `<PresenceClient/>` | 자기 ws 채널 구독(표시 없음), WS eager open | M1 |
| 관찰 Provider/훅 | 신규 `WorkspacePresenceProvider` + `useWorkspacePresence(wsId) → {online, activity}` | **viewport 관심 집합**만 구독(interest-based: cap·배치 subscribe/unsubscribe·재연결 재수립, §6.1), `Map` 유지, 비대칭 디바운스, focus 재조정 | M1 |
| 활동 훅 | 신규 `useActivityState()` | Page Visibility + 키/마우스, 7분 idle, 전이 publish | M2 |
| idle 토큰 | `DESIGN.md`, `styles/tokens.css` | idle(흐림) 점 토큰 | M2 |
| 인박스 목록 | `components/messages/ConversationList.tsx` | 행 아바타에 점(ThreadView 패턴) | M1 |
| 홈 위젯 | `components/home/RecentMessagesPanel.tsx` | 아바타에 점 | M1 |
| 스레드 헤더 | `components/messages/ThreadView.tsx` | 점 출처를 `useWorkspacePresence`로 교체 + 텍스트. **타이핑("입력 중…") 우선** → 아니면 활동 라벨 | M1 |
| 비교/선정 | 구매사 비교 화면 컴포넌트 | 각 PG 행에 3-state 점 | M2 |
| 딜룸 로스터 | 딜룸 ChatPanel/참여자 영역 | 1:1+팀 presence per-user 로스터 | M2 |

> 기존 `useChatChannel.online`(대화채널 numUsers>=2)은 헤더 점 용도에서 빠지고 타이핑·메시지 수신만 담당.

## 8. 데이터 흐름

1. 로그인 후 클라가 `/api/centrifugo/connection-token` 호출 → 토큰 `sub=userId`, `meta.workspaceId`.
2. `<PresenceClient/>` 마운트 → 자기 `presence:ws:<내ws>` 구독 → proxy가 self 판정 → `chan_info{role:'self',userId}` → presence 등록 + WS open.
3. 면 진입 → `WorkspacePresenceProvider`가 화면의 상대 ws id(중복 제거) 각각 구독 → proxy가 observer 판정 → `chan_info{role:'observer'}`.
4. join/leave/subscribed → (비대칭 디바운스) self 카운트 + 활동 publication 반영 → `Map<wsId,{online,activity}>` 갱신. focus/reconnect 시 권위 재조정.
5. 면 컴포넌트가 `useWorkspacePresence(wsId)` 구독 → 3-state 점/텍스트 렌더.

## 9. 이메일 억제 불변 (회귀 금지 — 옛 #8 폐기 확정)

`isUserPresentInConversation`(`lib/server/realtime/centrifugo.ts`)는 **대화 채널을 그대로 읽는다.** `presence:ws`로 **재포인팅 금지** — "아무 탭 열림"이 "그 대화를 봄"으로 넓어지면 `/home`만 떠 있고 그 대화를 안 연 사용자의 다이제스트가 취소돼 알림이 누락된다(팀챗 다이제스트는 presence 자체가 없음). presence:ws 멤버십은 **어떤 다이제스트도 취소하지 않는다.**
- 회귀 테스트(M1): 수신자가 `presence:ws`에 online이나 대화 채널 미구독 → 다이제스트 **여전히 발송**.

## 10. 단계

- **M1 (코어 online, binary)**: `presence:ws` 채널 + `meta/chan_info` 봉인 + force_push + 토큰/재연결 경화 + online 순수함수 + self-broadcast + 관찰 Provider + 비대칭 디바운스. 노출: 인박스 목록·홈·스레드 헤더(상대 binary). 억제 회귀 테스트. → 빠르게 ship.
- **M2 (활동 + roster + 확장 면)**: 활동 훅(3-state active/idle + fuzzy) + idle 토큰 + 구매사-PG 면 + 딜룸/팀 per-user 로스터.

## 11. 그레이스풀 디그레이데이션

- `NEXT_PUBLIC_CENTRIFUGO_WS_URL` 미설정(dev·테스트) → `getCentrifuge()` null → 구독 0, 점 없음, 정적 로더로 정상(기존 계약, `lib/realtime/centrifuge-client.ts`).
- subscribe-proxy 오류/미인가 → 해당 채널 deny → 그 상대 offline 표시(안전).

## 12. 테스트 계획 (TDD — RED 먼저)

- **순수함수** `isWorkspaceOnline`/`deriveActivity`: self 유/무, observer-only(=offline), 빈 맵, active>idle 우선, at→fuzzy 경계.
- **subscribe-proxy**: self 허용+`role:self`, 활성 공유대화 관찰 허용+`role:observer`(식별정보 없음), 비-상대 deny, 종결-only deny(활성 한정), 잘못된 UUID deny, 예외 fail-closed, **드리프트: 한 PG가 다른 PG의 `presence:ws` 구독 불가**(봉인 가드, pg-strip 패턴).
- **연결 토큰**: payload `meta.workspaceId` 포함, secret 없으면 throw, TTL 값.
- **repo** `existsActiveConversationBetween`: 활성/없음/종결-only (PGlite).
- **Provider/훅**: 미설정 no-op, map 갱신(모의 sub), **비대칭 디바운스**(online 즉시·offline 4s·취소), 중복 ws 단일 구독, focus 재조정.
- **활동 훅(M2)**: visibilitychange→idle, 7분 타이머, 전이 publish, self 제외.
- **컴포넌트**: ConversationList 점 유무, ThreadView 타이핑 우선순위·3-state·offline 무표시.
- **억제 회귀**(§9): presence:ws online이나 대화 미구독 → 다이제스트 발송.
- **config 드리프트**: `presence` 네임스페이스 + `force_push_join_leave` + TTL 키 존재.

## 13. 검증 필요 가정 (구현 시 — Centrifugo v6 실동작)

1. 연결 토큰 `meta` → subscribe-proxy 요청 전달 여부.
2. subscribe-proxy 응답 `result.info`(chan_info) → presence 항목 반영 + centrifuge-js presence 응답 노출 형태.
3. ✅ **검증 완료(2026-06-21, §6.4)**: `allow_presence_for_subscriber=false`로 `presence()`/`presence_stats` 벡터는 차단되나 join/leave delta로 count가 새며 **owner-only join/leave push는 OSS에 없음** → A1 내 count 봉인 불가. 남은 건 (b) 수용 vs (c) A3 승급 결정(보류).

위가 기대대로 아니면 **서버사이드 판정 폴백**(클라 presence 차단, 서버 X-API-Key presence read만) 또는 A3로 전환.

## 14. 배포

- `deploy/centrifugo/config.yaml`에 `presence` 네임스페이스 추가 → **컨테이너 재생성**(`docker compose up -d centrifugo`). 앱 재빌드 불필요. ⚠️ v6 스키마로(메모리 `project_centrifugo-proxy-secret-v6-footgun` — v5 키 조용히 무시), 기존 블록 미러.
- **DDL 0 / 신규 env 0**(proxy-secret·HMAC 기존 재사용). 연결 토큰 `meta` 추가는 하위 호환(chat/team 불변).
- ⚠️ 이 재시작이 **presence-깜빡임 이벤트**(§6.6) — 런북에 결합 명시.

## 15. 범위 밖 / 향후 (북극성)

- **완전 오프라인 last-seen**("마지막 접속 2시간 전"): 영속 필요 → `workspace_presence(last_seen_at)` 또는 멤버십 컬럼 + connect/disconnect proxy. v1은 연결-idle fuzzy까지만.
- **A3 (서버 fan-out 피드 = interest-based)**: 허브 fan-out 천장 또는 §6.4의 count 봉인이 필요하면 승급 — 관찰자가 공유 채널 대신 **자기 피드 1개** 구독, **클라가 visible 로스터(관심 ws 집합)를 서버에 선언**(Slack `presence_sub` 식) → 서버가 ACL 해소 후 **그 집합만** watch·diff·push(리컨실리에이션 폴러 ~5s `presence_stats` 스캔→diff→변화분만 피드 publish, `instrumentation.ts` 싱글턴 또는 PM2 앱). 관심 집합 밖 워크스페이스는 폴 자체를 안 하므로 *thundering herd*도 자동 완화. **A1의 viewport 관심 집합(§6.1)이 그대로 A3의 interest 선언이 된다** → 이행 시 표시·관심 로직 재사용. **표시 계약(`useWorkspacePresence(wsId)`)은 불변** — 전송만 교체, UI 변화 ≈0.
- 숨김/투명 모드.
