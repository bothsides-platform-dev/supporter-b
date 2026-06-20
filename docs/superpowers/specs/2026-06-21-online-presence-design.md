# 실시간 온라인 표시 (Online Presence) 설계

- **작성일**: 2026-06-21
- **상태**: 설계 확정 (구현 전)
- **supersedes**: `2026-06-20-workspace-online-presence-design.md` (삭제됨).
- **봉인 결정(중요)**: **presence 한정으로 PG↔PG 가시성을 허용한다** (2026-06-21 사용자 결정). 같은 RFP의 PG가 다른 PG의 *접속 상태·정체*를 알 수 있다. 이는 입찰 내용 봉인(`Bid.competitorCount does not exist by design`, 견적 금액·내용 비공개)과는 **별개** — 입찰 데이터 봉인은 그대로 유지하고, **온라인 점에 한해서만** 상호 노출을 허용한다. 덕분에 식별정보 익명화·count 봉인 기계장치가 전부 불필요해져 설계가 크게 단순해졌다.
- **관련 doc**: `SCREEN_DESIGN.md`(노출 면 갱신), `DESIGN.md`(idle 점 토큰 신설), `styles/tokens.css`(idle 점 토큰)

---

## 1. 배경 / 문제

현재 "온라인 표시"는 **채팅 스레드 헤더의 상대 아바타 우하단 초록 점 하나**가 전부다(`components/messages/ThreadView.tsx:313-320`). 판정은 Centrifugo가 **그 대화 채널**(`chat:conversation:<id>`)의 접속자 수가 2명인지로 한다(`lib/hooks/useChatChannel.ts:62-66`, `presenceStats().numUsers >= 2`).

지금 점의 의미는 *"상대가 앱에 접속 중"* 이 아니라 **"상대가 지금 이 대화방을 열어두고 있음"** 이다(WS가 lazy 연결). 사용자 요구는 **"앱 탭이 열려 있으면(페이지 무관) 온라인"** 이므로, 전역 신호가 필요하다.

## 2. 목표 / 비목표

**목표**
- **online 정의**: 앱 탭이 열려 있는 동안(어느 페이지든) 온라인. 닫으면 오프라인.
- 4개 면 노출: 1:1 상대방(인박스 목록·홈 위젯·스레드 헤더) / 같은 워크스페이스 팀원 / 구매사가 보는 각 초대 PG / 딜룸 참여자.
- **3-state 점**: active(초록) / idle(흐림, "N분 전 활동") / offline(표시 없음).
- **전부 push**(폴링 없음).

**비목표**
- 완전 오프라인(연결 끊김) last-seen("마지막 접속 2시간 전") — 영속(DB) 필요, §14.
- 숨김/투명 모드(invisible) — always-on.
- 멀티노드 / 무깜빡임 배포(Redis) — §6.5, v1은 Memory 수용.
- **입찰 내용 봉인은 본 설계 범위 밖** — 견적 금액·내용 비공개는 기존대로 유지. 본 설계는 *온라인 점*만 다루며 그 점에 한해 PG↔PG 노출을 허용한다(§3).

## 3. 확정된 결정 (브레인스토밍 기록)

| 결정 | 값 | 근거 |
|---|---|---|
| online 의미 | **앱 열림**(연결 생존), 페이지 무관 | 사용자 — "앱이 켜져있으면 online" |
| 노출 면 | 1:1 상대 + 팀원 + 구매사-PG + 딜룸 (4면) | 사용자 |
| 점 정밀도 | **3-state**(active/idle/offline) + idle fuzzy "N분 전" | 업계 표준(소켓 생존만으로 초록점 금지) |
| 딜룸 표시 단위 | **참여자 신원 roster**(per-user) | 사용자 |
| 프라이버시 | always-on, 숨김 없음 / fuzzy last-seen은 **연결-idle 한정**(무DB) | 사용자 |
| 인프라 | v1 **Memory 엔진**(Redis 미도입), 배포 시 ~수십초 점 공백 수용 | 사용자 |
| **PG↔PG presence** | **노출 허용**(점 한정) | 사용자(2026-06-21) — 봉인 기계장치 제거, 단순화 |
| 아키텍처 | **A1** (워크스페이스 채널 self-broadcast + 관찰) | §6 |

## 4. 업계 표준 근거 (조사 요약)

