# 워크스페이스 온라인 표시 (Online Presence) 설계

- **작성일**: 2026-06-20
- **상태**: 설계 확정 (구현 전)
- **범위**: `/messages` 화면의 온라인 표시 노출 확대 — 대화 목록(A) + 스레드 헤더(B)
- **관련 코드 doc**: `SCREEN_DESIGN.md`(구현 시 messages 화면 항목 갱신), `DESIGN.md`(상태 점 색=tertiary)

---

## 1. 배경 / 문제

현재 "온라인 표시"는 **채팅 스레드 헤더의 상대 아바타 우하단 초록 점 하나**가 전부다 (`components/messages/ThreadView.tsx:313-320`). 표시 조건은 Centrifugo가 **그 대화 채널**(`chat:conversation:<id>`)의 접속자 수가 2명인지로 판단(`lib/hooks/useChatChannel.ts:62-66`, `presenceStats().numUsers >= 2`).

즉 현재 점의 의미는 *"상대가 앱에 접속 중"* 이 아니라 **"상대가 지금 이 대화방을 열어두고 있음"** 이다. 헤더에선 자연스럽지만 대화 목록으로 확장하면 거의 무용지물이다(상대가 마침 그 대화창을 열어둔 한 칸만 켜짐).

## 2. 목표 / 비목표

**목표**
- 대화 목록(A) 각 행 아바타에 온라인 점 노출
- 스레드 헤더(B)에 온라인 점 + "온라인" 텍스트 노출
- "온라인"의 의미를 **"상대 워크스페이스(회사)의 누군가가 앱에 접속 중"** 으로 정의 (채팅은 워크스페이스↔워크스페이스이므로 워크스페이스 단위가 자연스러움)
- **전체 라이브** — 상대가 접속/이탈하면 목록·헤더 모두 즉시(push) 갱신

**비목표 (이번 범위 아님)**
- 딜룸 채팅 레일·팀 채팅·프로필 카드 등 `/messages` 밖 화면 표시 (후속)
- "마지막 접속 N분 전" 같은 last-seen 표기
- 오프라인 상태의 명시 표기 (스타일 = 미니멀: 온라인일 때만 점/텍스트, 오프라인은 표시 없음)
- 개인(유저) 단위 presence (워크스페이스 단위로 충분)

## 3. 확정된 결정 (브레인스토밍 기록)

| 결정 | 값 | 근거 |
|---|---|---|
| 노출 위치 | A(대화 목록) + B(헤더 텍스트) | 사용자 선택 |
| 오프라인 처리 | **미니멀** — 온라인일 때만 표시 | 사용자 선택, 현재 디자인 철학과 일관 |
| "온라인" 의미 | **앱에 접속 중** (워크스페이스 단위) | 사용자 선택 — 목록에서 의미 있으려면 필수 |
| 라이브 범위 | **전체 라이브** | 사용자 선택 |
| 아키텍처 | **A1** (워크스페이스 채널 self-broadcast + 관찰) | 사용자 선택. 대안 A2(폴링)/A3(피드 워커) 검토 후 현재 규모에 적합 판단 |

## 4. 아키텍처 — A1 (확정)

### 4.1 채널 규약 / 네임스페이스

- 새 채널: `presence:workspace:<workspaceId>`
- Centrifugo `presence` 네임스페이스 신설 (`deploy/centrifugo/config.yaml`, **기존 `chat` 네임스페이스 블록과 동일한 v6 스키마 형식으로** 추가):
  - `presence: true`
  - `join_leave: true`
  - `subscribe_proxy_enabled: true`

### 4.2 동작 메커니즘

- **자기 broadcast**: 각 클라이언트가 앱 진입 시 자기 워크스페이스 채널 `presence:workspace:<내ws>`를 구독 → "나 접속 중" 등록. (`AppSidebarLayout`에 전역 훅 마운트)
- **상대 관찰**: `/messages`에서 인박스의 **활성 대화** 상대 워크스페이스 채널들을 구독 → presence 변화를 push로 수신.
- **온라인 판정**: 상대 채널 V의 `presence()`(전체 맵)를 조회해, **`chan_info.role === 'self'` 인 항목이 1개 이상이면 V 온라인**.

### 4.3 🚨 프라이버시 — 봉인 입찰 누출 방지 (필수)

A1의 구조상 관찰자는 상대 채널을 직접 구독한다. Centrifugo `presence()`는 그 채널 구독자 *전원*의 info를 아무 구독자에게나 반환하므로, **순진하게 `conn_info`에 workspaceId를 박으면 같은 상대에게 붙은 다른 워크스페이스의 정체가 노출된다.** 이는 코드베이스가 명시적으로 금지한 봉인 입찰 불변식(`Bid.competitorCount does not exist by design` — 경쟁 PG 수·정체 비노출, CLAUDE.md 도메인 컨텍스트)을 위반한다.

**해결: 식별정보를 읽히는 위치에서 제거하고, 채널별 역할 플래그만 남긴다.**

