# THREAT_MODEL.md — 위협 모델 · 수용 리스크 대장

이 문서는 **위협 관련 결정과 수용 리스크(Accepted Risk, AR-N)** 를 기록하는 living doc 이다. 방어 메커니즘 자체의 SSOT 는 언제나 **코드 + 가드 테스트**이며, 이 문서의 각 항목은 해당 가드 테스트를 링크한다 — 산문이 코드와 3벌로 드리프트하는 사고(CLAUDE.md 의 OpportunityListing 블록이 남긴 교훈)를 피하기 위해 여기서는 *결정·근거·재검토 트리거*만 서술한다.

**유지 규칙**: 신뢰 경계를 바꾸는 변경(채널 ACL, 공개 projection, 웹훅 검증, presign 정책 등)은 이 문서의 해당 절을 같은 PR 에서 갱신한다. 수용 리스크를 해소했다면 AR 항목을 삭제하지 말고 "해소됨(버전)" 으로 남긴다.

## 1. 신뢰 경계 · 자산

| 자산 | 민감도 | 경계 (SSOT 위치) |
|---|---|---|
| 봉인 입찰 데이터 (수수료·입찰 내용·경쟁사 수) | 최고 — 제품 핵심 불변식 | 서버 로더 strip + 명시 projection (§3.1) |
| 멤버 PII (이메일·이름·연락처) | 높음 | 관계 fail-closed 로더 (§3.1, `lib/server/user-profile-loader.ts`) |
| 첨부파일 (RFP·입찰·채팅) | 높음 | R2 presigned + ACL 302 프록시 (§3.3) |
| 전자서명 계약 (SnowSign) | 높음 | ACL-first 로더 + HMAC 웹훅 (§3.2) |
| 온라인 presence 비트 (누가 접속 중인가) | 낮음 — 단독으로는 거래 정보 아님 | 공개 채널 + 앱 계층 억제 (§2.3, AR-1) |

## 2. Realtime (Centrifugo)

자체호스팅 Centrifugo v6 (Caddy `wss://`, `deploy/centrifugo/config.yaml`). 채널 이름의 단일 출처는 `lib/realtime/channels.ts`.

### 2.1 연결 인증

- 연결 토큰: `lib/server/realtime/token.ts` — HS256, `sub` = userId, `info` = `{ workspaceId }` (→ Centrifugo `connInfo`), TTL 30m. 서버 서명이므로 **`user`/`connInfo.workspaceId` 는 클라이언트가 위조 불가**.
- 발급 라우트 `app/api/centrifugo/connection-token/route.ts`: 세션 필수(401) + 세션 취소(401) + 이메일 미인증(403) 게이트, 동시 25건 load-shed(503). 즉 **모든 WS 연결은 인증 세션 뒤에 있다** — 아래의 모든 노출 논의는 "인증된 사용자"가 전제다.
- 세션 강제 종료: `disconnectCentrifugoUser` (session_version bump 후 호출).

### 2.2 채널 ACL 매트릭스

| 네임스페이스 | 채널 형식 | ACL | 가드 |
|---|---|---|---|
| `chat` | `chat:conversation:<uuid>` | subscribe-proxy — 대화 양측 ws 멤버만 | `app/api/centrifugo/subscribe/__tests__/route.test.ts` |
| `team` | `team:rfp:<rfpId>:<wsId>` | subscribe-proxy — ws 멤버 ∧ RFP 접근권 (buyer/PG 팀 채널 분리 = 봉인 입찰 불변식) | 상동 (t1–t6) |
| `presence` | `presence:ws:<wsId>` | **없음 — 공개 (설계 결정 D1, AR-1)** | `deploy/__tests__/centrifugo-presence-namespace.test.ts` |

subscribe-proxy(`app/api/centrifugo/subscribe/route.ts`)의 불변식: 항상 HTTP 200, 모든 거부는 동일한 generic deny(존재 오라클 없음), 예외 → deny(fail-closed), uuid 게이트 후 DB 접근.

### 2.3 AR-1 — presence 관찰자 신원 노출 (수용)