Slack·Teams·Discord·WhatsApp·Figma + Pusher·Ably·Phoenix·Centrifugo 공통 = **2-레이어, per-user 집계** 모델:
- **L1 연결 생존(online)**: 소켓 ≥1. TTL로 비정상 끊김 자가 치유(불변식 **TTL ≈ 갱신주기 ×2–3**). 멀티탭/기기 = OR 집계.
- **L2 active/away**: *소켓 생존만으로 초록점을 켜지 않는다.* 활동 = Page Visibility + 키/마우스, idle 5–10분(Slack 10·Teams 5·Discord 10).
- 불변식: presence **휘발(영속 금지)**, **flap 디바운스 필수**, join/leave는 UI 힌트 → 재연결 시 스냅샷 재조정.

## 5. 채널 토폴로지

| 채널 | 신규? | 용도 | 표시 단위 |
|---|---|---|---|
| `presence:ws:<wsId>` | **신규** | 워크스페이스 online 브로드캐스트 + 팀원 로스터 | 상대=binary / 팀원=per-user |
| `chat:conversation:<id>` | 기존 | 딜룸 상대측 참여자 로스터 + 활동 | per-user |
| `team:rfp:<rfpId>:<wsId>` | 기존(presence off) | 딜룸 팀측 참여자 로스터 (M2) | per-user |

핵심: **"이 회사 online인가(binary)"** 는 `presence:ws` 브로드캐스트로, **"이 딜룸에 누가 있나(per-user)"** 는 1:1/팀 채널 presence로 분리.

## 6. 아키텍처 (A1)

### 6.1 Layer 1 — 연결 생존 (online/offline)

- **새 채널** `presence:ws:<workspaceId>` = "이 워크스페이스의 누군가가 앱에 접속 중".
- **새 Centrifugo 네임스페이스** `presence` (`deploy/centrifugo/config.yaml`, 기존 `chat` 블록과 동일 v6 스키마 형식):
  - `presence: true`, `join_leave: true`, **`force_push_join_leave: true`**(없으면 join/leave가 구독자에 전달 안 됨 — 에러 0인데 점 죽음), `subscribe_proxy_enabled: true`.
  - 명시 튜닝: `presence_ttl: 30s`, 클라 `ping_interval: 20s` / `pong_timeout: 5s` → 비정상 끊김 ghost 창 ~30–35s.
- **연결 토큰에 `info:{ workspaceId }`** (`issueCentrifugoConnectionToken(userId, activeWorkspaceId)`). 연결의 모든 presence 엔트리가 이 workspaceId를 달고 다닌다. (봉인을 안 하므로 평범하게 노출 — 단순함의 핵심.)
- **self-broadcast**: 앱 진입 시 모든 인증 사용자가 자기 `presence:ws:<내ws>` 구독 → "나 접속 중" 등록 + 팀원 로스터. `<PresenceClient/>`를 `(app)` 셸에 마운트 — **WS를 즉시 연다**(지금은 lazy).
- **관찰 (interest-based, Slack `presence_sub` 규율)**: 각 면이 **지금 화면에 렌더되는** 상대/PG의 `presence:ws:<V>`만 구독 — viewport 관심 집합(인박스: viewport 대화 행 / 비교: viewport PG 행 / 딜룸: 상대). 가상 스크롤로 뷰포트만, 스크롤 아웃 시 unsubscribe. 동시 채널 수 **cap**, **배치** subscribe/unsubscribe, **재연결 시 관심 집합 재수립**. 비용이 인구 아닌 *렌더하는 것*에 비례.
- **online 판정 (단일 규칙)**: `presence:ws:<V>`의 presence 맵에서 **`info.workspaceId === V`인 엔트리가 ≥1** 이면 V online. (관찰자는 workspaceId가 V가 아니라 자연 제외 — 역할 태그·익명화 불필요, *그냥 비교*.) 초기 스냅샷은 클라가 `presence()` 직접 호출, 이후 join/leave로 라이브.

### 6.2 Layer 2 — 활동 (active / idle / fuzzy)