- **연결 토큰에 `meta: { workspaceId }` 추가** (`issueCentrifugoConnectionToken(userId, workspaceId)`). `meta`는 연결에 귀속되어 subscribe-proxy 요청에 전달되지만, **다른 구독자에게 노출되지 않는다**.
- **subscribe-proxy가 채널별 `chan_info`를 세팅**: 프록시는 `meta.workspaceId`로 구독자가 그 채널 "주인(self)"인지 "관찰자"인지 판별한다.
  - V === `meta.workspaceId` (자기 채널) → 허용 + `info = { role: 'self' }`
  - V ≠ `meta.workspaceId` (관찰) → (ACL 통과 시) 허용 + **식별정보 없는** `info = {}` (또는 `{ role: 'observer' }`)
- 온라인 판정은 `chan_info.role === 'self'` 항목만 센다. 관찰자는 식별정보가 없으므로 **다른 관찰자의 정체를 알 수 없다.**

> 검증 필요(구현 시): 설치된 Centrifugo v6 버전이 (1) 연결 토큰 `meta` 클레임을 subscribe-proxy 요청에 전달하는지, (2) subscribe-proxy 응답의 `result.info`(chan_info)를 presence 항목에 반영하는지. 둘 다 v6 문서 기능이나, 메모리의 v6 config 키 함정 사례(`project_centrifugo-proxy-secret-v6-footgun`)가 있으므로 실제 동작을 단위/통합으로 확인한다.

### 4.4 fan-out 완화 (구조적 천장 인지)

A1의 본질적 한계는 **허브 채널 fan-out**(관찰자 수에 비례하는 presence 비용, buyer↔PG 비대칭으로 인기 PG 채널이 먼저 물림)이다. 태깅으로는 못 고치며 제거는 A3에서만 가능하다. 현재 규모(워크스페이스당 동시 대화 수~수십)에서는 허용 가능하되, 다음 완화를 적용한다:

- **관찰 구독을 활성 대화로만 한정** (마감 전/진행 중). 종결·아카이브 대화는 관찰 제외 → 허브 채널 크기·구독 수 상한.
- **presence() 재계산 디바운스/배치** — join/leave 버스트를 coalesce(예: 그 채널 한정 ~300ms 디바운스).
- **offline grace 디바운스** — leave 후 즉시 끄지 않고 짧은 유예(예: ~3초)로 네트워크 깜빡임 flicker 방지.

## 5. 컴포넌트 / 변경 지점

| 구성 | 파일 | 변경 |
|---|---|---|
| 연결 토큰 발급 | `lib/server/realtime/token.ts` | `issueCentrifugoConnectionToken(userId, workspaceId)` — payload에 `meta: { workspaceId }` |
| 연결 토큰 라우트 | `app/api/centrifugo/connection-token/route.ts` | `session.user.workspaceId` 전달 |
| subscribe-proxy | `app/api/centrifugo/subscribe/route.ts` | `presence:workspace:<V>` 분기 추가: meta 읽기 → self/observe 판별 → ACL(self 또는 활성 공유대화) → `chan_info` 세팅. UUID 가드 + fail-closed (기존 chat/team 패턴 동일) |
| repo: 활성 공유대화 존재 | `lib/server/repositories/**` (chat conversation repo) | `existsActiveConversationBetween(wsA, wsB)` 신규 (활성 대화 한정) |
| 온라인 판정 순수함수 | 신규 `lib/realtime/presence.ts` (또는 유사) | `isWorkspaceOnline(entries): boolean` — `chan_info.role==='self'` 필터 |
| 전역 self-broadcast 훅 | `components/shell/AppSidebarLayout.tsx` + 신규 훅 | 자기 ws 채널 구독 (표시 없음, presence 등록 전용) |
| 관찰 Provider | 신규 `WorkspacePresenceProvider` + `useIsWorkspaceOnline(wsId)` | `/messages`에서 활성 상대 ws id들 구독, `Map<wsId, online>` 유지, 디바운스 재계산 |
| 대화 목록 | `components/messages/ConversationList.tsx` | 각 행 `WorkspaceAvatar`를 relative wrapper로 감싸고 온라인 점 추가 (ThreadView 패턴 재사용) |
| 스레드 헤더 | `components/messages/ThreadView.tsx` | 점 출처를 `useIsWorkspaceOnline`로 교체 + "온라인" 초록 텍스트. **타이핑("입력 중…")이 우선** — 입력 중이면 그 자리에 "입력 중…", 아니고 온라인이면 "온라인", 오프라인이면 표시 없음. 타이핑은 기존 대화채널 그대로 유지 |

> 기존 `useChatChannel.online`(대화 채널 numUsers>=2)은 헤더 점 용도에서 빠지고, 타이핑(`typingUserIds`)·메시지 수신만 담당한다.

## 6. 데이터 흐름

