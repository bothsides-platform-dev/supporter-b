# 실시간 온라인 표시 (Online Presence) 설계

- **작성일**: 2026-06-21
- **개정**: 2026-06-21 **rev3** (아래 "변경 이력" 참조 — rev2 위에 `/plan-eng-review` 결과 반영)
- **상태**: 설계 확정 (구현 전) — 아키텍처 락인 완료
- **supersedes**: `2026-06-20-workspace-online-presence-design.md` (삭제됨).
- **봉인 결정(중요)**: **presence는 ACL 없이 완전 공개로 설계한다** (2026-06-21 rev2). presence 채널은 *접속 중인지(online)* 만 다루며, 인증된 사용자라면 누구나 임의 워크스페이스의 online 여부를 관찰할 수 있다(서버측 관계 검증 없음). 입찰 내용 봉인(`Bid.competitorCount does not exist by design`, 견적 금액·내용 비공개)과는 **완전히 별개** — 입찰 데이터 봉인은 그대로 유지하고 온라인 점에 한해서만 전면 공개한다. 연결 자체는 인증 JWT가 게이트한다(비인증 접근 불가).
- **last-seen 결정(중요)**: **오프라인 "마지막 접속" 표시는 하지 않는다** (rev2). 어떤 면에서도 시간 텍스트를 표기하지 않는다. presence는 **점(dot)만** — active / idle / offline 3-state 시각 신호. last-seen 영속 레이어(테이블·disconnect/heartbeat·버킷) 전부 삭제 → **DDL 0**.
- **관련 doc**: `SCREEN_DESIGN.md`(노출 면), `DESIGN.md`(idle 점 토큰), `styles/tokens.css`(idle 점 토큰)

---

## 변경 이력

### rev3 (2026-06-21) — `/plan-eng-review` 아키텍처 락인