- **클라 활동 훅**(신규, ~30줄; 레포에 `visibilitychange`/`document.hidden` 사용 0건): Page Visibility + pointer/keyboard로 last-interaction 추적. `document.hidden` 또는 무상호작용 **7분** → idle.
- **상태 전이 publish**: 클라가 active↔idle 전이 시 자기 채널에 `{ state, at }` publish. 관찰자는 publish하지 않음(read-only).
- **재조정**: 늦게 구독한 관찰자는 (재)구독 onSubscribed 시 owner 현재 상태를 presence info(또는 직전 publication)로 동기화.
- **3-state 점**: V의 owner(workspaceId===V) 엔트리 중 **하나라도 active** → active(초록); 있으나 전부 idle → idle(흐림 + "N분 전 활동", `at`에서 클라 계산); 0 → offline.
- **fuzzy는 무DB**: `at`은 연결 중에만 의미 — presence/publication에 실려 휘발. 끊기면 offline. 완전 오프라인 last-seen은 §14.
- **새 디자인 토큰**: idle 점(흐림/중립). `DESIGN.md` + `styles/tokens.css`(현재 present/absent 2단계뿐).
- 면별: 구매사-PG·딜룸 3-state. 팀원 면은 3-state 또는 binary 택1(기본 3-state).

### 6.3 표시 단위 (granularity)

- **상대/PG 닿음** = `presence:ws:<V>`에 owner 엔트리 ≥1 (**binary**). 어느 개인인지까지는 표시 안 함(원하면 per-user도 가능 — workspaceId+userId 둘 다 info에 있음).
- **팀원 로스터** = `presence:ws:<내ws>`에서 `workspaceId===내ws`인 엔트리의 userId(per-user). self는 자기 userId로 제외.
- **딜룸 참여자 로스터** = 1:1 `chat:conversation:<id>` presence(상대측) + (M2) `team:rfp:<id>:<내ws>` presence(팀측). self는 userId로 제외.

### 6.4 신뢰성 (flap / 재조정)