1. 로그인 후 클라가 `/api/centrifugo/connection-token` 호출 → 토큰에 `sub=userId`, `meta.workspaceId` 포함.
2. `AppSidebarLayout` 마운트 → 자기 `presence:workspace:<내ws>` 구독 → subscribe-proxy가 self 판정 → `chan_info{role:'self'}` → presence 등록.
3. `/messages` 진입 → `WorkspacePresenceProvider`가 인박스의 활성 상대 ws id(중복 제거) 각각 `presence:workspace:<상대>` 구독.
4. 각 구독 onSubscribed/onJoin/onLeave → (디바운스) `presence(상대채널)` 조회 → `isWorkspaceOnline` → `Map` 갱신.
5. `ConversationList` 행·`ThreadView` 헤더가 `useIsWorkspaceOnline(wsId)` 구독 → 점/텍스트 렌더.

## 7. 그레이스풀 디그레이데이션

- `NEXT_PUBLIC_CENTRIFUGO_WS_URL` 미설정(dev·전체 테스트 환경) → `getCentrifuge()`가 `null` → 구독 0, 점/텍스트 표시 없음, 정적 로더로 채팅 정상 동작. (기존 계약 그대로, `lib/realtime/centrifuge-client.ts:6-10`)
- subscribe-proxy 오류/미인가 → 해당 채널 deny → 그 상대는 오프라인으로 표시(안전).

## 8. 테스트 계획 (TDD — RED 먼저)

- **순수 함수** `isWorkspaceOnline(entries)`: self 항목 유/무, observer-only(=오프라인), 빈 맵.
- **subscribe-proxy presence ACL**: self 허용+`role:self`, 활성 공유대화 허용+식별정보 없는 info, 비-상대 deny, 종결-only 대화 deny(활성 한정), 잘못된 UUID deny, 예외 시 fail-closed.
- **연결 토큰**: payload에 `meta.workspaceId` 포함, secret 없으면 throw(기존 불변식 유지).
- **repo** `existsActiveConversationBetween`: 활성 대화 있음/없음/종결-only (PGlite).
- **Provider/훅**: Centrifugo 미설정 시 no-op, online map 갱신(모의 subscription), 디바운스(offline grace) 동작, 중복 상대 ws 단일 구독.
- **컴포넌트**: `ConversationList` 온라인/오프라인 행 점 유무, `ThreadView` 온라인 텍스트·타이핑 우선순위·오프라인 무표시.
- **드리프트 가드**: `config.yaml`에 `presence` 네임스페이스(+presence/join_leave/subscribe_proxy) 존재, 채널 규약 상수 단일 출처(소스 파싱).

## 9. 배포

- `deploy/centrifugo/config.yaml`에 `presence` 네임스페이스 추가 → **Centrifugo 컨테이너 재생성** (`docker compose up -d centrifugo`). 앱 재빌드 불필요.
- **DDL 0** (테이블/컬럼 추가 없음). **신규 env 0** (proxy-secret·HMAC 기존 재사용).
- 연결 토큰 변경은 하위 호환(meta 추가만) — 기존 chat/team 채널 동작 불변.
- ⚠️ config는 반드시 **v6 스키마**로 작성 (메모리 `project_centrifugo-proxy-secret-v6-footgun` — v5 키는 v6가 조용히 무시). 기존 블록 형식을 미러링한다.

## 10. 향후 (북극성) — A3 이행

허브 fan-out 천장에 닿으면 **A3 (self-broadcast + 서버 fan-out 피드 채널 + presence 폴러 워커)** 로 이행한다. 권장 워커 형태는 **리컨실리에이션 폴러**(~5초마다 `channels`/`presence_stats` 스캔 → diff → 변화분만 뷰어 피드로 publish), 별도 PM2 앱 또는 `instrumentation.ts` 싱글턴.

**이행 비용이 낮은 이유**: 클라 *표시* 계약(`useIsWorkspaceOnline(wsId) → boolean`)은 그대로 유지하고, 바뀌는 것은 *전송*(관찰자가 허브 채널 대신 자기 피드 1개 구독)과 워커/피드 ACL 추가뿐이다. UI 변화 거의 0. → 본 설계에서 `useIsWorkspaceOnline` 추상화를 표시 단의 단일 진입점으로 둔다.

## 11. 검증 필요 가정 (구현 시)

1. Centrifugo v6: 연결 토큰 `meta` → subscribe-proxy 요청 전달 여부.
2. Centrifugo v6: subscribe-proxy 응답 `result.info`(chan_info) → presence 항목 반영 여부, centrifuge-js presence 응답에서 chan_info 노출 형태.
3. 위 2가지가 기대대로면 chan_info 방식, 아니면 대체(예: presence info 클라 노출 자체를 차단하고 서버사이드 판정으로 폴백) 검토.

## 12. 범위 밖 (명시)

- `/messages` 외 화면(딜룸·팀·프로필 카드) presence
- last-seen / 오프라인 명시 표기
- 개인 단위 presence
- A2/A3 즉시 구현 (A3는 §10 북극성으로만)