rev2를 `/plan-eng-review`(4섹션 + 외부 보이스)로 검증. **Centrifugo v6 공식 문서 검증 결과 rev2의 핵심 가정 하나가 틀렸음**이 드러나 교정 — v6는 client subscribe·publish를 **기본 거부**(`103 permission denied`)한다(https://centrifugal.dev/docs/server/channel_permissions). "proxy 없음 = 공개"는 오류였다.

| # | 결정 | 출처 |
|---|---|---|
| A1 | presence 네임스페이스에 **`allow_subscribe_for_client: true`** (proxy 미설정만으론 subscribe 전부 거부 = 점 사망) | 아키텍처 §1 |
| A2 | 활동 전이는 **client publish**(`allow_publish_for_subscriber: true`). 관찰자는 publisher `connInfo.workspaceId===V` 인 publication만 반영(스푸핑 차단) | 아키텍처 §2 |
| A3 | 늦은 관찰자 활동 복구는 **`history_size: 1`**(+짧은 `history_ttl`). rev2의 owner-gossip **삭제**(join-storm 시 publish 증폭) | 아키텍처 §3 |
| C1 | 재연결 폭주 세션-게이트 캐시는 **토큰 라우트 로컬**(공유 `session.ts` 미캐시 → 서버액션 폐기 SLA 불변) | 코드품질 §1 |
| C2 | 관찰 Provider와 `useCentrifugoSubscription`은 **공유 `managedSubscribe` 프리미티브** 위에 구축 | 코드품질 §2 |
| T1 | **얇은 통합 스모크 테스트**(CI에서 ephemeral Centrifugo) — mock 유닛이 못 잡는 v6 권한/전달 동작 검증(타이핑 침묵 실패를 잡았을 클래스) | 테스트 |
| P1 | focus 재조정 `presence()` 스윕은 **조건부**(끊김 후 또는 탭 숨김 >30s) — 매 focus 전체 스윕 금지 | 성능 |
| OV2 | **`team` 네임스페이스에 `presence:true`+`join_leave:true`** 추가(M2 딜룸 팀-로스터가 비-presence 네임스페이스라 빈 결과) | 외부보이스 |
| OV4 | 워크스페이스 전환 시 **`client.disconnect()`/리셋** + 싱글턴 토큰 의존성 명문화(in-tab 전환이 stale workspaceId 브로드캐스트 방지) | 외부보이스 |
| OV6 | `deriveActivity`가 `{state}` enum **엄격 검증** + presence 네임스페이스 **per-client publish rate limit**(공개 채널 flood 방어) | 외부보이스 |
| OV7 | 폐기 즉시성: TTL 30m 유지 **+ sv-bump 시 Centrifugo HTTP `disconnect` 호출**(상시 소켓이 재연결 안 해 ≤30m 폐기창 → 즉시 강제 종료) | 외부보이스 |
| OV8 | 데모/샘플 제외를 **M1**에 적용(self-broadcast가 M1라 demo 멤버가 M1부터 online 브로드캐스트) | 외부보이스 |
| BUG | **타이핑 인디케이터 prod 침묵 실패 동시 수정**: `chat` 네임스페이스에도 `allow_publish_for_subscriber: true`(`useChatChannel.ts:108` client publish가 권한 없어 `103` 거부 중) | 외부보이스 |

### rev2 (2026-06-21) — 사용자 결정 2건

- **D1. presence 완전 공개(ACL 제거).** rev1의 `existsActiveConversationBetween` 게이트 + subscribe-proxy presence 분기 삭제. (rev1이 "같은 RFP PG 상호 노출"을 ACL로 구현하려다 모순 — 전면 공개로 일원화.)
- **D2. last-seen 텍스트·영속 삭제.** rev1 M3 레이어 전체 제거 → DDL 0 복원.
- + 리뷰 반영: `presence_ttl` 유령 키 제거(ghost창 실재노브 재정박), 토큰 sv/email 게이트 보존, pending/suspended 의도적 offline.

---

## 1. 배경 / 문제

현재 "온라인 표시"는 채팅 스레드 헤더의 상대 아바타 우하단 점 하나(`components/messages/ThreadView.tsx:314-320`, `online &&` 게이트)가 전부다. 판정은 Centrifugo가 **그 대화 채널**(`chat:conversation:<id>`)의 접속자 수가 2명인지로 한다(`lib/hooks/useChatChannel.ts:62-66`, `presenceStats().numUsers >= 2`).

지금 점의 의미는 *"상대가 앱에 접속 중"* 이 아니라 **"상대가 지금 이 대화방을 열어두고 있음"** 이다(WS lazy 연결). 요구는 **"앱 탭이 열려 있으면(페이지 무관) 온라인"** 이므로 전역 신호가 필요하다.

## 2. 목표 / 비목표

**목표**
- **online 정의**: 앱 탭이 열려 있는 동안(어느 페이지든) 온라인. 닫으면 오프라인.
- 4개 면 노출: 1:1 상대방(인박스 목록·홈 위젯·스레드 헤더) / 같은 워크스페이스 팀원 / 구매사가 보는 각 **초대** PG(비교/선정 화면) / 딜룸 참여자.
- **3-state 점**: active(초록 solid) / idle(흐림 hollow) / offline(점 없음). **시간 텍스트 없음**.
- **전부 push**(폴링 없음).

**비목표**
- offline last-seen / 마지막 접속 시각·idle 활동 시각 텍스트 — 표시·영속 없음(D2).
- presence ACL — 없음(완전 공개, D1). 연결 JWT만이 게이트.
- **PG 오픈 게시판(`/opportunities`) presence — 범위 밖**(4개 면에 미포함). 게시판은 최소 whitelist(구매사명·제목·홈페이지) 봉인면이라, 거기 라이브 점을 추가하는 건 별도 제품 결정(§14).
- 숨김/투명 모드 — always-on.
- 멀티노드 / 무깜빡임(Redis) — §6.5, v1은 Memory 수용.
- 입찰 내용 봉인은 범위 밖(기존 유지).

## 3. 확정된 결정

| 결정 | 값 | 근거 |
|---|---|---|
| online 의미 | 앱 열림(연결 생존), 페이지 무관 | 사용자 |
| 노출 면 | 1:1 상대 + 팀원 + 구매사-초대PG + 딜룸 (4면) | 사용자 |
| 점 정밀도 | 3-state, 시간 텍스트 없음 | 사용자(rev2) |
| presence ACL | 없음 — 완전 공개(`allow_subscribe_for_client`) | 사용자 D1 + v6 권한 모델 |
| offline last-seen | 표시·영속 없음, DDL 0 | 사용자 D2 |
| 활동 전송 | client publish, `connInfo.workspaceId===V` 필터 | rev3 A2 |
| 활동 복구 | `history_size:1` (gossip 폐기) | rev3 A3 |
| 딜룸 표시 단위 | 참여자 신원 roster(per-user) | 사용자 |
| 인프라 | v1 Memory 엔진(단일 프로세스) | 사용자 |
| 아키텍처 | A1 (워크스페이스 채널 self-broadcast + 관찰) | §6 |

## 4. 업계 표준 근거 (요약)

Slack·Teams·Discord·Figma + Pusher·Ably·Centrifugo 공통 = **2-레이어 per-user 집계**: L1 연결 생존(소켓 ≥1, TTL 자가치유, 멀티탭 OR), L2 active/away(소켓 생존만으로 초록점 금지 — Page Visibility + 키/마우스, idle 5–10분). 불변식: presence 휘발(영속 금지 — last-seen 안 쓰므로 100% 준수), flap 디바운스, 재연결 시 스냅샷 재조정.

## 5. 채널 토폴로지

| 채널 | 신규? | 권한 모델 | 용도 | 표시 단위 |
|---|---|---|---|---|
| `presence:ws:<wsId>` | **신규** | `allow_subscribe_for_client`(공개) + client publish | 워크스페이스 online + 활동 + 팀원 로스터 | 상대=binary / 팀원=per-user |
| `chat:conversation:<id>` | 기존 | subscribe-proxy(ACL) | 딜룸 상대측 로스터 + 활동 | per-user |
| `team:rfp:<rfpId>:<wsId>` | 기존 + **presence 추가(M2, OV2)** | subscribe-proxy(ACL) | 딜룸 팀측 로스터 | per-user |

presence 채널만 공개; 딜룸 로스터 채널(chat/team)은 기존 ACL 유지(봉인). team 채널은 ACL은 그대로 두고 `presence:true`+`join_leave:true`만 켠다(M2 로스터용).

## 6. 아키텍처 (A1)

### 6.1 Layer 1 — 연결 생존 (online/offline)

- **새 채널** `presence:ws:<workspaceId>` = "이 워크스페이스의 누군가가 앱에 접속 중".
- **새 Centrifugo 네임스페이스** `presence` (`deploy/centrifugo/config.yaml`, 기존 `chat` 블록 미러):
  - `presence: true`, `join_leave: true`, **`force_push_join_leave: true`**(v6 기본 false; 라이브 join/leave 전달용 — **통합 스모크로 실제 필요성 검증 후 chat/team에도 일관 적용**, OV3).
  - **`allow_subscribe_for_client: true`** — v6는 client subscribe를 기본 거부(`103`)하므로 proxy 미설정만으론 모든 구독이 거부돼 점이 사망한다. 이 키가 D1 "공개"의 v6 표현("allows all authenticated non-anonymous connections to subscribe"). subscribe-proxy는 쓰지 않는다(앱 round-trip·ACL 없음).
  - **`allow_publish_for_subscriber: true`** — 활동 {state} client publish 허용(§6.2). 공개 채널이므로 flood 방어로 **per-client publish rate limit** 명시(v6 `channel` client publish 한도).
  - **`history_size: 1` + 짧은 `history_ttl`(예: 60s)** — 늦은 관찰자 활동 복구(§6.2).
  - **`presence_ttl`은 쓰지 않는다**(v6 채널 옵션 아님 — unknown key로 조용히 무시되는 2026-06-20 footgun 부류). 신선도는 서버 전역 `client.ping_interval`/`pong_timeout`이 지배(§6.4).
- **연결 토큰에 `info:{ workspaceId }`** (`issueCentrifugoConnectionToken(userId, activeWorkspaceId)`). presence 엔트리의 `connInfo`로 노출. chat/team 동작 불변(하위호환).
- **self-broadcast**: 셸 진입 가능 사용자가 자기 `presence:ws:<내ws>` 구독 → 등록 + 팀원 로스터. `<PresenceClient/>`를 `app/(app)/layout.tsx`(`ToasterProvider`/`CommandPalette` 옆)에 마운트 — **WS eager open**. **단, `isDemo`/`isSample` 워크스페이스는 마운트·관찰 제외**(OV8 — self-broadcast가 M1라, 데모 운영자가 M1부터 online으로 새는 것 차단; `lib/server/workspaces/search.ts` 데모 제외 선례 미러). pending/suspended/미인증은 셸 가드가 마운트 전 리다이렉트 + 토큰 라우트 401/403 백스톱 = 의도적 offline.
- **싱글턴 토큰 의존성(OV4)**: `getCentrifuge()`는 프로세스-수명 싱글턴이고 `getToken`이 생성 시 1회 바인딩된다(`centrifuge-client.ts:38-50`). 토큰의 `info.workspaceId`가 고정되므로 **워크스페이스 전환은 반드시 연결을 끊어야** 한다. 현재 `switchWorkspaceAction`이 하드 내비(`window.location.assign`)라 탭이 헐려 안전하지만, 이 의존을 명문화하고 **전환 경로에 `client.disconnect()`(또는 `__resetCentrifuge`) 추가**(누가 `router.refresh()`로 바꿔도 stale workspace 브로드캐스트 방지).
- **관찰 (interest-based)**: 각 면이 viewport에 렌더되는 상대/PG의 `presence:ws:<V>`만 구독. 스크롤 아웃 시 unsubscribe. 동시 채널 **cap = 50**(초과 시 온스크린 우선·오프스크린 오래된 것 evict), **배치**(트레일링 ~150ms), **재연결 시 관심집합 재수립**. viewport 추적은 `IntersectionObserver` 수동(가상스크롤 라이브러리 없음).
- **online 판정 (단일 규칙)**: `presence:ws:<V>` 맵에서 **`connInfo.workspaceId === V` 엔트리 ≥1** 이면 V online. (관찰자는 자기 workspaceId라 자연 제외. `connInfo` 누락/위조 = fail-closed = not online.) 초기 스냅샷 `presence()`, 이후 join/leave 라이브.
- **관찰자가 맵에 나타남(수용)**: presence 활성 채널은 구독자 전원이 맵에 등장. online 판정은 `workspaceId===V` 필터라 무영향. "누가 누구를 보는가" 노출은 D1 공개 하 무해로 수용(제거하려면 §14 A3 서버 fan-out).

### 6.2 Layer 2 — 활동 (active / idle, 점만)

- **클라 활동 훅**(신규 `useActivityState`, ~30줄; 레포 `visibilitychange`/`document.hidden` 사용 0건): Page Visibility + pointer/keyboard로 last-interaction 추적(포인터는 스로틀). `document.hidden` 또는 무상호작용 **7분** → idle. 모바일 백그라운드 타이머 스로틀 보완으로 `visibilitychange:hidden`을 **즉시 idle** 트리거로 병용.
- **전이 전송 (client publish, A2)**: active↔idle 전이 시 클라가 자기 채널에 `{ state }` publish. presence 네임스페이스 `allow_publish_for_subscriber`로 허용. 관찰자는 read-only(publish 안 함).
- **속성 안전 + 검증 (A2/OV6)**: 관찰자는 publication의 publisher `connInfo.workspaceId === V` 인 것만 V 활동으로 반영 → 다른 워크스페이스가 V 활동을 위조 불가(자기 워크스페이스 한정). **`deriveActivity`는 `{state}`를 `'active'|'idle'` enum으로 엄격 검증**, 그 외 payload는 무시(공개 publish 채널의 garbage/oversize 방어). flood는 per-client publish rate limit + 부하테스트(§6.6)로 방어.
- **늦은 관찰자 복구 (history, A3)**: `connInfo`는 연결 시 고정이라 활동을 못 싣고, gossip은 join-storm 시 publish 증폭이라 폐기. → presence 네임스페이스 `history_size:1`로 owner의 마지막 `{state}` 보존, 늦은 구독자가 `subscription.history({limit:1})`로 현재 상태 시드(가능하면 **subscription recovery**로 subscribe 응답에 실어 별도 round-trip 절감), 이후 라이브. 추가로 `subscribed`/reconnect/조건부 focus(§6.4) 재조정. `deriveActivity` 기본값: owner 엔트리는 있으나 활동 미관측 = **unknown = idle(초록 아님)**.
- **3-state 점**: owner(workspaceId===V) 엔트리 중 하나라도 active → active(초록 solid); 있으나 전부 idle/unknown → idle(흐림 hollow); 0 → offline(점 없음). **시간 텍스트 없음.**
- **디자인 토큰**: idle 점(흐림/중립, active와 시각 구분). `DESIGN.md` + `styles/tokens.css`. **a11y**: 색상 전용 금지 — 상태별 `aria-label`("온라인"/"자리 비움"/offline은 점 미렌더), idle 토큰 비텍스트 대비 ≥3:1 검증(DESIGN.md AA-주의 팔레트).

### 6.3 표시 단위 (granularity)

- **상대/PG 닿음** = `presence:ws:<V>` owner 엔트리 ≥1 (**binary**).
- **팀원 로스터** = `presence:ws:<내ws>` 의 `workspaceId===내ws` 엔트리 userId(per-user). self 제외.
- **딜룸 참여자 로스터** = 1:1 `chat:conversation:<id>` presence(상대측) + (M2) `team:rfp:<id>:<내ws>` presence(팀측, **OV2로 team 네임스페이스 presence 활성 필요**). self 제외.
- **offline** = 점 없음. 시각·텍스트 없음(D2).

### 6.4 신뢰성 (flap / 재조정 / ghost 창)

- **비대칭 flap 디바운스**: online 즉시, offline은 leave 후 `OFFLINE_DEBOUNCE_MS(=4000)` 유예(join/subscribed/reconnect가 취소). 워크스페이스 전환은 다른 채널 이동이라 정상 leave(flap 아님). 관찰자 join은 V의 offline 유예 취소 안 함(workspaceId 필터).
- **스냅샷 재조정 (조건부, P1)**: `subscribed`/reconnect 시 `presence()` 재계산. **focus/visibilitychange는 조건부** — 마지막 스윕 이후 끊김/재연결이 있었거나 탭이 >30s 숨겨졌던 경우에만 `presence()` 스윕(트레일링 ~250ms). 건강한 전경 탭 전환에선 스킵(라이브 join/leave가 이미 정확). `lastHiddenAt`/`missedEvents` 플래그로 판정.
- **ghost 창 (정직)**: 비정상 끊김 offline 전환은 v6 실재 노브 지배 — `client.ping_interval`(~25s) + `pong_timeout`(~8s) + 서버 presence 갱신(~25s). 좁히려면 명시 튜닝. 약속: **"정상 종료=즉시, 크래시=최대 ~60s 내 offline"**(SCREEN_DESIGN 명시).

### 6.5 인프라 (v1 = Memory)

- **Memory 엔진 유지.** presence는 순수 장식(§9 억제 불변)이라 수용: 매 `docker compose up -d centrifugo` 시 점이 ~5–30s 사라졌다 자동 복구(관심집합 재수립). last-seen 없어 영속 동기화 우려 없음.
- **런북 단언**(`docs/DEPLOY_LIGHTSAIL.md`): Memory presence는 단일 Centrifugo 프로세스에서만 정확. 멀티노드 금지.
- **업그레이드 경로**: 멀티노드 필요 시 `presence_manager:{ enabled:true, type:redis }` + Valkey. DDL/코드 변화 없음.

### 6.6 토큰 / 재연결 / 폐기 경화

- eager `<PresenceClient/>`로 모든 탭이 WS 상시 보유 → Centrifugo 재시작 시 전 탭 동시 재연결.
- `connection-token` 라우트: 토큰 발급은 이미 DB-free. 핫패스 DB는 게이트 `isSessionRevoked`+`isEmailUnverified`(`route.ts:30-31`)뿐 — **유지**. 재연결 폭주 비용은 **토큰 라우트 로컬 userId 단TTL(5–10s) 캐시**로 흡수(C1: 공유 `session.ts`는 미캐시 → `requireSession` 폐기 SLA 불변). 두 PK 조회는 users 1행으로 통합.
- `TOKEN_TTL` 10m → **30m**(재발급 churn↓).
- **폐기 즉시성 (OV7)**: 상시 소켓은 재연결을 안 하므로 토큰 TTL만으론 ≤30m 폐기창이 남는다. → **sv-bump(비번재설정·이메일변경·정지) 시 Centrifugo HTTP `disconnect` API로 해당 user 소켓 강제 종료** → 폐기창 ~0, TTL 이점 유지. 부가효과: 로그아웃·정지 시 즉시 offline. (서버 액션은 이미 라이브 게이트로 차단되므로 이 조치는 *프레즌스 소켓* 자체를 끊는 용도.)
- `centrifuge-js`는 재연결 백오프에 full jitter 기본 적용. 레버는 `maxReconnectDelay`.
- **출시 전 부하 테스트**: 단일 Centrifugo 재시작을 실제 동시 탭 수로 + **publish flood**(공개 채널 악용) → connection-token 캐시 적중률·Postgres 풀·Centrifugo CPU 관찰.

## 7. 컴포넌트 / 변경 지점

| 구성 | 파일 | 변경 | 단계 |
|---|---|---|---|
| 연결 토큰 발급 | `lib/server/realtime/token.ts` | `info:{workspaceId}`, TTL 10m→30m | M1 |
| 연결 토큰 라우트 | `app/api/centrifugo/connection-token/route.ts` | `workspaceId` 전달, sv/email 게이트 유지 + **라우트-로컬** 캐시(C1) | M1 |
| 폐기 시 강제 종료 | sv-bump 경로(비번재설정·이메일변경·정지) | Centrifugo HTTP `disconnect(user)` 호출(OV7) | M1 |
| online/활동 순수함수 | 신규 `lib/realtime/presence.ts` | `onlineWorkspaceIds(entries)`, `deriveActivity(entries,V)` (순수·시간무관·`{state}` enum 엄격검증·connInfo fail-closed) | M1 |
| 공유 subscribe 프리미티브 | 신규 `lib/realtime/managedSubscribe.ts` + `useCentrifugoSubscription` 리팩터 | subscribe+disposer(removeSubscription 더블핸들러 가드) 단일출처(C2) | M1 |
| Centrifugo config | `deploy/centrifugo/config.yaml` | `presence` 네임스페이스(presence/join_leave/force_push/allow_subscribe_for_client/allow_publish_for_subscriber/history_size:1/history_ttl/publish rate limit) + **`chat`에 allow_publish_for_subscriber(타이핑 버그 수정)** + **(M2) `team`에 presence:true+join_leave:true** | M1/M2 |
| config 드리프트 가드 | `deploy/__tests__/*.test.ts` | presence 실재 키 단언 + `presence_ttl` **부재** 단언 + chat publish 키 + (M2)team presence 키 | M1/M2 |
| 통합 스모크 | 신규 `*.integration.test.ts` (CI, ephemeral Centrifugo) | subscribe/publish/join-leave/history/connInfo 실제 동작 검증(T1·OV3) | M1 |
| 전역 self-broadcast | `app/(app)/layout.tsx` + 신규 `<PresenceClient/>` | 자기 ws 구독, eager open, **`!isDemo&&!isSample` 게이트**(OV8), 워크스페이스 전환 disconnect(OV4) | M1 |
| 관찰 Provider/훅 | 신규 `WorkspacePresenceProvider` + `useWorkspacePresence(wsId)` | viewport 관심집합(cap=50·배치·재연결 재수립), `managedSubscribe` 사용, 비대칭 디바운스, 조건부 focus 재조정(P1) | M1 |
| 활동 훅 | 신규 `useActivityState()` | Page Visibility + 키/마우스, 7분 idle, visibilitychange 즉시 idle, 전이 `{state}` publish | M2 |
| idle 토큰 | `DESIGN.md`, `styles/tokens.css` | idle(흐림) 점 토큰 + a11y 대비 | M2 |
| 인박스 목록 | `components/messages/ConversationList.tsx` | 행 아바타 점, viewport 관찰 | M1 |
| 홈 위젯 | `components/home/RecentMessagesPanel.tsx` | 아바타 점 | M1 |
| 스레드 헤더 | `components/messages/ThreadView.tsx` | 점 출처 `useWorkspacePresence`로 교체(`useChatChannel.online` 소비처 1곳뿐), 타이핑 우선, 3-state, offline 무표시 | M1 |
| 비교/선정 | `components/rfp/comparison/FocusComparison.tsx`(+`RfpPendingRequests.tsx`) | 각 초대 PG 행 3-state 점(`pgWsId` 노출됨), viewport 관찰 | M2 |
| 딜룸 로스터 | 딜룸 ChatPanel/참여자 영역 | 1:1+팀 presence per-user 로스터(team presence 활성 후) | M2 |

> `useChatChannel.online`(numUsers>=2)은 헤더 점에서 빠지고 타이핑·메시지 수신만 담당(`ThreadView.tsx:158` 단일 소비처, `ThreadView.test.tsx:232` 함께 갱신).

## 8. 데이터 흐름

1. 로그인 후 클라가 `/api/centrifugo/connection-token` → (sv/email 게이트, 라우트-로컬 캐시) 토큰 `sub=userId`, `info.workspaceId`.
2. `<PresenceClient/>` 마운트(`!isDemo`) → 자기 `presence:ws:<내ws>` 구독 → 등록 + WS open.
3. 면 진입 → `WorkspacePresenceProvider`가 viewport 상대 ws id 각각 구독(공개, proxy 없음).
4. 초기 `presence()` → `connInfo.workspaceId===V` ≥1 ? online. (M2) `history({limit:1})`로 활동 시드. 이후 join/leave/활동 publication → 비대칭 디바운스 `Map` 갱신. reconnect/조건부 focus 재조정.
5. 면 컴포넌트 `useWorkspacePresence(wsId)` → 3-state 점.

## 9. 이메일 억제 불변 (회귀 금지)

`isUserPresentInConversation`(`lib/server/realtime/centrifugo.ts`)는 **대화 채널을 그대로 읽는다**(서버 HTTP presence API, `client.user`=userId만). `presence:ws`로 **재포인팅 금지** — 넓어지면 다이제스트 오취소 → 알림 누락. presence:ws 멤버십·`info.workspaceId`는 어떤 다이제스트도 취소하지 않는다.
- 진짜 가드(기존): `centrifugo.test.ts:168`이 `params.channel === 'chat:conversation:conv-1'` 단언 — presence:ws로 바꾸면 RED. **이 테스트를 §9 불변의 구조 가드로 유지**.
- 확장: M2 팀 다이제스트(`team-chat-digest-flush`)도 팀 presence를 얻지만 suppression은 여전히 팀 *대화* 채널만 본다.

> **graceful degradation**: WS URL 미설정(dev·테스트) → `getCentrifuge()` null → 구독 0·점 없음·정적 로더 정상. subscribe 실패 → 그 상대 offline(안전). pending/suspended/미인증/demo → 의도적 offline.

## 10. 단계

- **M1 (코어 binary online, 공개)**: 토큰 `info`+TTL30m+라우트-로컬 캐시(C1)+sv-bump disconnect(OV7); `presence` 네임스페이스(allow_subscribe_for_client/allow_publish_for_subscriber/force_push/history_size:1, **+chat 타이핑 publish 키 동시 수정**); `managedSubscribe` 프리미티브(C2); online 순수함수; self-broadcast(`!isDemo` 게이트, 전환 disconnect); 관찰 Provider(cap=50, 조건부 focus); 비대칭 디바운스. 노출: 인박스·홈·스레드 헤더(상대 binary). 억제 회귀 가드(§9), config 드리프트 가드, **통합 스모크(T1)**.
- **M2 (활동 + roster + 확장 면)**: `useActivityState`(3-state, 텍스트 없음) + history 복구 + `deriveActivity` enum 검증 + idle 토큰·a11y + **team 네임스페이스 presence 활성(OV2)** + 구매사-초대PG 면(`FocusComparison`) + 딜룸/팀 per-user 로스터 + demo 제외 면 적용.
- ~~**M3 offline last-seen**~~ — **삭제됨(D2)**. offline = 점 없음, DDL 0.

## 11. 검증 필요 가정 (구현 시 — 통합 스모크 T1로 자동화)

1. 토큰 `info`(conn_info)가 presence 엔트리 `connInfo` **및** join/leave ClientInfo에 노출.
2. `force_push_join_leave` on 시 join/leave 실제 전달(→ 필요 확인 후 chat/team 일관 적용, OV3).
3. `allow_subscribe_for_client`로 client subscribe 허용(A1).
4. `allow_publish_for_subscriber`로 client publish 허용 + per-client rate limit 동작(A2/OV6) — *타이핑 수정과 동일 메커니즘이라 동시 검증*.
5. `history_size:1`이 늦은 구독자에 마지막 `{state}` 시드(A3).
6. ghost 창 지배 노브(`ping_interval`/`pong_timeout`) 기본값/튜닝.
7. Centrifugo HTTP `disconnect`가 대상 user 소켓을 즉시 종료(OV7).

> rev1의 disconnect-proxy 가정은 삭제(OSS v6 미존재 + last-seen 제거로 무의미). 봉인 검증(meta→proxy, chan_info 익명화, count)도 공개로 불필요.

## 12. 테스트 계획 (TDD — RED 먼저)

**순수함수** `onlineWorkspaceIds`/`deriveActivity`: workspaceId 그룹핑(owner vs 관찰자 혼재), 빈 맵, active>idle, unknown=idle, 늦은 구독 후 idle(절대 active 아님), 관찰자만=offline, **connInfo 누락/위조=not online(fail-closed)**, **publication workspaceId≠V 무시(스푸핑)**, **`{state}` 비-enum/garbage payload 무시(OV6)**.
**연결 토큰**: `info.workspaceId`, no-secret throw, TTL=30m(기존 `token.test.ts:43-44` `<=11m` 단언 RED→갱신).
**연결 토큰 라우트(캐시)**: sv→401·미인증→403, **캐시가 N 재연결을 1 DB read로 축약**, **[CRIT 회귀] revoked 세션 캐시 TTL 만료 후에도 401**, **[CRIT 회귀] 공유 `session.ts` 미캐시(`requireSession`은 매콜 검사 — C1 누출 방지)**.
**managedSubscribe / useCentrifugoSubscription**: subscribe+disposer가 unsubscribe+removeSubscription, 더블핸들러 없음, **[CRIT 회귀] `useCentrifugoSubscription` behavior-preserving(리팩터 후 기존 테스트 green)**.
**Provider/훅**: 미설정 no-op, map 갱신, 비대칭 디바운스(online 즉시·offline 4s·취소·관찰자 join 미취소), 중복 ws 단일 구독, viewport in/out, **cap=50 evict**, **재연결 관심집합 재수립**, **조건부 focus 재조정(끊김/숨김>30s 시만 스윕, P1)**.
**활동 훅(M2)**: visibilitychange→즉시 idle, 7분 타이머, 전이 publish, 포인터 스로틀, self 제외; **history({limit:1}) 늦은 시드**.
**컴포넌트**: ConversationList 점 유무, ThreadView 타이핑 우선·3-state·offline 무표시·상태별 aria-label.
**억제 회귀(§9)**: `centrifugo.test.ts:168` 채널 단언 유지(presence:ws 재포인팅 RED).
**config 드리프트**: presence 실재 키(presence/join_leave/force_push_join_leave/allow_subscribe_for_client/allow_publish_for_subscriber/history_size/history_ttl) + `presence_ttl` **부재** + subscribe_proxy 미사용 + **chat allow_publish_for_subscriber** + (M2)team presence.
**통합 스모크(T1, CI)**: ephemeral Centrifugo + 실제 config로 §11의 1·2·3·4·5·7 end-to-end(mock이 못 잡는 클래스 — 타이핑 침묵 실패를 잡았을 테스트).
**workspace 전환(OV4)**: 전환 시 client.disconnect 호출 단언.
**demo 제외(OV8)**: isDemo 워크스페이스는 `<PresenceClient/>` 미마운트·관찰 면제.

## 13. 배포

- `deploy/centrifugo/config.yaml`에 `presence` 네임스페이스 + `chat` publish 키(+M2 `team` presence) → **컨테이너 재생성**(`docker compose up -d centrifugo`). v6 스키마(메모리 `centrifugo-proxy-secret-v6-footgun`), `chat` 블록 미러. 시작 로그 `"unknown key"` grep으로 유령 키 확인.
- **DDL 0**(D2). 신규 env 0. 토큰 `info` 추가는 하위호환.
- ⚠️ 재시작 = presence-깜빡임(§6.5) — 런북 결합 명시.

## 14. 범위 밖 / 향후 (NOT in scope)

- **offline last-seen(회사·개인 단위)** — D2 제외. 재도입 시 presence 휘발 불변·프라이버시(공개 하 "잠수 N일" 강신호) 재검토 + OSS v6는 disconnect proxy 없으니 **클라 스로틀 하트비트(+`navigator.sendBeacon` on `pagehide`)** 가 유일.
- **PG 오픈 게시판(`/opportunities`) presence** — 4개 면 미포함. 게시판 최소 whitelist 봉인면 + cap churn(대량 워크스페이스) 이중 이유로 제외. 추가하려면 별도 제품 결정(OV5).
- **per-user offline 표시** — 회사 단위 binary만; 개인별은 후속.
- **A3 (서버 fan-out 피드)** — 확장 + 관찰자-맵 노출 제거용. 인기 ws 채널 fan-out 천장에 닿으면 승급. viewport 관심집합 재사용, 표시 계약 불변.
- **숨김/투명 모드.**

## 15. 이미 존재하는 것 (What already exists — 재사용)

| 기존 자산 | 재사용 방식 |
|---|---|
| `useCentrifugoSubscription` (구독 수명) | `managedSubscribe` 프리미티브로 추출 후 self-broadcast·관찰 Provider 공용(C2) |
| `centrifuge-client.getCentrifuge()` 싱글턴 + graceful no-op | 그대로; 전환 disconnect만 추가(OV4) |
| `token.ts`/connection-token 라우트 + sv/email 게이트(PR#223) | 확장(info 추가·캐시); 게이트 유지 |
| `chat` 네임스페이스 config + proxy-secret 드리프트 가드 | `presence` 블록·드리프트 가드 미러 |
| `ThreadView` 점 + `WorkspaceAvatar` | 점 출처 교체 |
| `centrifugo.test.ts:168` 채널 단언 | §9 억제 불변 가드로 재사용 |
| Centrifugo built-in presence/join-leave/history | 플랫폼 기능 사용(롤-유어-오운 없음, 혁신토큰 0) |

## 16. 실패 모드 (failure modes)

| 코드패스 | 실패 | 테스트? | 에러처리? | 사용자 체감 |
|---|---|---|---|---|
| presence subscribe 거부(권한 오설정) | 점 전부 안 뜸 | 통합스모크(T1) | graceful(offline 표시) | 점 없음(무에러) — **침묵 실패라 T1 필수** |
| client publish 거부(권한 오설정) | 활동(idle) 전파 안 됨 | 통합스모크(T1)+드리프트 | `.catch` swallow | 모두 active/offline만(idle 없음) — **타이핑 버그와 동일 클래스** |
| force_push 미설정 | 라이브 join/leave 안 옴 | 통합스모크(T1) | subscribed/재조정 폴백 | 점이 느리게/안 갱신 |
| history 미시드 | 늦은 관찰자 idle을 active로 오표시 | 유닛(unknown=idle)+통합 | unknown=idle 기본값 | 잠깐 오표시, 다음 전이/재조정서 치유 |
| Centrifugo 재시작 | 전 점 일시 소멸 | — | 재연결+관심집합 재수립 | ~5–30s 점 깜빡(런북 명시) |
| 재연결 폭주 | connection-token DB 부하 | 캐시 유닛 + 부하테스트 | 라우트-로컬 캐시 | 영향 없음(캐시 흡수) |
| publish flood(공개 채널 악용) | 단일 프로세스 CPU/fanout | 부하테스트 | rate limit + enum 검증 | 잠재 지연 — **rate limit 필수** |
| 폐기 후 상시 소켓 잔류 | ≤30m presence 잔류 | — | sv-bump disconnect(OV7) | 즉시 offline 전환 |
| in-tab 워크스페이스 전환(stale token) | 떠난 ws를 online 브로드캐스트 | 전환 disconnect 단언 | disconnect on switch(OV4) | 정상(끊고 재연결) |

**critical gap(무테스트+무처리+침묵)**: 없음 — 위 침묵 실패(subscribe/publish 거부)는 모두 통합 스모크 T1 + 드리프트 가드로 덮음.

## 17. 병렬화 전략 (worktree)

| 워크스트림 | 모듈 | 의존 |
|---|---|---|
| WS-1 인프라 | `deploy/centrifugo/`, `deploy/__tests__/`, 통합스모크 | — |
| WS-2 토큰/폐기 | `lib/server/realtime/token.ts`, `app/api/centrifugo/`, `lib/auth/` (sv-bump), 캐시 | — |
| WS-3 클라 코어 | `lib/realtime/presence.ts`, `managedSubscribe`, `useCentrifugoSubscription` | — |
| WS-4 Provider/UI | `WorkspacePresenceProvider`, `<PresenceClient/>`, ConversationList/RecentMessagesPanel/ThreadView | WS-3 |

- **Lane A**: WS-1(인프라) — 독립.
- **Lane B**: WS-2(토큰/폐기) — 독립(auth 경로 주의).
- **Lane C**: WS-3 → WS-4 (순차, 클라 프리미티브 먼저).
- **실행**: A·B·C 병렬 시작; C 내부만 순차. 충돌 위험: WS-2가 `lib/auth/` 수정(sv-bump) → 다른 auth 작업과 조율. 나머지 레인은 디렉터리 분리.

## 18. Implementation Tasks
이 리뷰 findings에서 도출. P1=ship 차단, P2=같은 브랜치, P3=후속.

- [ ] **T1 (P1, human ~5min / CC ~2min)** — config — presence 네임스페이스에 `allow_subscribe_for_client: true` (없으면 subscribe 전부 `103` 거부)
  - Surfaced by: Architecture #1 / v6 channel_permissions 문서
  - Files: `deploy/centrifugo/config.yaml`, `deploy/__tests__/*`
  - Verify: 통합 스모크 — client subscribe 성공
- [ ] **T2 (P1, human ~10min / CC ~4min)** — config — presence `allow_publish_for_subscriber: true` + per-client publish rate limit
  - Surfaced by: Architecture #2 / 외부보이스 #6
  - Files: `deploy/centrifugo/config.yaml`, `lib/realtime/presence.ts`(enum 검증)
  - Verify: 통합 스모크 — client publish 성공 + garbage payload 무시 유닛
- [ ] **T3 (P1, human ~20min / CC ~6min)** — config — presence `history_size:1`+`history_ttl`; gossip 설계 삭제
  - Surfaced by: Architecture #3
  - Files: `deploy/centrifugo/config.yaml`, spec §6.2
  - Verify: 통합 스모크 — 늦은 구독자 history 시드
- [ ] **T4 (P1, human ~25min / CC ~8min)** — auth/token — connection-token 라우트-로컬 캐시(공유 session.ts 미변경)
  - Surfaced by: Code Quality #1
  - Files: `app/api/centrifugo/connection-token/route.ts`
  - Verify: 캐시 유닛 + [CRIT 회귀] requireSession 매콜 검사 유지
- [ ] **T5 (P1, human ~40min / CC ~12min)** — realtime — `managedSubscribe` 프리미티브 추출 + useCentrifugoSubscription 리팩터
  - Surfaced by: Code Quality #2
  - Files: `lib/realtime/managedSubscribe.ts`, `lib/hooks/useCentrifugoSubscription.ts`
  - Verify: [CRIT 회귀] 기존 useCentrifugoSubscription 테스트 green
- [ ] **T6 (P1, human ~1d / CC ~2-3h)** — test — ephemeral Centrifugo 통합 스모크(subscribe/publish/join-leave/history/connInfo/disconnect)
  - Surfaced by: Test review
  - Files: 신규 `*.integration.test.ts`, CI 워크플로
  - Verify: CI green
- [ ] **T7 (P1, human ~20min / CC ~6min)** — config — `chat` 네임스페이스 `allow_publish_for_subscriber`(타이핑 침묵 버그 수정)
  - Surfaced by: 외부보이스 (latent bug)
  - Files: `deploy/centrifugo/config.yaml`, 통합 스모크
  - Verify: 통합 스모크 — typing publish 성공
- [ ] **T8 (P1, human ~2h / CC ~30min)** — auth — sv-bump 경로에서 Centrifugo HTTP `disconnect(user)` 호출
  - Surfaced by: 외부보이스 #7
  - Files: 비번재설정·이메일변경·정지 경로, `lib/server/realtime/`
  - Verify: 폐기 후 소켓 종료 단언
- [ ] **T9 (P1, human ~15min / CC ~5min)** — shell — `<PresenceClient/>` mount/관찰을 `!isDemo&&!isSample` 게이트
  - Surfaced by: 외부보이스 #8
  - Files: `<PresenceClient/>`, `app/(app)/layout.tsx`
  - Verify: demo 워크스페이스 미마운트 유닛
- [ ] **T10 (P1, human ~30min / CC ~10min)** — client — online 순수함수 + Provider(cap=50, 비대칭 디바운스, 조건부 focus)
  - Surfaced by: Architecture / Performance #1
  - Files: `lib/realtime/presence.ts`, `WorkspacePresenceProvider`
  - Verify: Provider 유닛(디바운스·cap·조건부 focus)
- [ ] **T11 (P2, human ~30min / CC ~10min)** — client — 워크스페이스 전환 시 `client.disconnect()` + 의존성 주석
  - Surfaced by: 외부보이스 #4
  - Files: switch 경로, `centrifuge-client.ts`
  - Verify: 전환 disconnect 단언
- [ ] **T12 (P2, human ~1d / CC ~2h)** — M2 — `useActivityState` + 3-state UI + idle 토큰/a11y + team presence 활성 + 확장 면
  - Surfaced by: M2 scope
  - Files: §7 M2 행들
  - Verify: 활동 유닛 + 통합

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 7 issues, 0 critical gaps; all resolved + 5 outside-voice fixes folded |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | idle dot token + a11y contrast pending (suggested) |
| Outside Voice | Claude subagent | Independent 2nd opinion | 1 | issues_found | 5 new (team-ns presence, singleton-token, publish-flood, revocation-window, demo-seq) + 1 latent bug (typing) |

- **CROSS-MODEL:** 1 tension (TTL revocation window) — resolved to disconnect-on-revocation. Outside voice otherwise additive (no contradictions with the 4-section findings).
- **VERDICT:** ENG CLEARED — ready to implement (M1). Design review optional (idle dot token/contrast). All 7 review decisions + 5 outside-voice fixes folded into rev3; scope locked as Full M1.

NO UNRESOLVED DECISIONS