**진술**: 인증된 raw WS 클라이언트가 워크스페이스 UUID `V` 를 알면 `presence:ws:<V>` 를 구독하고 `sub.presence()`/join/leave 이벤트로 ① `V` 멤버 중 현재 온라인인 userId 목록, ② co-observer 의 신원(`user` + `connInfo.workspaceId` — 누가 `V` 를 관찰 중인가)을 열거할 수 있다.

**전제조건**: ① 유효 세션(가입은 열려 있으나 §2.1 게이트 통과 필요), ② 대상 ws UUID 지득 — UUID 는 비열거·불투명이며 PG-facing 공개 표면(`OpportunityListing`)에 포함되지 않지만, **관련 당사자**(대화 상대·초대 PG 등)의 앱 페이로드에는 유통된다.

**새지 않는 것**: 이메일·이름(페이로드는 id 뿐 — 신원 카드의 PII 는 `lib/server/user-profile-loader.ts` 가 관계 fail-closed 로 별도 게이트), 수수료·입찰 내용·경쟁사 수(presence 는 입찰 데이터와 연결점 없음), 앱 UI(회사 점은 owner-필터 binary, 사람 점은 로더가 내려준 `presenceWorkspaceId` 에 한정 — `lib/realtime/presence.ts` 순수 함수가 스푸핑 바운드 테스트로 고정).

**수용 근거 (설계 결정 D1, 2026-06-21 rev2)**: ① 온라인 비트는 저민감(§1) — PII·거래 정보와 결합돼야 의미가 생기는데 그 결합 경로들이 각자 fail-closed 다. ② 관계-기반 ACL 은 rev1 에서 시도됐다가 초대·비교·콜드피치 표면과 모순을 일으켜 의도적으로 삭제됐다(전환 비용은 §2.6 에 실행-준비 상태로 기록). ③ 연결 자체가 인증 JWT 로 게이트된다. 원 설계 문서 `docs/superpowers/specs/2026-06-21-online-presence-design.md` 는 historical 아티팩트다(현행 진실은 코드 + 이 문서).

**탐지**: 없음(수용) — Centrifugo OSS 에는 채널 단위 감사 로그가 없다.

**핀**: `deploy/__tests__/centrifugo-presence-namespace.test.ts` 가 공개 모델(proxy 미경유 + client subscribe 허용)을 드리프트 가드로 고정한다.

### 2.4 AR-2 — presence publish flood, rate limit 부재 (수용)

원 설계(OV6)는 "per-client publish rate limit 필수"를 요구했으나, **per-connection/user 연산 rate limit 은 Centrifugo PRO 전용**이라 OSS 자체호스팅에서는 구현 불가하다. 수용하고 다음으로 완화한다: ① publish 는 subscriber 로 한정(`allow_publish_for_subscriber`), ② 수신측 `deriveActivity` 가 `{state}` 를 엄격 enum 검증해 쓰레기 페이로드를 무시(`lib/realtime/presence.ts`), ③ 연결 자체가 인증 게이트(§2.1) + 토큰 발급 load-shed. **잔여 리스크**: 인증된 계정에 의한 CPU/fanout DoS — Axiom 로그·PM2/Centrifugo 메트릭으로 사후 탐지.

### 2.5 배포 불변식 — subscribe-proxy 공유 비밀 fail-open

`CENTRIFUGO_PROXY_SECRET` 미설정 시 subscribe-proxy 라우트는 비밀 헤더 검사를 **건너뛴다**(의도된 fail-open — dev 에서 컨테이너 없이 동작). 설정 시에는 상수시간 비교. **prod 에서는 반드시 설정**해야 하며(라우트가 Caddy 뒤에서 공개 도달 가능), 컨테이너 쪽 주입 경로는 `CENTRIFUGO_VAR_PROXY_SECRET` (v5 `static_http_headers` 팬텀 키 사고 이력 포함) — 가드: `deploy/__tests__/centrifugo-proxy-secret.test.ts`.

### 2.6 이연 옵션 — presence:ws subscribe-proxy ACL 전환 (실행-준비)

AR-1 을 해소하려면 presence 네임스페이스를 chat/team 과 같은 proxy ACL 로 전환한다. 조사 완료된 설계(2026-07-23):