- **비대칭 flap 디바운스**: online은 join/subscribed 시 **즉시**, offline은 leave 후 **4초 유예** — join/subscribed/reconnect가 유예 취소. (딜룸이 **인터셉트 모달**이라 열고닫을 때 재구독=깜빡임, 워크스페이스 전환은 호스트 넘는 하드 재연결 → 디바운스 필수.)
- **스냅샷 재조정**: 모든 면에서 `subscribed`/reconnect/**window focus·visibilitychange** 시 `presence()`로 재계산 — at-most-once join/leave 유실 자가 치유.
- ghost 창: 비정상 끊김은 ping/pong(~20–25s) + 잔여 TTL(~30s)로 ~30–35s 내 offline. 약속을 "정상 종료=즉시, 크래시=~30s 내 offline"로 명시(SCREEN_DESIGN).

### 6.5 인프라 (v1 = Memory)

- **Memory 엔진 유지.** presence는 순수 장식(§9 억제 불변으로 알림 무관)이라 수용: **매 `docker compose up -d centrifugo` 시 모든 점이 ~5–30s 사라졌다 자동 복구**.
- **런북 단언**(`docs/DEPLOY_LIGHTSAIL.md`): "Memory presence는 **단일 Centrifugo 프로세스에서만 정확**." 멀티노드/cluster 금지.
- **업그레이드 경로**: 멀티노드·무깜빡임이 필요해지면 `presence_manager:{ enabled:true, type:redis }` + Valkey 컨테이너. DDL/코드 변화 없음.

### 6.6 토큰 / 재연결 경화

- eager `<PresenceClient/>`로 **모든 탭이 WS를 상시 보유** → Centrifugo 재시작 시 전 탭이 동시에 재연결.
- `connection-token` 라우트: 토큰을 **세션/JWT 클레임에서 발급**(핫패스 Postgres 조회 제거 또는 revocation ~수초 캐시).
- `TOKEN_TTL` 10m → **30–60m**(실 ACL 경계는 subscribe-proxy).
- `centrifuge-js` `minReconnectDelay`/`maxReconnectDelay` + jitter → 재연결 분산.
- subscribe-proxy ACL을 `(requesterWsId, targetWsId)` ~60s 메모이즈.
- **출시 전 부하 테스트**: 단일 Centrifugo 재시작을 실제 동시 탭 수로 → Postgres 풀 관찰.

## 7. 컴포넌트 / 변경 지점

| 구성 | 파일 | 변경 | 단계 |
|---|---|---|---|
| 연결 토큰 발급 | `lib/server/realtime/token.ts` | payload에 `info:{workspaceId}`, TTL 30–60m | M1 |
| 연결 토큰 라우트 | `app/api/centrifugo/connection-token/route.ts` | `session.user.workspaceId` 전달, 핫패스 DB 제거 | M1 |
| subscribe-proxy | `app/api/centrifugo/subscribe/route.ts` | `presence:ws:<V>` 분기: **기존 ACL allow/deny만**(멤버 OR 카운터파티). UUID 가드 + fail-closed. ACL 메모이즈. 역할/chan_info 계산 없음 | M1 |
| repo: 활성 공유대화 | `lib/server/repositories/**` | `existsActiveConversationBetween(wsA, wsB)` 신규 | M1 |
| online 순수함수 | 신규 `lib/realtime/presence.ts` | `onlineWorkspaceIds(entries)`, `deriveActivity(entries, V) → 'active'|'idle'|'offline'` | M1 |
| Centrifugo config | `deploy/centrifugo/config.yaml` | `presence` 네임스페이스(+force_push_join_leave) + TTL/ping 튜닝 | M1 |
| config 드리프트 가드 | `deploy/__tests__/*.test.ts` | presence 네임스페이스 키 단언 | M1 |
| 전역 self-broadcast | `components/shell/*` + 신규 `<PresenceClient/>` | 자기 ws 채널 구독, WS eager open | M1 |
| 관찰 Provider/훅 | 신규 `WorkspacePresenceProvider` + `useWorkspacePresence(wsId) → {online, activity}` | **viewport 관심 집합**만 구독(interest-based: cap·배치·재연결 재수립, §6.1), `Map` 유지, 비대칭 디바운스, focus 재조정 | M1 |
| 활동 훅 | 신규 `useActivityState()` | Page Visibility + 키/마우스, 7분 idle, 전이 publish | M2 |
| idle 토큰 | `DESIGN.md`, `styles/tokens.css` | idle(흐림) 점 토큰 | M2 |
| 인박스 목록 | `components/messages/ConversationList.tsx` | 행 아바타에 점, viewport 관찰 | M1 |
| 홈 위젯 | `components/home/RecentMessagesPanel.tsx` | 아바타에 점 | M1 |
| 스레드 헤더 | `components/messages/ThreadView.tsx` | 점 출처를 `useWorkspacePresence`로 교체. **타이핑 우선** | M1 |
| 비교/선정 | 구매사 비교 화면 | 각 PG 행에 3-state 점, viewport 관찰 | M2 |
| 딜룸 로스터 | 딜룸 ChatPanel/참여자 영역 | 1:1+팀 presence per-user 로스터 | M2 |

> 기존 `useChatChannel.online`(대화채널 numUsers>=2)은 헤더 점 용도에서 빠지고 타이핑·메시지 수신만 담당.

## 8. 데이터 흐름

1. 로그인 후 클라가 `/api/centrifugo/connection-token` 호출 → 토큰 `sub=userId`, `info.workspaceId`.
2. `<PresenceClient/>` 마운트 → 자기 `presence:ws:<내ws>` 구독 → presence 등록(엔트리에 workspaceId) + WS open.
3. 면 진입 → `WorkspacePresenceProvider`가 화면의 상대 ws id(중복 제거, viewport) 각각 구독.
4. 초기 `presence()` → `info.workspaceId===V` 엔트리 ≥1 ? → online. 이후 join/leave/활동 publication → (비대칭 디바운스) `Map<wsId,{online,activity}>` 갱신. focus/reconnect 시 재조정.
5. 면 컴포넌트가 `useWorkspacePresence(wsId)` 구독 → 3-state 점/텍스트.

## 9. 이메일 억제 불변 (회귀 금지)

`isUserPresentInConversation`(`lib/server/realtime/centrifugo.ts`)는 **대화 채널을 그대로 읽는다.** `presence:ws`로 **재포인팅 금지** — "아무 탭 열림"이 "그 대화를 봄"으로 넓어지면 다이제스트가 잘못 취소돼 알림 누락. presence:ws 멤버십은 **어떤 다이제스트도 취소하지 않는다.**
- 회귀 테스트(M1): 수신자가 `presence:ws`에 online이나 대화 채널 미구독 → 다이제스트 **여전히 발송**.

## 10. 단계

- **M1 (코어 online, binary)**: `info:{workspaceId}` 토큰 + `presence:ws` 채널 + force_push + 토큰/재연결 경화 + online 순수함수 + self-broadcast + 관찰 Provider(interest-based) + 비대칭 디바운스. 노출: 인박스 목록·홈·스레드 헤더(상대 binary). 억제 회귀 테스트.
- **M2 (활동 + roster + 확장 면)**: 활동 훅(3-state + fuzzy) + idle 토큰 + 구매사-PG 면 + 딜룸/팀 per-user 로스터.

## 11. 그레이스풀 디그레이데이션

- `NEXT_PUBLIC_CENTRIFUGO_WS_URL` 미설정(dev·테스트) → `getCentrifuge()` null → 구독 0, 점 없음, 정적 로더 정상.
- subscribe-proxy 오류/미인가 → 해당 채널 deny → 그 상대 offline 표시(안전).

## 12. 테스트 계획 (TDD — RED 먼저)

- **순수함수** `onlineWorkspaceIds`/`deriveActivity`: workspaceId 그룹핑(owner vs 관찰자 혼재 맵에서 V만 추출), 빈 맵, active>idle 우선, `at`→fuzzy 경계, 관찰자만=offline.
- **subscribe-proxy**: `presence:ws:<V>` self(멤버) 허용, 카운터파티 허용, 비관계 deny, 잘못된 UUID deny, 예외 fail-closed.
- **연결 토큰**: payload `info.workspaceId` 포함, secret 없으면 throw, TTL 값.
- **repo** `existsActiveConversationBetween`: 활성/없음/종결-only (PGlite).
- **Provider/훅**: 미설정 no-op, map 갱신, **비대칭 디바운스**(online 즉시·offline 4s·취소), 중복 ws 단일 구독, viewport in/out 시 sub/unsub, focus 재조정.
- **활동 훅(M2)**: visibilitychange→idle, 7분 타이머, 전이 publish, self 제외.
- **컴포넌트**: ConversationList 점 유무, ThreadView 타이핑 우선순위·3-state·offline 무표시.
- **억제 회귀**(§9): presence:ws online이나 대화 미구독 → 다이제스트 발송.
- **config 드리프트**: `presence` 네임스페이스 + `force_push_join_leave` + TTL 키 존재.

## 13. 검증 필요 가정 (구현 시 — Centrifugo v6)

1. 연결 토큰 `info`(conn_info) → presence 엔트리에 그대로 노출되는지(centrifuge-js presence 응답의 `connInfo` 형태). 표준 기능이나 단위/통합 확인.
2. `force_push_join_leave` 켰을 때 join/leave가 구독자에 실제 전달되는지(드리프트 가드 + 통합).

> 봉인 관련 검증(meta→proxy, chan_info 익명화, count 노출)은 PG↔PG 노출 허용으로 **불필요**해져 제거됨.

## 14. 배포

- `deploy/centrifugo/config.yaml`에 `presence` 네임스페이스 추가 → **컨테이너 재생성**(`docker compose up -d centrifugo`). 앱 재빌드 불필요. ⚠️ v6 스키마로(메모리 `project_centrifugo-proxy-secret-v6-footgun`), 기존 블록 미러.
- **DDL 0 / 신규 env 0**. 연결 토큰 `info` 추가는 하위 호환(chat/team 불변).
- ⚠️ 이 재시작이 **presence-깜빡임 이벤트**(§6.5) — 런북에 결합 명시.

## 15. 범위 밖 / 향후

- **완전 오프라인 last-seen**: 영속 필요 → `workspace_presence(last_seen_at)` 또는 멤버십 컬럼 + connect/disconnect proxy. v1은 연결-idle fuzzy까지만.
- **A3 (서버 fan-out 피드 = interest-based)** — *순수 확장(scaling)용*: 허브 fan-out 천장(인기 ws 채널에 관찰자 폭증)이 단일 프로세스 한계에 닿으면 승급. 관찰자가 공유 채널 대신 자기 피드 1개 구독 + 클라가 visible 로스터 선언 → 서버가 그 집합만 watch·push. A1의 viewport 관심 집합(§6.1)이 그대로 interest 선언으로 재사용, 표시 계약(`useWorkspacePresence`) 불변. 봉인 목적은 더 이상 없음 — 순전히 fan-out 비용 때문.
- 숨김/투명 모드.