- **관계 술어 (4-테이블 EXISTS)**: `canObserve(userId, targetWsId)` = 멤버십 ∨ 대화 존재 ∨ RFP 초대 쌍 ∨ **pending** 콜드피치 쌍(거절은 영구 — 부여 금지). 대화 게이트만으로는 부족하다 — 대화-이전 표면 5곳(`RfpBriefPanel`·`BidContextStrip`·`RfpInviteManager`·`FocusComparison`·`RfpPendingRequests`, 전부 `CounterpartyProfileCard`→`useWorkspacePresence`)의 점이 조용히 꺼진다. rev1 이 정확히 이 지점에서 좌초해 D1 이 됐다.
- **관찰자 ws 해석**: v6 subscribe-proxy 페이로드에는 `connInfo` 가 **포함되지 않는다**(공식 문서 확인) — `user` 의 전체 멤버십을 DB 파생(`wsRepo.listForUser`)으로 해석한다. 신설 `PresenceAccessRepo` 에 술어를 두고 repo-boundary 를 지킨다.
- **config**: presence 블록에 proxy 활성 키 추가 + `allow_subscribe_for_client` **제거 필수** — v6 권한 평가는 "먼저 허용하는 메커니즘이 이긴다" 순서라 남겨두면 proxy deny 뒤 fallback grant 위험.
- **배포 순서 (역순 = 전면 블랙아웃)**: ① 앱 먼저(라우트 분기 dormant) → ② config 교체 + centrifugo 재시작 → ③ 실계정 2종으로 점 육안 확인 + 무관 계정 raw 클라이언트 deny 확인. 롤백 = config 되돌리기(즉시 공개 모델 복원).
- **동반 변경**: 드리프트 가드(§2.3 핀) 반전, 라우트 branch 테스트(p1–p8), PGlite repo 테스트.
- **비용**: 탭당 최대 51개(INTEREST_CAP+자기 채널) proxy 왕복/재연결. 규모 문제 시 connection-token 의 load-shed 패턴 참조.

**재검토 트리거**: ① 실제 악용 관찰(비정상 presence 구독 패턴), ② presence 페이로드에 PII 성 필드 추가, ③ 가입 게이트 완화(인증 전제 약화). TODOS.md 의 이연 항목이 이 절을 참조한다.

## 3. 포인터 절 — 다른 신뢰 경계 (여기가 SSOT 아님)

각 항목의 규범 서술과 강제 지점은 링크된 코드·테스트·문서가 소유한다. 이 절은 색인일 뿐이다.

- **봉인 입찰 공개 경계**: 오픈보드 공개 필드 화이트리스트는 `OpportunityListing`(`lib/types/pg-request.ts`) + 명시 SELECT projection + exact-key 가드 테스트가 강제하고, 산문 SSOT 는 CLAUDE.md Domain Context 블록 한 곳이다. 초대 PG 대상 필드 숨김은 `hidden_from_pg` 경로 allowlist 를 `PG_STRIP` 이 fail-closed 로 strip 한다(`loadPgRfpDetail`). 신원 카드 PII 는 `lib/server/user-profile-loader.ts` 가 관계 fail-closed.
- **SnowSign 전자서명**: 웹훅 `POST /api/signing/webhook` 은 HMAC-SHA256 검증 + payload 불신(트리거 전용, 상태는 재조회 단일 경로), 시크릿 미설정 시 401 fail-closed. 계약 조회·조작 ACL 은 낙찰 PG ws + buyer ws, `getForActor` ACL-first. 상세는 CLAUDE.md Domain Context.
- **첨부 스토리지 (R2)**: 업로드 = presign 2-phase + 서버 스니핑 검증, 다운로드 = ACL 검증 후 302 presigned GET(TTL 15분). 완료본 다운로드 프록시의 잔여 하드닝은 TODOS.md 참조.
- **인증·게이트**: 셸 가드 순서·이메일 인증 게이트는 `lib/auth/shell-access.ts` + CLAUDE.md Routing Architecture. 서버 액션 데이터 경계 강제는 의도적 후속(TODOS.md P2 항목들).
