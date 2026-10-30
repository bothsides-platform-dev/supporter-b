# THREAT_MODEL.md — 위협 모델 · 수용 리스크 대장

이 문서는 **위협 관련 결정과 수용 리스크(Accepted Risk, AR-N)** 를 기록하는 living doc 이다. 방어 메커니즘 자체의 SSOT 는 언제나 **코드 + 가드 테스트**이며, 이 문서의 각 항목은 해당 가드 테스트를 링크한다 — 산문이 코드와 3벌로 드리프트하는 사고(CLAUDE.md 의 OpportunityListing 블록이 남긴 교훈)를 피하기 위해 여기서는 *결정·근거·재검토 트리거*만 서술한다.

**유지 규칙**: 신뢰 경계를 바꾸는 변경(채널 ACL, 공개 projection, 웹훅 검증, presign 정책 등)은 이 문서의 해당 절을 같은 PR 에서 갱신한다. 수용 리스크를 해소했다면 AR 항목을 삭제하지 말고 "해소됨(날짜)" 으로 남긴다.

## 노온–구매사 전환 경계 (2026-10-21, 기존 계약 관련 기술보다 우선)

신규 계약의 서비스/API 권한은 구매사 workspace와 `kind=platform_buyer`를 함께 요구한다. PG의 기존 계약 액션은 폐지 오류, PDF 템플릿/수동 업로드 엔드포인트는 404로 닫는다. 레거시 행은 보존하되 사용자 조회와 다운로드에서 배제한다. `retired-signing.test.ts`, `platform-actions.test.ts`, `platform-agreement-flow.test.ts`, `platform-agreement.test.ts`가 이 경계를 고정한다.

buyer 정보만 저장하고 platform 정보와 도장 원본은 서버가 결정한다. 원본은 서버 전용 경로에 두고 해시를 검사한다. `prepared` 스냅샷과 미리보기 stamp가 문안·당사자·견적·요율·서명자·도장을 묶으며 revision/리스 CAS가 동시 편집과 중복 발송을 막는다. `platform-agreement-pdf.test.ts`는 도장 누락/판본 불일치 차단과 실제 이미지 삽입을 확인한다.

신규 공급자 참여자는 지정 구매사 한 명이며 `identity_verification`을 요구한다. 바인딩·동기화·보관·다운로드에 같은 kind 정책을 적용한다. 레거시는 기존 양측 정책으로 내부 보존한다. PG 사용자에게 새 계약 알림·보관본을 만들지 않는다. 과거 알림은 SQL 조회에서 제외하고 PG 재촉 outbox는 중단한다. 웹훅 payload는 상태의 증거가 아니며 기존 HMAC·재조회·rate limit을 유지한다.

공급자 생성 응답 자체가 유실돼 providerRef를 얻지 못하는 기존 외부 API 한계와 제공자 생성/발송 사이 프로세스 중단은 운영 관측 대상이다. 발송 응답 유실로 참조가 남은 경우에는 새 문서를 보내지 않고 같은 참조를 조회해 복구한다. 실제 본인인증 완료는 자동화가 대리하지 않으며 승인된 테스트 담당자가 검증한다.

발송 리스의 획득·해제는 신규와 레거시 모두 `SigningSendLease`를 사용한다. 정리 단계의 해제 실패는 기록하되 이미 완료된 발송·DB 커밋의 성공 결과를 뒤집지 않는다. 완료 상태 복구는 주입된 완료 처리로 이어가며 당사자·참조·스냅샷 검증은 유지한다. 가드: `lib/server/services/__tests__/platform-agreement-flow.test.ts`, `lib/server/services/__tests__/signing-send-lease.test.ts`.

## 1. 신뢰 경계 · 자산

| 자산 | 민감도 | 경계 (SSOT 위치) |
|---|---|---|
| 봉인 입찰 데이터 (수수료·입찰 내용·경쟁사 수) | 최고 — 제품 핵심 불변식 | 서버 로더 strip + 명시 projection (§3.1) |
| 멤버 PII (이메일·이름·연락처) | 높음 | 관계 fail-closed 로더 (§3.1, `lib/server/user-profile-loader.ts`) |
| 첨부파일 (RFP·입찰·채팅) | 높음 | 일반 다운로드는 ACL 확인 후 R2 presigned 302, PDF 썸네일은 같은 ACL 확인 후 앱에서 스트리밍 (§3.3) |
| 계약 보관 문서 (신규 합의서 완료본·감사추적인증서 R2 사본) | 높음 | 구매사 소유 워크스페이스 + `platform_buyer` 게이트 + 서명자 정책 재검증 + presigned 302 (§3.3). 기존 업로드·PG 계약 문서는 운영 보존 전용 |
| 전자서명 계약 (SnowSign) | 높음 | ACL-first 로더 + HMAC 웹훅 (§3.2) |
| 온라인 presence (누가 접속 중 + **누가 누구를 보는가**) | 중간 — 관찰자 축이 경쟁사-집합 신호로 승격될 수 있음 (§2.3) | 관계 게이트 subscribe-proxy (§2.3, 2026-07-23 전환) |
| 워크스페이스 디렉터리 (name↔UUID 맵) | 중간 — presence·기타 UUID 키 표면의 비익명화 오라클 | buyer 세션 + type=pg 한정 게이트 (§2.7) |
| 관측 데이터셋 (Axiom web-vitals) | 낮음 — 비밀은 없고 무결성(오염)·수집 비용만 문제 | 비인증 릴레이의 크기·형태 상한 + web-vitals 전용 데이터셋 (§4.1) |

## 2. Realtime (Centrifugo)

자체호스팅 Centrifugo v6 (Caddy `wss://`, `deploy/centrifugo/config.yaml`). 채널 이름의 단일 출처는 `lib/realtime/channels.ts`.

### 2.1 연결 인증

- 연결 토큰: `lib/server/realtime/token.ts` — HS256, `sub` = userId, `info` = `{ workspaceId }`(presence의 `connInfo`), `meta` = `{ workspaceId }`(subscribe proxy 전용 서버 context), TTL 30m. 둘은 같은 값으로 서명하며 `channel.proxy.subscribe.include_connection_meta=true`가 meta를 프록시에 전달한다. **`user`/`connInfo.workspaceId`/`meta.workspaceId`는 클라이언트가 위조할 수 없다**.
- 발급 라우트 `app/api/centrifugo/connection-token/route.ts`: 세션 필수(401) + 세션 취소(401) + 이메일 미인증(403) + 비활성 워크스페이스(403) + 미승인 PG 멤버십(403) 게이트, 동시 in-flight load-shed(503, 기본 25 — `CENTRIFUGO_TOKEN_MAX_INFLIGHT` 로 조정). 즉 **모든 WS 연결은 인증된 활성 워크스페이스 세션 뒤에 있다**.
- 재접속 부하를 줄이는 라우트 전용 10초 캐시는 사용자별 **DB 세션 버전·이메일 인증 여부**만 저장한다. 매 요청의 JWT 버전을 `isSessionVersionStale`로 비교하므로 같은 계정의 정상·폐기 세션이 앞선 요청의 허용/거부 판정을 공유하지 않는다. DB 변경 반영까지 최대 10초 지연은 유지하며 워크스페이스 활성 상태는 캐시하지 않는다. 가드: `app/api/centrifugo/connection-token/__tests__/route.test.ts`(양방향 요청 순서·구버전 세션·계정 분리·계정 삭제·TTL 경계·부하 차단).
- 세션 강제 종료: `disconnectCentrifugoUser` (session_version bump 후 호출).

### 2.2 채널 ACL 매트릭스

| 네임스페이스 | 채널 형식 | ACL | 가드 |
|---|---|---|---|
| `chat` | `chat:conversation:<uuid>` | subscribe-proxy — signed active workspace가 대화 양측 중 하나 | `app/api/centrifugo/subscribe/__tests__/route.test.ts` |
| `team` | `team:rfp:<rfpId>:<wsId>` | subscribe-proxy — signed active workspace = 채널 ws ∧ RFP 접근권 (buyer/PG 팀 채널 분리 = 봉인 입찰 불변식) | 상동 (t1–t6) |
| `presence` | `presence:ws:<wsId>` | subscribe-proxy — signed observer workspace와 대상의 **관계 게이트** (자기 자신∨대화∨RFP 초대∨pending 콜드피치, `PresenceAccessRepo.canObserve`) | 상동 (p1–p5) + `deploy/__tests__/centrifugo-presence-namespace.test.ts` + `lib/server/repositories/drizzle/__tests__/presence-access.test.ts` |

subscribe-proxy(`app/api/centrifugo/subscribe/route.ts`)의 불변식: signed `meta.workspaceId` 필수, 그 workspace의 active 상태와 정확한 사용자 멤버십을 매 구독에 DB에서 확인하며 PG는 `approved`만 허용한다. 이후 모든 채널 ACL은 그 workspace로만 판정한다. 항상 HTTP 200, 모든 거부는 동일한 generic deny(존재 오라클 없음), 예외 → deny(fail-closed), uuid 게이트 후 자원 DB 접근.

### 2.3 AR-1 — presence 관찰자 신원 노출 (**해소됨 2026-07-23** — 관계 게이트 전환)

**원 노출 (D1 완전 공개 모델, 2026-06-21 ~ 2026-07-23)**: 인증된 raw WS 클라이언트가 워크스페이스 UUID `V` 를 알면 `presence:ws:<V>` 를 구독하고 `sub.presence()`/join/leave 로 두 축을 열거할 수 있었다 —
1. **온라인 비트 축**: `V` 멤버 중 현재 온라인인 userId 목록.
2. **관찰자 축(더 민감)**: co-observer 의 `user` + `connInfo.workspaceId`. PG 가 구매사 브리프를 열람하거나 견적을 작성하는 순간 그 구매사 채널에 관찰자로 등장하므로(`RfpBriefPanel`·`BidContextStrip` → `CounterpartyProfileCard` → `useWorkspacePresence(buyerWsId)`), 구매사 채널의 관찰자 맵은 **"지금 이 구매사 딜에 붙어 있는 PG 집합"의 준실시간 표본** — 봉인 입찰의 경쟁사-수 불변식(`Bid.competitorCount` 는 설계상 부존재)에 닿는 신호였다.

전제조건이었던 "워크스페이스 UUID 지득"도 실질 장벽이 아니었다 — §2.7 의 디렉터리 API 가 당시 임의 인증 계정에 name↔UUID 맵(최대 500건)을 반환했으므로, 결합 시 노출 등급은 "관련 당사자만" 이 아니라 **"검증된 계정 누구나"** 였다. (초기 문서화가 이 두 사실을 부정확하게 서술했던 것을 적대 리뷰 2026-07-23 이 반증 — 그 정정이 본 전환의 직접 계기다.)

**해소**: presence 네임스페이스를 chat/team 과 같은 subscribe-proxy 로 전환. 허가 술어 = `PresenceAccessRepo.canObserve` (§2.6). 이제 presence 맵은 **해당 워크스페이스와 실제 사업 관계가 있는 당사자**에게만 보인다.

**잔여(수용)**: ① 관계 당사자 상호 간 관찰자 노출은 유지된다 — 대화 상대·초대 PG·pending 콜드피치 상대는 서로의 온라인/관찰을 본다(제품 기능 그 자체). ② 탐지 없음 — Centrifugo OSS 에는 채널 단위 감사 로그가 없다. ③ config 롤백(`allow_subscribe_for_client` 복원)은 공개 모델을 그대로 되살린다 — 롤백은 의식적 보안 결정이어야 하며, 드리프트 가드가 실수 롤백을 막는다.

**핀**: `deploy/__tests__/centrifugo-presence-namespace.test.ts` — proxy 활성 + 공개 fallback 키 부재를 단언(반전 이력: 이 가드는 2026-07-23 이전엔 정확히 반대(공개 모델)를 단언했다).

### 2.4 AR-2 — presence publish flood · 내용 주입, rate limit 부재 (수용)

원 설계(OV6)는 "per-client publish rate limit 필수"를 요구했으나, **per-connection/user 연산 rate limit 은 Centrifugo PRO 전용**이라 OSS 자체호스팅에서는 구현 불가하다. 수용하되 정확한 사실 위에서:

- **실효 완화**: ① 연결 자체가 인증 게이트(§2.1) + 토큰 발급 load-shed. ② publish 는 subscriber 한정(`allow_publish_for_subscriber`)이고, **2026-07-23 부터 subscribe 가 관계 게이트이므로 publish 가능 집단도 관계 당사자로 축소**됐다 (공개 모델에서는 "누구나 구독 → 누구나 publish" 라 이 완화가 공허했다).
- **명목뿐인 완화(주의)**: `deriveActivity` 의 `{state}` enum 검증(`lib/realtime/presence.ts`)은 현재 **도달 불가능한 코드**다 — presence 구독은 publication 핸들러를 등록하지 않고, state 는 서버 서명 connInfo 에서만 읽히며, 토큰은 state 를 서명하지 않는다. 쓰레기 publish 가 무해한 실제 이유는 "아무도 읽지 않아서"이지 enum 검증이 아니다. M2 활동 레이어를 배선하는 엔지니어는 이 검증을 "이미 방어됨"으로 읽지 말 것 — publication 소비를 켜는 순간 이것이 *계획된* 게이트다.
- **내용 주입·은닉 릴레이 축**: 관계 당사자는 임의 페이로드를 상대 presence 채널에 publish 할 수 있고 `history_size: 1`/`history_ttl: 60s` 가 60초 보관한다. 현재 `.history()` 호출 코드는 0곳(config 주석의 late-observer 복구는 aspirational) — 보관은 순수 잉여 표면이다. 관계 게이트로 "임의 인증 계정 → 임의 워크스페이스" 주입은 닫혔지만, 관계 내 주입은 남는다. M2 착수 시 history 필요성을 재평가하고, 불요면 `history_*`·`allow_history_for_subscriber` 제거 검토(TODOS 참조).
- **잔여**: 인증·관계 게이트를 통과한 계정에 의한 CPU/fanout 남용 — Axiom 로그·PM2/Centrifugo 메트릭으로 사후 탐지.

### 2.5 배포 불변식 — subscribe-proxy 공유 비밀 fail-open

`CENTRIFUGO_PROXY_SECRET` 미설정 시 subscribe-proxy 라우트는 모든 요청을 거부한다. 설정 시에는 상수시간 비교한다. 개발 환경도 같은 비밀값을 앱과 컨테이너에 지정한다. **prod 에서는 반드시 설정**해야 하며(라우트가 Caddy 뒤에서 공개 도달 가능), 컨테이너 쪽 주입 경로는 `CENTRIFUGO_VAR_PROXY_SECRET` — **prod compose 와 dev compose(realtime 프로필) 모두** 이 브리지를 정의한다(한쪽만 있으면 v5 `static_http_headers` 팬텀 키 사고와 같은 "헤더 없는 프록시 → 전 구독 거부" 클래스가 재발한다). 가드: `deploy/__tests__/centrifugo-proxy-secret.test.ts` (양쪽 compose 단언).

### 2.6 presence 관계 게이트 — 구현 기록 (2026-07-23)

- **술어** (`lib/server/repositories/drizzle/presence-access.ts`): `canObserve(observerWsId, targetWsId)` = 자기 자신 ∨ 대화 ∨ RFP 초대 쌍(상태 무관) ∨ **pending** 콜드피치 쌍(거절은 영구 — rejected는 절대 허가 금지). 전 절 방향 대칭. 대화-이전 UI 표면 5곳(`RfpBriefPanel`·`BidContextStrip`·`RfpInviteManager`·`FocusComparison`·`RfpPendingRequests`)이 초대·콜드피치 절에 의존한다.
- **관찰자 ws 해석 (2026-10-17 강화)**: `info`는 subscribe request에 없지만 연결 JWT의 서버 전용 `meta`는 proxy의 `include_connection_meta`로 전달할 수 있다. 라우트는 `{user, meta.workspaceId}`의 active/approved 실효 멤버십을 먼저 확인하고 그 정확한 workspace 쌍만 저장소에 넘긴다. 다른 pending·rejected·비활성 잔존 멤버십의 관계를 끌어올 수 없다.
- **config**: presence 블록 = `subscribe_proxy_enabled: true` + `allow_subscribe_for_client` **부재 필수** — v6 권한 평가는 "먼저 허용하는 메커니즘이 이긴다" 순서(공식 channel permission 문서 확인 2026-07-23)라 남겨두면 proxy deny 후 fallback grant 로 공개 모델이 조용히 부활한다.
- **배포 순서 (역순 = 전면 블랙아웃)**: config 변경을 pull한 뒤 **Centrifugo 먼저 재시작 → strict 앱 PM2 reload**. 구 앱은 추가 meta를 무시하지만 새 앱+구 proxy는 meta 부재를 전부 거부한다. 최초 컷은 실행 중인 구 스크립트의 자기 갱신을 신뢰하지 않고 런북의 수동 pull/restart를 먼저 수행한다. 그 다음부터 `lightsail-deploy.sh`가 config diff를 감지해 순서를 자동 적용한다. 이후 관계 계정 2종의 점과 무관 계정 raw 구독 거부를 확인한다.
- **비용·거동**: 탭당 최대 51채널(INTEREST_CAP 50 + 자기 채널) × 재연결마다 proxy 왕복, 매 구독의 실효 멤버십 1회 + presence 관계 최대 3회 인덱스 점조회(조기 반환). proxy deny는 centrifuge-js에 비일시 오류로 전달돼 재시도 루프를 만들지 않고, 해당 점은 offline으로 읽힌다.

### 2.7 AR-3 — 워크스페이스 디렉터리 API (**게이트 도입 2026-07-23**, 잔여 수용)

`GET /api/workspaces/search` 는 name↔UUID 디렉터리(최대 500건)를 반환한다. **2026-07-23 이전에는 인증만 통과하면 양방향(type=buyer 포함) 전체 열거가 가능**했고, 이것이 §2.3 관찰자 축의 비익명화 오라클이었다. 현재 게이트: **buyer 활성 세션 + `type=pg` 질의만 허용**(정규 소비자 = 견적요청 위저드 PG 피커 단일). 구매사 디렉터리(type=buyer)는 소비자가 없어 전면 거부.

**노출 축소 (v0.4.53.0)**: 디렉터리가 이제 `status='active'` 로 한정된다 — 그 전에는 조건이 `type` 하나뿐이라 **심사 대기(`pending`)·정지(`suspended`) 워크스페이스까지** 모든 구매사의 피커에 떴다(셀프서비스 생성 기본값이 `pending` 이므로 아무나 만든 이름이 즉시 열거됐다). 같은 조회에서 테스트용 PG(이름에 `test`/`테스트` 포함)도 기본 제외된다 — 규칙 단일 출처는 `lib/features/test-pg.ts`, 유일한 게이트는 `DrizzleWorkspaceRepository.search()` 다. **이건 보안 경계가 아니라 가시성 조정이다**: 해제 수단이 `support-b-show-test-pg=1` 쿠키라 이름을 아는 사람은 누구나 켤 수 있고(`/login/ops` 의 숨은 URL 과 같은 성격), 위 인증·역할 게이트가 실제 경계로 남는다.

**잔여(수용)**: 가입이 열려 있으므로 buyer 계정을 만들면 PG 디렉터리는 여전히 열거 가능하다 — 위저드 피커가 전체 목록을 요구하는 한 구조적이며, PG 디렉터리 자체는 저민감(PG 사는 공개 영업 주체)으로 판단. 재검토 트리거: PG 측이 UUID 로 키되는 새 공개 표면 추가, 또는 buyer 가입 게이트 완화. 가드: `app/api/workspaces/search/__tests__/route.test.ts`, `lib/server/repositories/drizzle/__tests__/workspace.test.ts`(status·이름 게이트).

## 3. 포인터 절 — 다른 신뢰 경계 (여기가 SSOT 아님)

각 항목의 규범 서술과 강제 지점은 링크된 코드·테스트·문서가 소유한다. 이 절은 색인일 뿐이다.

### 3.1 봉인 입찰 공개 경계

신규 계약의 과거 PG 이력 제거는 `RfpService.createRfp`가 저장·멱등 키 계산 전에 수행한다. 액션을 거치지 않는 서비스 호출에도 적용하며, 갱신 계약의 값과 PG 독립 사업 정보는 보존한다. 규범: `lib/server/services/__tests__/rfp-phase2b.test.ts`의 `직접 생성에서도 계약 유형` 케이스.
오픈보드 공개 필드 화이트리스트는 `OpportunityListing`(`lib/types/pg-request.ts`) + 명시 SELECT projection + exact-key 가드 테스트가 강제하고, 산문 SSOT 는 CLAUDE.md Domain Context 블록 한 곳이다. 초대 PG 대상 필드 숨김은 `hidden_from_pg` 경로 allowlist 를 `PG_STRIP` 이 fail-closed 로 strip 한다(`loadPgRfpDetail`). 신원 카드 PII 는 `lib/server/user-profile-loader.ts` 가 관계 fail-closed.

수정 견적 이력은 구매사에게 해당 요청의 전체 제출 회차만, PG에게 자기 워크스페이스의 제출 회차만 제공한다(`loadBuyerRfpDetail`/`loadPgRfpDetail`). PG 응답에는 경쟁 PG의 견적 ID·조건·첨부가 들어가지 않는다. 기존 견적서 PDF 재사용은 원본 첨부의 소유 bid를 유지하고 새 bid가 `proposal_source_bid_id`로 직접 가리킨다. 재제출 트랜잭션은 RFP 행 잠금 뒤 현재 수정 요청 ID·마감 판본·직전 bid ID를 비교하며, 재사용할 ready 첨부의 실제 소유 bid가 같은 요청·PG인지 다시 확인한다. 규범: `lib/server/__tests__/rfp-detail-loader.test.ts`, `lib/server/services/__tests__/bidSubmit.test.ts`, `lib/server/repositories/drizzle/__tests__/bid.test.ts`.

**견적 수정 요청 운영계정 수신 (2026-10-19)**: `RfpService.requote`만 대상 PG 승인 멤버에 서버 `MASTER_ACCOUNT_EMAILS` allowlist의 등록 사용자를 추가한다. 기존 정규화(trim·소문자·중복 제거)를 공유하고 DB 조회는 `userId/email`만 반환한다. 탈퇴(`deletedAt`)·로그인 불가(`passwordHash='!'`) 계정은 제외하며 `isSystemAccount`는 실제 운영계정에도 사용하므로 제외 기준이 아니다. 멤버십·마지막 선택 workspace에 관계없이 수정 내용이 운영계정 이메일로 전달되는 의도적 수신 범위다. 같은 사용자는 대상 PG별 한 번만 수신하고 앱 알림은 해당 PG workspace에 귀속해 기존 조회 격리를 유지한다. 요청·앱 알림·메일 outbox는 같은 트랜잭션으로 저장하고 커밋 뒤에만 실시간 전달·메일 flush를 실행한다. 이메일 링크는 자동 workspace 전환이나 접근 권한을 부여하지 않으며 기존 서버 ACL을 통과해야 한다. 다른 알림 정책·과거 요청은 변경하지 않는다. 규범: `lib/server/services/__tests__/requote.test.ts`.

### 3.2 SnowSign 전자서명

현재 신규 계약의 권한·참여자·문서 경계는 위 **노온–구매사 전환 경계**를 따른다. 아래의 PG 작성·템플릿·임베드·복구·이어받기·PG 업무 요약은 과거 `pg_buyer` 구현과 당시 위험 판단의 기록이다. 해당 사용자 진입점은 폐지됐으며, 기존 발송 건의 내부 상태 동기화·보존에 필요한 검증만 유지한다. 웹훅 HMAC·재조회·요청 예산과 상태 단조성은 신규 계약에도 적용한다. 아래 역사 기록을 신규 발송·사용자 다운로드 권한으로 해석하지 않는다. 2026-10-30 테스트 정리에서 폐지된 작성 UI·발송·복구·리스 시나리오를 제거했다. 현행 폐지 경계는 `lib/server/actions/signing/__tests__/retired-signing.test.ts`, 기존 계약 동기화·격리·완료 멱등성은 `lib/server/services/__tests__/contract-signing.test.ts`, 저장소 CAS는 `lib/server/repositories/drizzle/__tests__/signing-contract.test.ts`가 검증한다.

**공통 장기합의서 (2026-09-20, 발송 경합 보강 v0.32.1.0)**: 회사 정보 초안은 선정 PG만 쓰고 읽는다. 신규 초안의 자동 입력은 동일 PG의 완성된 저장 이력만 조회하며, 구매사 필드는 PG·구매사 워크스페이스 쌍으로 제한한다. 타 PG의 초안이나 구매사 공용 프로필에는 쓰지 않는다. 기존 초안(빈 필드 포함)·발송 스냅샷은 재사용 기본값으로 덮어쓰지 않는다. 구매사는 발송된 문서 스냅샷만 읽으며 경쟁 PG는 접근하지 못한다. 최종 요율·본문은 서버에서 구성하고 입력 스키마는 추가 필드를 거부한다. 미리보기 stamp의 재검증, PG 기준/계약 행 잠금, revision CAS와 발송 리스가 저장·준비를 검증한다. 리스 만료 뒤 저장이 성공하면 같은 계약 행 잠금 안에서 이전 리스 토큰·소유자를 무효화하고, 공통 합의서의 `bindDraftRef`는 준비 당시 `claimedAt` 정확일치를 요구한다. 이 두 검사가 바인딩 전 만료 작업의 ref와 새 prepared가 결합하는 경합을 외부 발송 전에 막는다. 정상 sent 커밋은 렌더한 문서를 sent_document에 보존하며 새 계약의 레거시 PDF·임의 attach 우회를 서버에서 차단한다. **발송·완료 경합 보강 (2026-10-18):** 참여자 스냅샷이 없는 조기 웹훅은 보류하고 self-heal/후속 폴링으로 회복한다. `patchContract`의 `in_progress` 쓰기는 종결 상태를 제외하는 SQL 조건으로 보호한다. [발송 프로토콜 감사](audits/2026-10-02-agreement-protocol.md)의 다섯 경합 테스트는 모두 정상 회귀 테스트이며 예상 실패가 없다. 가드: `lib/server/services/__tests__/agreement.test.ts`, `agreement-send.test.ts`, `agreement-expired-lease.test.ts`, `lib/server/repositories/drizzle/__tests__/agreement.test.ts`, `signing-contract.test.ts`, `lib/server/signing/__tests__/agreement-document.test.ts`. 운영 권한의 표준 요율 쓰기와 감사는 별도 admin-supporter-b의 `agreementRates.test.ts`가 소유한다. 문안의 법적 효력·대표자의 서명 권한 확인은 기술 검증의 범위가 아니며 출시 전 운영 검토 대상이다.
웹훅 `POST /api/signing/webhook` 은 HMAC-SHA256 검증 + payload 불신(트리거 전용, 상태는 재조회 단일 경로), 시크릿 미설정 시 401 fail-closed. **v0.4.42.0 추가**: `contract_id` 는 임베드/액션 경로와 같은 `CONTRACT_ID_RE` 화이트리스트를 통과해야 하고(형식 검증을 통과한 것만 리미터 예산을 소모한다), 재조회는 인메모리 **계약별 10/분 + 전역 백스톱 30/분**(`webhook-rate-limit.ts`, PM2 단일 fork 전제)으로 캡한다 — 리플레이에 타임스탬프/nonce 방어가 없어 인증 요청 1개가 provider `getContract` 1회로 증폭되던 DoS 축을 닫은 것. 전역 카운터 하나가 아니라 계약별 키잉인 이유: 유효 쌍 하나의 재전송이 창을 상시 포화시켜 **다른 모든 계약**의 웹훅 트리거를 굶기는 것을 막는다. 초과·형식 불일치 스킵은 `logger.warn`(`signing.webhook_throttled`/`webhook_id_rejected`)으로 관측된다(초과분은 200 ack 만, 폴링이 백스톱). **잔여 수용**: 재전송 자체는 여전히 유효하다(상태 부작용 0) — provider 타임스탬프 헤더 실측 후 재평가, TODOS.md Signing 절. 현행 계약 조회·조작은 구매사 workspace와 `platform_buyer`를 요구한다. 과거의 낙찰 PG + buyer ACL은 아래 역사 기록에만 해당한다. 상세는 CLAUDE.md Domain Context.

두 번째 인바운드 경계 — **발송 임베드의 `postMessage`** (`SigningSendEmbed`, v0.4.37.0 에서 템플릿 등록 화면 폐지와 함께 딜룸 계약 탭으로 이관). **스테이크가 올라갔다**: 예전 메시지는 "템플릿 id" 를 실어왔지만 지금은 **어떤 스노우싸인 계약을 우리 계약 행에 바인딩할지**를 실어온다. 그래서 클라이언트 가드는 방어심층일 뿐이고 **진짜 게이트는 서버**다 — `attachProviderContract` 가 ① ACL 재검증(낙찰 PG 인가) ② `getContract` 재조회(실재하는가) ③ **실제 발송 여부**(`isDispatchedProviderStatus` — `draft` 거부) ④ `provider_ref` 바인딩 유일성(다른 계약이 이미 쥐고 있지 않은가) ⑤ 지정 구매사 + 승인된 낙찰 PG 멤버만 참여하고 전원이 `identity_verification` 을 쓰는지 확인 ⑥ `markSentIfAwaiting` CAS 를 모두 통과해야 상태가 바뀐다. 멱등이라 중복 도착은 무해하다. ③이 없으면 완료 이벤트를 위조하거나 초안 id 를 흘려 **아무에게도 발송되지 않은 계약으로 딜룸을 `sent` 로 만들고 양측에 알림까지 트리거**할 수 있었다(구매사는 오지 않을 서명 메일을 기다린다).

**⚠️ `external_id` 소유 검증은 현재 작동하지 않는다 (잔여 수용, P2).** 코드에는 `external_id === sc:<signingContractId>` 검증이 있지만, 실측(2026-08-01, `docs/SNOWSIGN_SANDBOX.md` Q3) 결과 `GET /v1/contracts/{id}` 응답에 `external_id`·`integration` 키가 **아예 없어** 그 분기가 한 번도 실행되지 않는다. 대신 실제 바인딩 방어선은 위 ①③④⑤⑥이다(②는 실재 확인). 지정 구매사·승인 PG 이메일과 본인인증 정책이 모두 일치하지 않는 계약은 fresh/recovery/self-heal 어느 경로에서도 로컬 `provider_ref`·참여자·알림에 연결되지 않는다. 남는 위험은 **같은 구매사 담당자와 같은 승인 PG 멤버가 본인인증으로 참여한 다른 계약**의 UUID를 아는 경우다. 단일 `SNOWSIGN_API_KEY`=1 org이고 딜별 상관키는 회신되지 않으므로 이 경우까지는 구분할 수 없다. 계약 id 는 비열거·불투명 UUID이고 이미 바인딩된 계약은 선착순 가드로 보호된다. 고아 복구 다이얼로그가 후보의 `providerContractId` 를 브라우저로 보내므로, 스캔이 한 번이라도 노출한 id 는 어느 딜에 붙이든 그 딜의 `participantsMatchDeal` 상관키도 통과해야 한다(`signing_contracts.recovery_refs`). 검증 코드는 유지한다 — 공급자가 필드를 추가하면 딜별 소유 검증이 즉시 복원된다. 잔여를 완전히 닫는 방법은 TODOS.md Signing 절 "external_id 소유 검증이 현재 무력"을 따른다.

클라이언트 가드는 유지된다: 핸들러는 `iframeUrl` 에서 파생한 origin 과 정확히 일치하는 메시지만 받고(**파싱 실패 시 모두 거부** — v0.4.30.0 의 fail-closed 전환을 그대로 이식), 이벤트 네임스페이스(`snowsign.embed.`)와 계약 id 경로-세그먼트 화이트리스트를 `lib/signing/embed-events.ts` 순수 함수가 강제하며, 완료는 1회만 처리한다. iframe 은 `sandbox`(top-navigation 제외) + `referrerPolicy="no-referrer"` 로 가둔다. 폐지된 임베드 UI 테스트는 제거했으며, 이벤트 파서의 검증은 `lib/signing/__tests__/embed-events.test.ts`에 남아 있다.

**잔여 수용**: ① `e.source` 미검증 — 같은 origin 의 다른 창은 통과한다(서버 게이트가 뒤에 있어 실피해로 이어지지 않는다). ② 신뢰 origin 을 공급자 응답(`iframe_url`)에서 파생하므로 allowlist 가 아니다 — 앱 전체에 CSP 자체가 없어 `frame-src` 핀도 없다. 둘 다 TODOS.md Design 절 "스노우싸인 임베드 iframe 하드닝" · "postMessage 핸들러가 `e.source` 를 검증하지 않음" 참조.

**중복 발송 창 (수용, v0.4.38.0)**: 발송 리스를 **강제로 이어받을 수 있다** — 임베드를 열어둔 채 자리를 비운 탭이 하트비트로 리스를 무한 연장해 팀이 영구히 막히는 것을 푸는 유일한 길이다. 이어받기는 `awaiting_pg_template` + 낙찰 PG 워크스페이스로만 게이트되며(강제되는 것은 리스 경합뿐, 상태·ACL 은 그대로), 밀려난 사람과 감사 기록은 CAS 쓰기 시점의 실제 소유자다. **위험은 공급자에 임베드 세션 취소 API 가 없다는 데서 온다**: 뺏겨도 동료의 iframe 은 살아 있어(발급된 세션 payload `expires_at` ≈1시간) 그 화면에서 발송이 가능하다. 완화는 즉시 차단 신호다 — 밀려난 사람에게만 가는 인앱 알림이 SSE 로 그 브라우저에 닿아 패널을 내리고(발송 버튼은 우리 iframe 안에만 있다), 실시간이 끊긴 경우 ≤60초 하트비트가 같은 일을 한다. **그 신호가 닿기 위한 조건들이 실제로 성립하는지가 이 완화의 전부**라, 적대 리뷰에서 성립하지 않던 경로 넷을 닫았다: 구독이 스트림을 열지 않아 모바일(사이드바가 Sheet 안)에서 신호가 100% 죽던 것, 구독이 패널 수명에 묶여 세션 발급 왕복 중 도착한 알림이 사라지던 것, 이어받기가 발급보다 먼저 커밋돼 실패 시 동료 작업만 잃던 것, 자기 리스를 자기가 이어받아 같은 사람 iframe 이 둘 살던 것. **남는 조건**: 배포 시점에 살아 있던 리스는 소유자가 NULL 이라 그 창에서는 알림이 나가지 않는다(하트비트 폴백만 적용). 밀려난 사람이 워크스페이스 승인 멤버가 아니게 된 경우도 같다. **닫히지 않는 창**: 이어받기와 신호 도착 사이 찰나에 동료가 발송을 누르면 계약이 두 건 살아나고, 진 쪽은 `provider_ref` 를 받지 못해 딜룸에서 취소할 수 없다(구매사에는 서명 요청이 두 통 간다). 확인 다이얼로그가 이 가능성을 사용자에게 문구로 경고하며(`딜룸에서 관리할 수 없어요`), 보상 취소 경로는 이번 범위 밖이다 — TODOS.md Signing 절. 폐지된 이어받기 서비스 시나리오는 제거했으며, 신호 파서의 검증은 `lib/signing/__tests__/takeover-signal.test.ts`에 남아 있다.

**임베드 참여자 신뢰 경계 (2026-10-16 강화)**: 임베드는 참여자 프리필을 지원하지 않아 **PG 가 구매사 서명자 이메일과 인증수단을 직접 설정한다**. 임베드 패널은 정확한 이름·이메일을 띄우되, 표시는 권한 검사가 아니다. `SigningSentCommit.bindObserved`가 지정 구매사 이메일, 승인된 낙찰 PG 멤버 allowlist, 제3자 부재, 전원 `identity_verification`을 양성 증명할 때만 계약을 권위 상태에 바인딩한다. 어긋난 계약은 앱에 ref를 보존하지 않아 앱 안에서 취소할 수 없으며, PG가 스노우싸인에서 직접 취소한 뒤 올바른 당사자·본인인증으로 다시 보내야 한다. 이 계약은 로컬 상태·알림·문서 접근·완료 전이에 영향을 주지 않는다. 기존에 이미 바인딩된 경고-only 행은 공통 `resolveAuthoritativeSigningContext`가 영속 참여자의 이메일·userId·역할·`easy_cert`를 현재 지정 구매사/승인 PG 명단에 대조한다. 불일치하면 provider 상태·참여자 미러링·리마인더·종결 알림·완료·자동 보관본 생성/수집/다운로드를 모두 차단하고 앱 내 취소만 허용한다. 패치 전 승인 PG 동료의 userId가 비어 있어도 현재 승인 명단의 정확한 이메일과 강한 인증이 맞으면 정상 계약으로 복구한다. 반송(`email_delivery=bounced`)과 과거 행의 수신자 불일치 지속 경고는 탐지 UI로 남는다.

**서명 본인인증 강제 (v0.4.46.0, v0.4.50.0, 임베드 v0.39.0.0)**: 템플릿 인증수단은 공급자가 **템플릿 역할 단위**로만 저장해 계약별로 지정할 수 없다. 그래서 템플릿 경로의 "이 계약은 본인인증으로 서명된다"는 성질은 **템플릿 정책(`easy_cert`) + 발송 시 양측 phone** 의 짝으로 성립한다. `sendFromTemplate` 이 공급자 왕복 **전에** ① `resolveSecurityMethod` 로 양측 phone(010 만) ② `getTemplate` 의 `signers[].security_method` 가 두 역할 모두 `easy_cert` 인지 정확일치 를 확인하고, 어느 쪽이든 실패하면 **강등이 아니라 차단**한다. 임베드 경로는 계약별 참여자가 `identity_verification`인지 공급자 재조회 결과로 확인해, 한 명이라도 누락·이메일 인증이면 바인딩하지 않는다. 정책 조회 실패도 통과시키지 않는다.

**v0.4.50.0 이 닫은 것**: ①②는 *새로 만드는* 계약만 지킨다. `providerRef` 가 이미 있으면 생성을 건너뛰고 곧장 발송하므로, 본인인증 도입 **이전에** 생성과 발송 사이에서 죽은 시도가 남긴 초안(= 공급자 기본 email 정책)이 ①②를 모두 통과한 뒤 그대로 나갈 수 있었다. 참여자 행에는 무조건 `easy_cert` 가 적히므로 **계약은 이메일 링크로 서명 가능한데 딜룸·타임라인은 본인인증을 주장하는** 상태가 된다(reconcile 이 바로잡는 건 계약이 나간 뒤라 강제가 아니다). 도달 경로는 평범한 재시도였고, 처방된 복구(`TEMPLATE_AUTH_NOT_ENFORCED` → 템플릿 재저장)가 오히려 방아쇠였다 — 재저장이 ②를 풀어 주면 다음 시도가 옛 초안을 재사용한다. 그래서 재사용은 이제 **양성 증명**을 요구한다: 재시도 진입의 H3 프로브가 이미 조회하는 계약 상세로 **초안 자신의 참여자 정책**(`isDraftAuthEnforced` — 참여자 2인 이상 + 전원 `identity_verification`, fail-closed)을 확인하고, 아니면 `providerRef` 를 버리고 새로 만든다. **프로브가 실패하면 발송하지 않는다**(리스는 반납, `providerRef` 는 보존 — 일시 실패였는데 실제로는 발송된 계약이었다면 지우는 순간 취소 핸들을 잃는다). ⚠️ 어휘가 갈린다: 계약 **참여자**는 `identity_verification`, 템플릿 **서명자**는 `easy_cert`(`docs/SNOWSIGN_SANDBOX.md` S4) — 혼동하면 판정이 뒤집혀 재사용이 조용히 죽는다. 리터럴 단일 출처는 `PROVIDER_ENFORCED_SECURITY_METHOD`(`lib/signing/security-method.ts`).

**초안 출처·판본 게이트 (v0.4.52.0)**: `signing_contracts.provider_ref` 는 세 경로(임베드 바인딩·템플릿 지름길·자체 발송 compose)가 공유하는 **하나의 슬롯**이고, `sendFromTemplate` 은 재진입 시 그 ref 가 있으면 create 를 건너뛰고 곧장 send 한다. 재사용 게이트가 `isDraftAuthEnforced` 하나뿐이었을 때 **다른 계약서가 발송되는 축이 둘** 있었다 — 인증 판정으로는 어느 쪽도 못 거른다(양측에 010 번호가 있으면 어느 출처의 초안이든 참여자 전원 `identity_verification` 이라 통과한다): ① compose 초안을 템플릿 버튼이 재사용(Stage 2 가 배선하면 열린다) ② **compose 없이도 성립** — 템플릿 수정이 `pg_signing_templates` 행의 provider id 를 in-place 로 갈아치우므로(그것이 수정의 목적), send 실패 → 템플릿 수정 → 재시도가 **옛 판 PDF·옛 서명칸** 초안을 발송한다. 화면은 "연결된 템플릿을 보냈다"고 말한다. 닫는 법은 재사용을 두 조건의 AND 로 좁히는 것이다 — `origin === 'template'` **그리고** 초안에 기록된 판본이 지금 연결된 템플릿과 일치. 출처 미상(이 기능 이전 행)은 **fail-closed**(없는 값을 신뢰로 읽는 것이 v0.4.50.0 fail-open 의 모양이었고, 판본 조건이 어차피 걸러 비용도 0이다). 기록은 `bindDraftRef` 가 **한 UPDATE** 로만 하고, 지우기는 `clearDraftRefIf`(기대 ref + awaiting 상태 CAS — 출처·판본을 같은 UPDATE 로 NULL) 하나다 — `SigningContractPatch` 에서 `providerRef`·`snowsignTemplateId` 팔을 **삭제**해 반쪽 쓰기·반쪽 지우기가 컴파일 타임에 표현 불가능하다(`patchContract` 는 정의된 필드만 SET 하므로 팔이 남아 있으면 출처가 직전 값으로 남아 다음 초안이 오분류된다). 재바인딩(`markSentIfAwaiting` — provider_ref 의 두 번째 쓰기 경로)도 필수 `draft` 판별 필드로 출처·판본을 같은 UPDATE 로 정리한다(템플릿 발송 = 유지, 임베드 attach·복구·자가치유 = NULL) — 안 하면 남은 template 출처가 임베드 계약에 옮겨 붙어 게이트가 거짓 출처를 참으로 읽는다. `provider_ref IS NULL` CAS 라 낡은 스냅샷이 남의 핸들을 덮어쓸 수 없고, id 만 보던 블라인드 clear 가 프로브 왕복 중 임베드 attach(리스 무요구)가 바인딩한 **발송된** 계약의 ref 를 지워 "sent + provider_ref NULL = 영구 조정불가"(reconcile 즉시 반환) 행을 만들던 축도 clear CAS 가 봉인한다 — 실패는 CONTRACT_BUSY 로 물러난다(`resolveStaleEmbedRef` 의 임베드 진입 clear 포함, 플래그 무관 상시 경로). 그리고 게이트가 검증한 ref(지금 DB)와 send 가 실제로 보내는 ref(리스 직후 스냅샷)의 **동일성을 요구한다** — 다르면 상태 프로브·인증 판정을 통과하지 않은 값이 발송되므로 검증된 쪽으로 갈아타지도 않고 CONTRACT_BUSY 로 물러난다. **판정은 리스 획득 뒤 재조회한 계약 행으로 한다** — `active`(`findActiveByRfp`) 는 `findById` 로 리스 뒤에 다시 읽고, 게이트의 비교 상대인 초안 기록(`findDraftRef`)도 게이트 호출 그 순간 새로 조회한다 — 상호배제 밖에서 읽은 스냅샷으로 판정하면 게이트가 아니다(이전에는 계약 행도 리스 이전 스냅샷이었고, 그래서 두 템플릿 시도가 서로의 ref 를 덮어쓸 수 있었다). 비교의 다른 한쪽 — 지금 보내려는 템플릿의 판본 — 도 **재사용 게이트 직전에 재조회**하며(v0.4.56.0), 이후의 정책 게이트·create·draft 기록이 전부 그 재조회본을 쓴다(게이트만 새 판을 보면 create 가 옛 판으로 만든다 — 더 나쁘다). 잔여는 재조회와 create 사이(정책 게이트 provider 왕복)에 커밋된 수정 한 부류뿐이고, 그 경우도 `bindDraftRef` 가 실제 사용한 판본을 기록해 다음 재시도의 판본 게이트가 잡는다(TODOS.md Signing 절 해결 항목의 잔여 서술 참조). 발송 **후** 바인딩(임베드)은 이 게이트 밖이며, 그 면역의 근거는 상태 게이트다(`sendFromTemplate` 이 awaiting 아닌 행에 `ALREADY_SENT`) — 그 게이트가 움직이면 면역도 함께 움직인다. 과거 서비스의 `초안 출처·템플릿 동일성 게이트` 시나리오는 기능 폐지 후 제거했다. 저장소 검증은 `signing-contract.test.ts` 의 `bindDraftRef`·`findDraftRef` 케이스에 남아 있다(당시 각 보장은 변이로 RED 를 확인했다 — 게이트 무력화·판본 조건 제거·NULL fail-open·항상폐기·재조회 제거·CAS 술어 제거가 각각 다른 테스트를 깨뜨리고, clear·재바인딩 하드닝도 같은 방식으로 확인했다: clearDraftRefIf 의 WHERE ref 제거·WHERE status 제거·ref 동일성 분기 무력화·markSentIfAwaiting 의 출처 정리 제거가 각각 다른 테스트를 깨뜨린다). **잔여**: `createSendEmbedSession` 에도 같은 리스-이전 읽기가 남아 있다(TODOS.md Signing 절 P3).

**강제의 실제 범위**: 템플릿 지름길은 발송 전에 템플릿 정책과 양측 휴대폰을 확인한다. 건별 임베드는 `POST /v1/embed-sessions`에 보안정책 파라미터가 없어 PG가 iframe 안에서 직접 설정하지만, 발송 뒤 `getContract`가 돌려준 실제 참여자 전원의 `identity_verification`을 확인하기 전에는 로컬 계약에 바인딩하지 않는다. 따라서 임베드의 잘못된 설정은 이미 외부 메일을 보낸 뒤 발견될 수 있으나 앱의 권위 계약으로 강등 수용하지 않는다. 현재 유지하는 규범은 `lib/server/services/__tests__/contract-signing.test.ts`의 레거시 격리 케이스와 `lib/signing/__tests__/security-method.test.ts`다. 폐지된 템플릿·임베드 발송 시나리오는 제거했다. 잔여(404 `provider_ref` 자가치유 없음, 옛 템플릿 판본 PDF 재사용)는 TODOS.md Signing 절.

**PG 계약 업무 요약 (2026-09-22)**: 홈·목록·상세의 새 요약 조회는 `rfps.awarded_bid_id`와 견적의 PG workspace를 SQL에서 대조하고 최신 계약 회차만 반환한다. 초안 본문·연락처·공급자 ID는 제외하고 상태·revision·준비/공급자 계약 존재 여부만 반환한다. 상세 진입의 승인/선정 ACL과 실제 저장·발송 서비스의 재검증은 그대로 적용한다. 가드: `lib/server/repositories/drizzle/__tests__/agreement.test.ts`, `lib/server/__tests__/rfp-detail-loader-signing.test.ts`.

### 3.3 파일 스토리지 (R2) — 첨부 · 계약 보관 문서
업로드 = presign 2-phase + 서버 스니핑 검증, 일반 다운로드 = ACL 검증 후 302 presigned GET(TTL 15분). PDF 썸네일 요청(`GET /api/files/{id}?preview=1`)은 같은 첨부 행·워크스페이스 ACL을 다시 확인하고 `application/pdf`만 앱에서 스트리밍한다. 응답은 `no-store`·`nosniff`·`Content-Disposition: attachment`를 사용하며, R2 바이트를 서버 메모리에 통째로 쌓지 않는다. 규범은 `app/api/files/[id]/route.ts`와 `app/api/files/__tests__/get.test.ts`다. 브라우저의 PUT 대상은 최종 키가 아니라 `pending/<final>` staging 키다. complete 는 HEAD 의 ETag 로 range GET 과 CopyObject 를 조건부 실행한 뒤에만 최종 키를 ready 로 공개한다. 검증 뒤 PUT URL을 재사용해 staging 객체를 덮어써도 최종 객체는 바뀌지 않고, 검증 도중 교체는 409 로 닫힌다. 재사용된 URL로 ready 이후 다시 생긴 staging 객체는 DB pending row가 없어 앱 sweeper가 찾을 수 없으므로, 물리 키 prefix `attachments/pending/`에 별도 R2 lifecycle 만료 규칙을 둔다. 완료본 다운로드 프록시의 잔여 하드닝은 TODOS.md 참조.

**현행 계약 보관**: 사용자 목록·상세·다운로드는 구매사 소유의 `platform_buyer` 완료본과 감사추적인증서만 제공한다. 수동 업로드의 presign·complete는 404이며, 기존 업로드·PG 계약 보관 행은 운영 보존 전용이다. 신규 완료본 생성은 구매사 한 행으로 제한한다. 아래 두 문단은 폐지된 업로드 기능과 기존 저장 구조의 역사 기록이며 신규 사용자 권한을 정의하지 않는다. 공급자 문서를 수집하는 아웃바운드 fetch의 크기·시간·네트워크 검증은 유지한다.

**과거 계약 보관 문서 (v0.5.3.0)** — 같은 버킷의 별도 키 공간(`contract-archives/…`)에 두 부류가 산다: 전자서명 완료본·감사추적인증서의 **우리 사본**(cron 하이드레이션)과 플랫폼 밖 계약서의 **수동 업로드**. presign·complete 라우트는 첨부 라우트와 같은 `lib/server/presigned-upload/module.ts` 전이를 쓰고, 계약 보관함 전용 어댑터가 PDF·30MB·200건 cap·행 매핑 정책을 맡는다. 다운로드까지 포함한 세 라우트(`/api/contract-archives/presign` · `/{id}/complete` · `/{id}/download`)는 공통 `checkBusinessApiSession`으로 세션 폐기·이메일 인증·워크스페이스 활성 상태·PG 멤버십 승인을 검사한다(`/api` 라우트는 프록시 매처 밖이므로 각 핸들러가 공통 게이트를 직접 호출한다). **행 접근 ACL의 SSOT는 행 소유 워크스페이스**다. 여기에 `source='signing'` 자동 보관본만 법적 무결성 게이트를 추가해 생성·하이드레이션·다운로드마다 서명자 정책을 재검증한다. 약한 레거시 참조는 pending 행을 failed로 격리하고 공급자 문서도 받지 않으며, 이미 ready인 행도 URL을 내주지 않는다. 수동 업로드는 서명자 정책 대상이 아니다. ⚠️ **업로드 2단계(`/complete`)만 술어가 다르다**: 아직 `pending` 인 자기 업로드를 마무리하는 호출이라 `createdBy === session.user.id`(업로더 본인)로 좁혀, 같은 워크스페이스 동료도 404 를 받는다. 즉 **한 행의 유효 주체가 단계에 따라 넓어진다**(pending = 업로더 → ready = 워크스페이스) — 새 라우트를 붙일 때 둘 중 어느 술어인지 먼저 정할 것. 남의 행에는 403 이 아니라 **404**, 비-uuid 도 404 로 맞춘다 — 상태 코드가 존재 오라클이 되지 않게(`getForActor` 의 ACL-먼저 규율과 같은 이유이고, 비-uuid 를 그대로 넘기면 Postgres 22P02 가 처리되지 않은 500 으로 샌다). presign 정책: PDF 전용 · 건당 30MB · 워크스페이스당 업로드 200건 캡 · PUT TTL 10분이며, phase-2 가 `head` 크기 + 첫 4KB 매직바이트로 **클라이언트 자기신고를 재검증**하고 불일치면 객체·행을 함께 폐기한다. 삭제는 `source='upload'` 만 — 자동 보관본은 서버(`deleteUpload`)가 거부하고 UI 의 `canDelete` 는 그 파생일 뿐이다(보존 원칙). **새 아웃바운드 축**: 하이드레이션 fetch 는 앞선 공급자 문서 경로들과 달리 사용자 브라우저를 302 로 보내지 않고 **우리 VM 에서 직접 나간다** — `https://` 강제 + 청크 누적 실바이트 30MB 캡(`content-length` 사전 게이트만으로는 chunked 응답이 헤더 없이 그냥 통과한다) + 15초 데드라인이 방어이고, **호스트 핀은 없다**(완료본 URL 이 API 호스트가 아니라 열거 불가능한 S3 presigned 라서 — 템플릿 PDF 를 302 대신 프록시하는 것과 같은 이유). 가드: `app/api/contract-archives/__tests__/*`, `lib/server/services/__tests__/contract-archive.test.ts`.

**과거 수동 계약 업로드 동시성** — 워크스페이스당 200건 제한은 count 후 별도 insert 하지 않는다. workspace 행을 `FOR UPDATE` 로 잠근 트랜잭션 안에서 count+pending insert 를 묶어, 동시에 들어온 두 presign 이 200번째 슬롯을 함께 통과하지 못하게 한다. 검증 실패 정리는 staging 객체를 먼저 지운 뒤 pending 행 삭제 CAS를 이긴 요청만 최종 키를 지운다. 이미 ready가 된 동시 요청의 최종 객체는 패자가 제거할 수 없고, HEAD 이후 staging이 사라지면 행을 재조회해 ready는 멱등 성공·그 외는 409로 수렴한다.

**v0.9.0.0 하드닝**: 위 아웃바운드 fetch 는 `https://`만 허용하고, URL 호스트의 DNS 해석값이 사설·루프백·링크로컬·예약 주소를 하나라도 포함하면 요청 전에 거부한다. fetch의 자동 redirect도 금지한다. 완료본 URL이 열거 불가능한 S3 presigned 호스트일 수 있어 호스트 allowlist 대신, 검증된 공인 IP를 요청별 DNS lookup에 고정해 DNS 재바인딩도 막는다.

### 3.4 인증·게이트
`public/images/**`의 PG 브랜드 이미지는 비로그인 랜딩·튜토리얼용 공개 정적 자산이므로 인증 프록시에서 제외한다. 제외 규칙은 세그먼트 경계에 고정하여 `/images-editor`처럼 이름만 비슷한 업무 경로에는 적용하지 않는다. 사용자 업로드 로고·첨부의 `/api` 인증·ACL은 각 라우트가 계속 검증한다. 규범: `lib/auth/__tests__/proxy-matcher.test.ts`의 공개 이미지·세그먼트 경계·인라인 매처 정합 검사.

셸 가드 순서·이메일 인증 게이트는 `lib/auth/shell-access.ts` + CLAUDE.md Routing Architecture. 워크스페이스 업무 요청은 `requireSession`과 API의 `isWorkspaceInactive`에서 현재 DB 상태가 active인지 검사한다. pending·suspended·삭제된 워크스페이스는 차단하며 운영계정도 상태 게이트를 우회하지 않는다. 계정 복구·가입·초대 수락·워크스페이스 전환만 명시적 `allowInactiveWorkspace` 예외를 사용한다. 이미 열린 SSE/WS 연결의 즉시 종료는 이 요청 단위 게이트의 범위 밖이다.

**공개 휴대폰 OTP 발송 예산 (2026-10-16)**: 가입 전에도 호출하는 `sendPhoneOtpAction`은 세션 없이 열려 있으므로 정규화한 전화번호별 최근 10분 3건을 DB 쓰기 경계에서 강제한다. `PhoneOtpRepo.reserveIssuance`가 번호에서 파생한 transaction-scoped advisory lock을 잡은 뒤 최근 행 count와 새 OTP 행 insert를 같은 트랜잭션에서 수행한다. 따라서 여러 프로세스의 병렬 요청도 같은 슬롯을 함께 통과하지 못하고, 외부 SMS 호출은 예약 커밋 뒤에만 일어난다. 예약 행은 처음부터 만료 상태라 공급자 응답 대기 중에는 인증할 수 없고, 발송 성공 뒤에만 5분 유효 상태로 활성화한다. 공급자 호출 오류는 이미 메시지가 접수됐을 가능성을 배제할 수 없으므로 행을 삭제하지 않고 비활성 상태로 10분 예산에 남긴다. 번호 표현의 공백·하이픈은 잠금 키를 만들기 전에 같은 숫자열로 정규화한다. 규범: `lib/server/actions/auth/__tests__/sendPhoneOtp.test.ts`의 병렬 발송·공급자 실패·응답 대기 중 인증 차단·정상 발송 케이스. **잔여**: 번호 단위 경계이므로 여러 번호를 순회하는 공격의 IP별·전역 공급자 비용 예산은 별도다.

**휴대폰 OTP proof 소비 경계 (2026-10-17)**: 인증번호 성공 뒤 클라이언트가 받는 UUID는 5분짜리 작업 proof이며 영구 인증 표식이 아니다. 발급·검증은 `signup`과 `profile_phone_update` 목적을 분리하고, 프로필 변경 proof는 발급 당시 로그인 사용자 ID에도 묶는다. 가입 세 경로와 프로필 번호 변경은 `(id, 정규화 번호, 목적, 사용자 바인딩, proof_expires_at, consumed_at IS NULL)`을 조건으로 한 단일 `UPDATE ... RETURNING`을 보호 쓰기와 같은 트랜잭션에서 실행한다. 따라서 순차·동시 재사용은 한 건만 이기고 뒤 쓰기가 실패하면 소비도 롤백된다. 가입 트랜잭션이 proof 소비 전 미인증 재가입 상태를 정리한 뒤 소비 경쟁에서 지면 정상 반환으로 커밋하지 않고 예외로 전체 정리를 롤백한다. 외부 사업자 조회 전 `isConsumable` 사전검사는 비용 방어일 뿐 권위 경계가 아니다. 배포 전 행은 목적을 알 수 없으므로 `purpose=NULL`·`proof_expires_at=NULL`로 남겨 fail-closed 하며 백필하지 않는다. 규범: `lib/server/repositories/drizzle/__tests__/phone-otp.test.ts`, `lib/server/services/__tests__/auth.test.ts`, `lib/server/actions/user/__tests__/updateMyPhone.test.ts`.

**인증번호 비교 횟수 (2026-10-18)**: 휴대전화·이메일 코드는 해시 비교 전에 미만료·미사용 행의 `attempts < 5`를 조건으로 원자 증가한다. 읽기 이후 병렬 요청이 들어와도 정확히 5건까지만 비교한다. 비교 성공도 한 슬롯을 소비하며, 인증 결과의 단일사용 경계와 별개다. 규범: `lib/server/actions/auth/__tests__/verifyPhoneOtp.test.ts`, `lib/server/repositories/drizzle/__tests__/verification-token.test.ts`.

**가입 후 이메일 활성화 경계 (2026-10-16)**: 일반 가입은 비밀번호 계정을 먼저 만들지만, 그 뒤 발급하는 `signup_email` 토큰은 불변 `users.id`에 묶는다. 가입 전 unbound 발급과 가입 후 bound 발급은 dedupe 키도 분리해 전자가 후자를 억누르지 못한다. 링크와 6자리 코드는 발급 당시 사용자와 같은 provisional 세션을 양성 확인한 뒤에만 정확한 토큰 행을 소비하고 `markEmailVerifiedById`를 실행한다. 세션 부재·다른 사용자·깨진 바인딩·삭제/교체된 행은 토큰을 소비하지 않고 거부한다. 가입 전 레거시 unbound 토큰은 호환상 소비할 수 있어도 나중에 만들어진 사용자 행을 활성화하지 않는다. 검증·소비·활성화와 `sessionVersion` 증가는 한 트랜잭션이며, 활성화와 미인증 재가입 정리는 같은 사용자 행의 `FOR UPDATE` 잠금을 먼저 잡아 인증 직후 계정 교체 경합을 막는다. 인증 시 사용자 행 잠금 안에서 현재 세션 버전도 검증한다. 성공한 트랜잭션만 사용자 ID·이전/새 버전의 갱신 근거를 액션에 반환하고, 액션은 이를 응답에서 제거한 뒤 요청별 AsyncLocalStorage 범위 안에서 Auth.js 세션을 교체한다. JWT 콜백은 같은 사용자·이전 버전·정확히 1 증가한 새 버전·DB의 현재 인증/삭제/버전을 다시 확인한다. 공개 session POST나 일반 refresh는 이 범위를 만들지 못하므로 다른 provisional JWT는 계속 폐기 상태다. 쿠키 교체 실패는 소비된 증명을 재시도하지 않고 재로그인으로 복구한다. 탭 간 BroadcastChannel은 비밀값 없는 완료 신호일 뿐이며 수신 탭은 자신의 이메일과 유효 세션을 서버에 재확인한다. 상태 조회는 Auth.js 프록시를 거치지 않는 `/api/auth/email-verification`에서 쿠키를 쓰지 않고 `private, no-store`로 응답한다. 인증 여부·사용자 ID·세션 버전은 같은 DB 행 스냅샷에서 확인해 인증 전 조회가 인증 후 상태와 섞이거나 늦은 조회 응답이 새 쿠키를 덮어쓰지 않게 한다. 다른 기기의 링크는 먼저 provisional 계정 로그인 후 아직 소비되지 않은 링크로 돌아오고, 다른 계정 세션이면 그 세션을 로그아웃한 뒤 같은 링크를 보존한다. 규범: `lib/server/actions/auth/__tests__/verifyFlipsEmailVerified.test.ts`, `lib/server/actions/auth/__tests__/purgeUnverifiedSignup.test.ts`, `lib/server/repositories/drizzle/__tests__/verification-token.test.ts`, `lib/auth/__tests__/logout-route.test.ts`, `lib/auth/__tests__/master-login.test.ts`, `lib/server/actions/auth/__tests__/myEmailVerification.test.ts`, `app/(public)/auth/verify/__tests__/page.test.tsx`, `components/pending-approval/__tests__/email-verification-handoff.test.tsx`, `e2e/email-verification-resume.spec.ts`.

**라우터 사전 로딩과 세션 쿠키 (2026-10-26)**: `/logout`을 가리키는 `next/link`는 `prefetch={false}`로 자동 요청을 막는다. 방어적으로 GET `/logout`도 `next-router-prefetch` 헤더가 있는 요청에는 로그아웃이나 쿠키 변경 없이 204를 반환한다. Auth.js 프록시는 콜백 실행 뒤 세션 쿠키를 재발급하므로, `proxy.ts`의 바깥 래퍼가 모든 라우터 사전 로딩 응답에서 세션 쿠키 계열(청크 포함)의 `Set-Cookie`만 제거한다. 인증 직전 출발한 요청이 늦게 도착해 갱신된 쿠키를 폐기된 이전 세션으로 덮어쓰는 경합을 막는다. 다른 쿠키와 일반 탐색의 세션 갱신은 유지하며, `rsc` 헤더만 있는 실제 클릭은 정상적으로 로그아웃한다. 사전 로딩 헤더는 인증 우회 근거가 아니며 기존 라우팅·서버 세션 검증은 그대로 실행한다. 규범: `app/__tests__/logout-link-prefetch.test.ts`, `app/__tests__/logout-route.test.ts`, `lib/auth/__tests__/proxy-prefetch-cookie.test.ts`, `e2e/email-verification-resume.spec.ts`.

**업무 HTTP API 공통 경계 (2026-10-13, 실시간 구독 보강 2026-10-17)**: 일반 첨부의 presign·complete·조회·삭제, 계약 보관함 다운로드 API(수동 업로드 API는 현재 404), 알림 목록·스트림과 워크스페이스 검색은 `lib/server/http/business-api-session.ts`의 `checkBusinessApiSession`을 사용한다. 세션 부재·폐기는 401, 이메일 미인증·비활성/없는 워크스페이스·미승인 PG 멤버십은 403이다. PG 승인은 DB의 `approved`만 허용하며 대기·거절·멤버십 행 부재는 차단한다. 기존 서버 allowlist 운영계정의 synthetic membership 예외는 유지하되 workspace 상태는 우회하지 않는다. 응답 형식과 자원 소유권 검사는 각 라우트가 유지한다. 연결 토큰은 기존 계정 상태 캐시 검사 뒤 `checkBusinessWorkspace`로 workspace·PG 승인을 매 요청 다시 읽으며, 이 두 판정은 10초 캐시에 넣지 않는다. subscribe proxy도 signed connection meta의 정확한 workspace를 기준으로 active/approved 상태를 매 구독 재확인한다. 거부된 요청은 파일 처리·토큰 발급·스트림 구독에 도달하지 않는다. 이미 열린 구독의 승인·workspace 상태 변경 재검사는 별도 범위다. 규범: `lib/auth/__tests__/business-api-session.test.ts`, `app/api/centrifugo/subscribe/__tests__/route.test.ts`.

**가입 동의 증빙 (미출시)**: sessionStorage·체크박스·클라이언트 시간·입력 판본은 비신뢰 데이터다. 구매사/PG사 일반 가입·워크스페이스 초대 가입·기존 PG사 합류의 세 액션과 `AuthService`가 필수 동의와 현재 catalog의 판본을 확인한다. 승인된 고정 문서가 없으면 가입을 거부한다. 현재 catalog는 미등록이며 운영/문서 책임자의 원문·판본·시행일 확정 전에는 출시하지 않는다. 사용자 생성·워크스페이스 생성/합류와 `user_signup_consents` INSERT는 같은 DB 트랜잭션을 사용한다. 기록 시각은 서버가 결정하고, 선택 마케팅은 누락 시 `false`이며 필수 동의와 분리한다. 기존 사용자에게 행을 백필하지 않으며 행 부재는 동의 여부를 알 수 없는 상태다. 판본 ID의 일치 검사는 사용자에게 제공한 본문의 법률적 적정성·실제 열람 여부를 증명하지 않는다. 불변 원문 공개·승인과 과거 판본 보존은 [가입 동의 런북](SIGNUP_CONSENT_ROLLOUT.md)의 운영 책임이다.

동의 행은 사용자당 하나이며 필수 동의 `CHECK true`와 사용자 FK로 제약한다. 일반 탈퇴의 soft-delete는 증빙을 보존하고, 기존 미인증 가입의 물리 삭제에는 `ON DELETE CASCADE`가 적용된다. 미인증 계정 정리 뒤 새 가입이 실패하면 같은 트랜잭션이 이전 계정·증빙 삭제도 롤백한다. 규범: `lib/auth/__tests__/signup-consent.test.ts`, `lib/auth/__tests__/finalize-signup.test.ts`, `lib/server/actions/auth/__tests__/signup-consent.test.ts`, `scripts/migrations/__tests__/signup-consents.test.ts`.

**세션 갱신 입력은 비신뢰 데이터다 (2026-09-23)**: 공개 `/api/auth/session` POST와 서버 `unstable_update`는 같은 JWT 콜백을 호출한다. 공유 edge 콜백은 입력된 workspaceId/type/role을 병합하지 않는다. Node 콜백은 대상 멤버십을 DB에서 검증하고 유형·역할을 도출한다. 운영계정은 서버 allowlist와 활성 workspace를 확인한다. 일반 세션 조회도 권한을 다시 도출하므로 수정 이전에 발급된 비인가 회사 claim은 다음 서버 조회에서 제거된다. 사용자 id/email/sessionVersion은 갱신 입력으로 변경하지 않는다.

규범 테스트: `lib/auth/__tests__/jwt-callback.test.ts`, `master-login.test.ts`, `workspace-status.test.ts`(실 DB 상태 변경, 구매사·PG·공용 액션, 파일·계약·로고·알림·토큰 API 차단).

**운영계정의 워크스페이스 관리 경계 (v0.10.0.0)**: `MASTER_ACCOUNT_EMAILS` allowlist에 든 운영계정은 멤버십 행 없이 선택한 모든 워크스페이스의 이름 변경 요청·멤버 초대/재발송/취소·역할 변경·내보내기와 활동 기록 조회를 할 수 있다. 쓰기 서비스는 세션의 master 표시가 아니라 DB에서 다시 읽은 사용자 이메일을 allowlist와 대조하고, 액션은 화면이 렌더한 `workspaceId`와 현재 세션 워크스페이스가 다르면 `WORKSPACE_CHANGED`로 거부한다. 운영계정도 마지막 승인 admin을 없앨 수 없으며, 트랜잭션 안의 잠금 카운트가 동시 강등·내보내기를 막는다. 권한 출처는 감사 행의 `actorWasMaster`에 쓰기 시점 값으로 남고, 레거시 행만 현재 allowlist로 폴백한다. 상세 규범과 가드는 CLAUDE.md의 같은 제목 블록, `lib/server/services/__tests__/workspace.test.ts`, `lib/server/actions/workspace/__tests__/workspaceTargetGuard.test.ts`, `app/(app)/settings/audit-log/__tests__/page.test.tsx`가 소유한다.

### 3.5 스테이징 세션 격리

`APP_ENV=staging`은 발급·로그아웃·사전 로딩 응답 정리 모두 별도 `authjs.staging.session-token` 패밀리를 사용한다. 운영의 `.support-b.com` 쿠키는 브라우저 규칙상 `dev.support-b.com`에도 전송되므로 쿠키 도메인 변경만으로 격리되지 않는다. 스테이징은 독립 `AUTH_SECRET`과 `.dev.support-b.com` 도메인을 함께 사용하며, 운영 패밀리를 인증 또는 정리 대상으로 삼지 않는다. 이는 쿠키 충돌 방지이며 스테이징 서버로 운영 쿠키가 전송되는 것 자체를 막지는 않는다. 서버는 신뢰되는 팀 전용으로 제한하고 독립 DB·저장소·외부 서비스 자격증명을 사용한다. 규범: `lib/auth/__tests__/cookie-config.test.ts`. 구성과 활성화 절차는 [스테이징 런북](STAGING.md)을 따른다.

스테이징 웹페이지·앱 API는 Caddy Basic Auth를 추가로 요구한다. 두 호스트에서 공용 WebSocket 주소를 쓸 때 브라우저가 다른 호스트의 Basic Auth를 제공하지 못하므로 `/connection/*`는 그 추가 게이트에서 제외한다. Centrifugo의 유효한 연결 JWT, 허용 Origin, 서버의 signed workspace 기반 구독 ACL은 그대로 필수다. 토큰 발급 API는 Basic Auth·앱 세션·active/approved 게이트를 통과해야 한다. 규범: `app/api/centrifugo/connection-token/__tests__/route.test.ts` · `app/api/centrifugo/subscribe/__tests__/route.test.ts`.

## 4. 관측 — web-vitals 수집 릴레이

### 4.1 AR-4 — `/api/axiom` 비인증 개방 (수용)

브라우저 web-vitals(`components/shell/WebVitals.tsx`)는 `POST /api/axiom`(`app/api/axiom/route.ts`)에 JSON 배열을 keepalive 로 보내고, 서버가 Axiom 토큰으로 web-vitals 데이터셋에 넣는다. 익명 방문자(랜딩)도 보내야 하므로 **인증 게이트가 없고**, `/api` 는 프록시 매처 밖이라 라우트 자체가 유일한 방어선이다. 벤더 `createProxyRouteHandler` 는 검증·상한이 전무해서 쓰지 않았다.

- **완화**:
  - 본문 64KB 상한은 **읽는 동안** 건다 — content-length 가 없는 청크 전송도 상한을 넘는 순간 스트림을 끊고 413(버퍼링 뒤에 재면 상한이 메모리를 지키지 못한다). 이벤트 100개 초과도 413.
  - `source:'web-vital'` + `webVital` 객체 형태이고 다시 직렬화할 수 있는 이벤트만 받는다(400). JSON 중첩은 Node/V8 별 직렬화 스택 차이에 의존하지 않고 100단까지만 허용한다. 직렬화가 던지거나 지나치게 깊은 이벤트 하나가 공유 Axiom 배치에 들어가면 그 배치의 남의 이벤트까지 함께 버려질 수 있기 때문이다.
  - 응답은 Axiom 전송을 기다리지 않는다 — 배치 클라이언트의 1초 타이머가 보낸다(요청마다 flush 를 기다리면 모든 비콘이 직렬화된 Axiom 왕복 뒤에 줄 선다).
  - **데이터셋 분리**: web-vitals 전용 `NEXT_PUBLIC_AXIOM_TOKEN`+`NEXT_PUBLIC_AXIOM_DATASET` 쌍이 있을 때만 켜지고 운영 로그용 `AXIOM_*` 로 폴백하지 않는다 — 폴백하면 익명 호출자가 장애 조사용 pino 데이터셋에 레코드를 위조할 수 있다. 토큰은 서버에서만 읽는다(`lib/observability/axiom-server.ts`, `server-only`). Axiom 미설정이면 204 no-op.
- **완화 (2026-10-18)**: 본문 읽기 3초를 넘으면 408, 단일 PM2 프로세스에서 분당 IP별 60회·전체 300회를 넘으면 429로 거부한다. Caddy가 지정하는 마지막 X-Forwarded-For 홉을 사용한다. 메모리 예산은 재시작 시 초기화된다.
- **잔여**: 예산 안의 이벤트 내용은 위조 가능하다. 관측 전용으로 사용하며 제품 권한이나 업무 결정에 쓰지 않는다.
- **재검토 트리거**: Axiom 수집량 급증, 또는 web-vitals 를 제품 결정에 쓰기 시작할 때 → TODOS.md "Observability" 의 레이트리밋 항목.
- **핀**: `app/api/axiom/__tests__/route.test.ts`(스트리밍 상한·형태·직렬화·no-op), `lib/observability/__tests__/axiom-server.test.ts`(운영 로그 데이터셋 폴백 없음), `lib/auth/__tests__/proxy-matcher.test.ts`(퇴역한 `/_axiom` 이 더는 인증 프록시 면제가 아님).


### 4.2 구매사 GA4 퍼널 (2026-10-18)

`lib/analytics/funnel.ts`는 고정 이벤트·단계·속성 값과 정제한 경로만 GA4에 전송한다. 내부 사용자 ID는 로그인 세션의 User-ID 설정에만 쓰고, 이메일·답변·인증 토큰·견적 ID·요청 멱등 키를 이벤트에 담지 않는다. 세션 미확정 이벤트는 유한 큐에서 기다리고 PG·운영계정은 폐기한다. 개발·데모·튜토리얼도 제외한다. 유입은 허용된 캠페인 값과 referrer 도메인만 전달한다. 향상된 자동 측정은 꺼진 상태를 전제로 한다.

관측 데이터는 클라이언트가 위조·누락할 수 있으며 업무 성공의 감사 증빙이 아니다. SDK 차단, 저장소 초기화, 다른 기기의 익명 활동은 완전 복구하지 않는다. 규범 테스트: `lib/analytics/__tests__/funnel.test.ts`, `use-funnel.test.tsx`, `components/rfp/__tests__/RfpCreateWizard.test.tsx`. 운영 설정·보고서 의미는 [퍼널 분석](FUNNEL_ANALYTICS.md)을 따른다.

2026-10-22 docs 경유: `docs-assist.ts`는 전용 쿼리의 중복·형식·공개 경로·위치·소스/매체를 검증하고 30일 이내 기록만 사용한다. docs 경로의 쿼리·해시와 임의 캠페인 문자열은 보내지 않는다. `docs_main_arrival`도 같은 세션/계정 전송 게이트를 거치며, 성공 이벤트의 기존 멱등 키를 유지한다. 가입 DB와 내부 행동 수집 스키마는 바꾸지 않는다. 프록시의 `x-sb-docs-query`는 외부 요청 헤더를 삭제한 뒤 허용된 쿼리 키·값 길이로 다시 만들고 서버 리다이렉트에만 사용한다. 이 정보는 분석용 비신뢰 입력이며 인증·역할·권한 판단에 사용하지 않는다. 가드: `docs-assist.test.ts`, `docs-arrival-redirect.test.ts`, `FirstTouchCapture.test.tsx`.

## 5. 맞춤 PG 상담 (2026-09-19)

신규 `send=true`는 업종과 제출 키를 필수로 받아 기존 발송 경로로 우회하지 못한다. 서비스는 최신 관리자 정책과 활성 PG·단일 선택을 검증한다. 미설정/Black 업종은 접수 불가다. 구매사별 요청 키 UNIQUE + 구매사 행 잠금으로 재시도를 합친다.

검토·견적·철회·다음 요청·선정은 동일 RFP 행 잠금 안에서 재검증한다. 진행 상담 부분 UNIQUE 인덱스가 동시 두 PG 접수를 막는다. 다음 요청은 직전 종결 검토 ID와 새 미래 마감일을 요구한다. 현재 PG만 자기 검토를 변경한다. 거절·철회 PG의 초대 읽기 권한은 보존하되 제출은 차단한다. 과거 라운드 철회로 현재 상담을 종료하지 못하며 최신 견적 철회는 해당 PG의 모든 제출 라운드를 닫는다.

신규 상담은 게시판 비공개이고 기존 추가 초대·참여 수락·공개 전환 경로도 서비스에서 거부한다. PG 로더는 자기 검토의 id/status/reason만 직렬화하며 후보 목록·타 PG 이력·분류는 보내지 않는다. 관리자 정책 쓰기는 관리자 인증 및 감사 로그 트랜잭션을 거친다. 추천은 운영표의 판단이며 사업 적법성을 자동 인증하는 기능이 아니다.

규범 테스트: `lib/server/services/__tests__/pg-matching.test.ts`, `lib/rfp/__tests__/pg-matching.test.ts`, admin-supporter-b의 `pgMatchingPolicy.test.ts`. 실제 여정은 `e2e/scenario-a-buyer-rfp.spec.ts`.


### 직접 입력 업종의 추천 경계 (2026-09-24)

구매사가 보낸 업종 ID와 직접 입력 이름은 `industrySelectionSchema`에서 상호 배타적으로 검증하며 서비스가 직접 호출되어도 같은 검증을 수행한다. 이름은 공백·대소문자 정규화 후 기존 업종과 대조하므로 일치하는 Black 정책을 기본 PG로 우회하지 않는다. 공용 업종 목록에는 쓰지 않는다. `is_custom_industry`는 서버가 판정하며 클라이언트 입력을 받지 않는다. 삭제된 등록 업종의 NULL ID와 직접 입력의 NULL ID를 구분하여 재추천 우회를 막는다. 업종명 스냅샷은 기존 딜룸 ACL을 통과한 PG에게만 공개하고 오픈 게시판 projection에는 추가하지 않는다.

가드: `lib/server/services/__tests__/pg-matching.test.ts`의 직접 입력 업종 테스트, `lib/server/repositories/drizzle/__tests__/pg-matching-defaults.test.ts`의 삭제/Black 우회 차단 테스트.

### 갱신 계약의 기존 PG (2026-10-16)

`rfp_matching_requests.current_pgs`는 구매사 비공개 목록이다. 공통 `RFP`·`current_terms`에는 넣지 않고, `PgMatchingService.forBuyer`의 소유 워크스페이스 확인 후에만 반환한다. PG 상세·게시판·이메일·견적 및 상담 운영 알림에 전달하지 않는다. 가입에 연결된 공개 초안은 §7의 입점 심사 Slack 요약에 현재 PG 이름을 포함한다. 공개 작성은 기존 가입 화면의 `listCanonicalPgWorkspaces`에서 ID·이름만 받고 전체 디렉터리를 열지 않는다.

등록 ID는 PG 워크스페이스인지 확인하고 서버 이름으로 저장한다. 직접 입력은 공백·영문 대소문자 정규화 후 정확 일치만 연결한다. `RfpService.createRfp`는 트랜잭션 안에서 검증·정규화·후보 제외를 다시 수행하고, 다음 상담은 저장 목록과 이전 상담 ID를 함께 제외한다. 추천 UI의 필터나 전달된 회사명을 신뢰하지 않는다. 멱등 비교는 정렬·중복 제거된 ID/정규화 이름 집합을 사용한다.

가드: `lib/server/services/__tests__/pg-matching.test.ts`의 “갱신의 기존 PG 비공개 제외”, `lib/server/repositories/drizzle/__tests__/pg-matching-defaults.test.ts`.

## 6. 한국 영업일 견적 마감 (2026-09-26)

공식 공휴일 응답과 운영자 임시휴일은 **외부·운영 입력**이다. `getRestDeInfo`의 성공 코드·필수 항목·페이지 수·날짜 범위와 전체 응답 크기·수집 시간을 검증한 뒤 올해·다음 해를 한 트랜잭션에서 교체한다. 일부 월·연도만 성공하거나 API 키가 없으면 마지막 정상 달력을 유지한다. 미적재 구간을 근무일로 추정하지 않으며 서버 쓰기 경계가 해당 날짜와 견적 상태를 재검증한다. 수동 예외의 사유·출처·변경자와 추가 휴일 이벤트는 불변 행으로 남는다. 마감 자체는 자동 이동하지 않는다. 가드: `lib/server/calendar/__tests__/official.test.ts`, `lib/server/calendar/__tests__/sync.test.ts`, `lib/server/repositories/drizzle/__tests__/business-calendar.test.ts`, `lib/server/services/__tests__/pg-matching.test.ts`.

`/api/cron/sync-business-calendar`와 `/api/cron/rfp-deadlines`는 프록시 매처 밖의 서버 작업이므로 비어 있지 않은 `CRON_SECRET` 헤더를 상수시간 비교한다. 사용자 액션은 구매사 워크스페이스 소유권·현재 라운드·마감 범위를 트랜잭션 안에서 확인한다. 리마인더·마감·휴일변경 안내는 `deadline_notification_deliveries`의 이벤트·견적·수신자별 멱등 키로 중복 전송을 막는다. 가드: `app/api/cron/sync-business-calendar/__tests__/route.test.ts`, `app/api/cron/rfp-deadlines/__tests__/route.test.ts`, `lib/server/repositories/drizzle/__tests__/deadline-notification.test.ts`. 배포 순서는 `docs/BUSINESS_DEADLINES_ROLLOUT.md`를 따른다.


## 7. 로그인 전 견적 작성 (2026-10-11)

`/quote-start`만 정확일치 공개 경로다(접두어 확장 없음). 페이지는 noindex/nofollow이며 sitemap에 추가하지 않는다. 업종 공개 조회는 `id/name/mccCode`만 명시 SELECT하고 PG 워크스페이스 ID·매칭 정책은 조회하지 않는다. 가드: `lib/auth/__tests__/guest-quote-route.test.ts`, `lib/server/repositories/drizzle/__tests__/guest-rfp.test.ts`.

브라우저 답변·원본은 비신뢰 입력이다. localStorage의 구조를 확인하고 기존 질문/최종 서버 검증을 다시 거친다. IDB에는 작성 중 원본을 보관한다. 가입 버튼은 아래 공개 업로드 경계로 서버 원본을 먼저 저장하며, 기존 로그인 경로는 인증 이후 presign/complete ACL·매직바이트·크기 검증을 사용한다. 복원은 활성 구매사 게이트 뒤에서 진행한다. 브라우저의 소유자 표식은 UX 격리이며 보안 권한이 아니다. presign의 `x-draft-user/x-draft-workspace`와 최종 액션의 기대 actor는 현재 세션과 일치해야 한다. 직접 필드를 조작해도 기존 세션 ACL을 우회할 수 없다. 가드: `app/api/files/__tests__/presign.test.ts`, `lib/server/actions/rfp/__tests__/guest-actor.test.ts`.

공개 이벤트 API는 strict allowlist 스키마, 4KiB body cap(스트림 포함), 3초 body 읽기 제한, 동일 Origin·cross-site 차단, 프로세스당 IP 10회/분·전체 60회/분 제한을 적용한다. Origin과 ingress Host는 `appOrigins().buyer` 설정과 정확히 일치해야 하며, TLS 프록시 뒤의 Next 내부 URL이나 클라이언트가 보낸 forwarded host/proto로 허용 출처를 확장하지 않는다. IP는 공개 Caddy가 만든 X-Forwarded-For의 마지막 값을 사용하며 저장하지 않는다. 단일 PM2 프로세스 전제의 인메모리 제한이므로 재시작·멀티프로세스에 걸친 전역 한도는 보장하지 않는다. 비브라우저 클라이언트는 Origin을 위조할 수 있다. 이 Origin·호출 제한만으로 외부 스팸을 완전히 차단하지 않는다. 스레드 모드의 초안 증명·소유권 검증은 아래 별도 경계다. 가드: `app/api/guest-rfp/events/__tests__/route.test.ts`.

응답 유실 복구용 첨부 확인은 현재 구매사 워크스페이스의 요청 키가 가리키는 견적에서 ready 첨부와 요청 ID의 교집합만 반환한다. 다른 워크스페이스·요청 키의 claimed 첨부를 유효하게 만들지 않으며, 실제 발송은 기존 요청 해시 비교와 최종 claim 권한 검사를 유지한다. 가드: `lib/server/actions/rfp/__tests__/verify-draft-files.test.ts`, `components/rfp/__tests__/GuestQuoteResume.test.tsx`.

**레거시 웹훅 모드:** `(draft_id,event)` DB PK를 먼저 선점하고 Slack에는 홈페이지·업종·제목·계약 유형·첨부 개수·초안 ID와 선택 Clarity 재생 링크를 전달한다. 첫 입력의 `started`는 홈페이지 없이 허용하고 `completed`는 유효한 홈페이지를 요구한다. Clarity 사용자/세션 ID는 각각 소문자 영숫자 1~64자만 받고, URL은 서버에서 고정 호스트·프로젝트 ID로 만든다. 클라이언트 지정 URL·프로젝트·추가 키는 받지 않는다. ID는 관측 상관관계용 비신뢰 값이며 인증이나 실제 녹화 존재를 증명하지 않는다. Clarity ID와 재생 URL도 DB 이벤트 행·오류 로그에는 보관하지 않는다. 자유문자열은 `escapeSlackText`를 사용하고 금액·수수료·메모·파일 원본은 제외한다. 실패·미설정·전송 중 프로세스 종료도 자동 재발송하지 않는다. 최대 한 번 시도를 선택했으므로 유실 가능성이 있지만 중복 전송을 피한다. `claimed`는 결과 미확정이며 운영자가 행을 삭제해 재시도를 유도하면 중복될 수 있다. 예외 로그는 ID·이벤트만 남긴다. 가드: 이벤트 route·service·repository 테스트와 `lib/attachments/__tests__/guest-events.test.ts`.

브라우저 저장소는 동일 출처 스크립트와 기기 사용자에게 노출된다. 사용자에게 같은 브라우저 보존과 운영팀 요약 전달을 알린다. 공개 초안은 마지막 성공 저장 후 24시간에 만료되며 사이트 진입·탭 복귀·1분 주기 및 초안 접근 때 정리한다. 브라우저 중단 중에는 실행할 수 없고 첨부 삭제 실패는 로컬 정리 기록으로 재시도한다. 기존 무시각 초안은 첫 읽기부터 24시간을 부여한다. 브라우저 전용 사본에는 기기 간 동기화가 없고, 성공적인 요청 또는 명시적 삭제 때도 정리한다. 만료 가드: `lib/stores/__tests__/guest-draft-expiry.test.ts`, `components/shell/__tests__/GuestDraftExpiry.test.tsx`. 서버 가입 연결 전 브라우저 저장소 삭제·eviction 시 복원할 수 없으며 파일 누락은 제출 차단으로 드러낸다. localStorage revision 검사는 낡은 탭의 순차 덮어쓰기를 거부하지만 원자적인 탭 간 잠금은 아니다.

### 가입 연결 서버 초안 (2026-10-16)

공개 `/api/guest-rfp/drafts`는 strict 질문 allowlist, 읽는 중 64KiB 상한·3초 제한, 동일 buyer Origin/Host, IP 60회/분·프로세스 전체 240회/분 제한을 적용한다. 비밀값은 서버가 발급하고 HttpOnly/SameSite=Strict/운영 Secure 쿠키에만 보관하며 DB에는 SHA-256 해시를 저장한다. UUID만으로 조회·수정·가입 연결할 수 없다. 공개 GET/다운로드는 제공하지 않는다. Origin·IP 한도의 배포 전제와 비브라우저 위조·프로세스 재시작 한계는 위 이벤트 API와 같다.

파일 수 5개·20MB·PDF/PNG/JPEG 검증, 기존 presigned 모듈의 ETag 고정 range GET/승격을 적용한다. 부모 행 잠금이 업로드 예약·가입·만료 정리·revision 변경을 직렬화한다. 늦은 업로드 완료가 이미 가입된 ready 파일을 삭제하지 않도록 ready 결과를 재사용한다. 가입 소유권은 계정/워크스페이스/심사 생성 트랜잭션에서만 연결하며 이후 공개 증명으로 변경할 수 없다. 초안 존재 자체는 미인증 비밀번호 주체의 이메일 소유 증명이 아니다. 같은 이메일의 새 가입이 오면 사용자 행 잠금과 pending 워크스페이스 판정 뒤 연결 초안을 tombstone 처리하고 파일을 retiring으로 전환하며 소유 FK를 해제한 다음 기존 주체를 교체한다. 단, 같은 초안 ID와 HttpOnly 비밀값의 정확한 재제출은 응답 유실 복구로 보고 기존 로그인·복원 경로를 유지한다. 검증된 계정과 non-pending 워크스페이스는 계속 교체하지 않는다.

복원/수정/삭제/최종 요청은 현재 사용자와 현재 워크스페이스의 소유권, DB 이메일 인증, 구매사 활성 상태를 확인한다. 선택 시 같은 객체를 회원 첨부로 인계하며 최종 요청의 revision·파일·요청 키 확인과 초안 완료는 RFP 생성 트랜잭션에 포함된다. 명시적 삭제/미가입 만료/탈퇴는 실제 견적 등 업무에 연결되지 않은 원본만 정리하고 객체 삭제 실패는 deleting 행으로 재시도한다. 완료·삭제 후 답변은 비운다.

서버 초안의 미저장 편집 복구본은 사용자+워크스페이스+초안별 localStorage에 공개 질문 답변·첨부 메타데이터·기준 revision·작성 세션·최종 편집 시각을 저장한다. 동일 출처 스크립트/기기 사용자 노출과 브라우저 eviction 한계는 위 로컬 초안과 같다. 원본·HttpOnly 증명은 복제하지 않는다. 구조·소유자·초안 ID를 검증하고 마지막 편집 후 24시간 만료를 다시 열 때 확인한다(브라우저가 닫힌 동안 즉시 삭제를 보장하지 않는다). 서버 revision 충돌은 자동저장과 최종 요청을 막으며, 사용자의 명시적 선택 뒤에도 최신 revision CAS·현재 세션 ACL·첨부 소유권을 재검증한다. 로컬 표식은 보안 권한이나 원자적 탭 간 잠금이 아니다. 저장 응답은 자신이 소유한 복구본만 정리하며 다른 세션·소유자의 사본을 지우지 않는다. 가드: `components/rfp/__tests__/server-draft-session.test.ts`, `components/rfp/__tests__/GuestQuoteResume.test.tsx`.

입점 심사 Slack에는 기존 공개 이벤트보다 넓은 **전체 답변(금액·수수료·메모 포함)** 과 파일명·크기가 전달된다. 이는 이번 사용자 결정으로 승인한 운영자 전달 경계다. 서버 가입 스냅샷만 사용하고 자유 입력을 escape하며 원본·다운로드 URL은 제외한다. 커밋 후 best-effort이므로 전달 실패가 가입을 취소하지 않는다.

가드: `lib/server/services/__tests__/guest-drafts.test.ts`, `lib/server/services/__tests__/pg-matching.test.ts`, `app/api/guest-rfp/drafts/__tests__/route.test.ts`, `lib/server/actions/auth/__tests__/guest-signup.test.ts`, `lib/server/notifications/__tests__/guest-signup-summary.test.ts`.


### 7.1 Slack 행동 스레드 (2026-10-20)

2026-10-25 관리자 조회: 별도 admin-supporter-b의 `/guest-journeys`·`/guest-journeys/[draftId]`는 조회 함수에서 `requireAdminPermission('data.view')`를 먼저 실행한다. 공유 DB의 명시적 읽기 projection은 `secret_hash`를 제외한다. 답변은 HTML로 해석하지 않고 텍스트 렌더링하며, 분석 식별자는 검증 후 고정 GA/Clarity 호스트에 연결한다. 기존 30일 보존·탈퇴 삭제 정책을 연장하지 않는다. 가드: admin-supporter-b `lib/server/queries/admin/__tests__/guestJourneys.test.ts`, `components/__tests__/GuestJourneyDetail.test.tsx`.

`journeyInputSchema`는 정의된 이벤트·단계·고정 오류·UUID·관측 시각·제한된 분석 ID·허용된 완료 단계의 제한된 답변만 받으며 추가 키·브라우저 가입/요청 성공 선언을 거부한다. 같은 공개 HTTP 제한을 유지한다. 익명 초안은 HttpOnly 증명 해시, 연결 이후는 DB 소유 사용자·워크스페이스와 요청 expected owner를 모두 대조한다. 기존 회원 연결은 증명+active/인증 구매사 멤버십을 요구하며, 이미 가입 트랜잭션으로 연결된 계정만 인증·승인 대기 상태의 기록을 허용한다. 세션 철회·PG·운영계정·비활성 사용자는 거부한다. 가입·요청 성공은 서비스 트랜잭션의 savepoint에서만 추가하며 성공 키가 UNIQUE다. 클라이언트 시각·분석 ID는 인증에 쓰지 않는다.

GA SDK와 내부 수집은 독립이다. SDK 미로딩·차단 시 행동을 계속 받고 분석 식별자 미확보를 명시한다. 2026-10-24 사용자 결정으로 댓글에 완료한 견적 질문의 답변과 가입 이메일·회사명·사업자등록번호·담당자명·인증된 연락처를 허용한다. `journey-contract.ts`는 질문 및 가입 email/company/profile/phone 완료에만 최대 500자 `answer`를 허용한다. 입력별 명시적 projection으로 비밀번호·인증번호·인증 ID·원본 파일을 제외하며 GA의 allowlist payload에는 답변을 전달하지 않는다. 입력은 클라이언트 관측이며 서버 확인 사실로 취급하지 않는다. Slack 제어 문자는 escape하고 요청은 UTF-8 4KiB로 제한하고, Slack은 초안별 10분 요약(최근 답변 최대 4개·각 100자, 오류 종류 최대 5개)으로 축약한다. 원본 행동과 최대 500자 답변 스냅샷은 그대로 보관한다. 가드: `lib/analytics/__tests__/journey-contract.test.ts`, `guest-journey-client.test.ts`, `lib/server/repositories/drizzle/__tests__/guest-journey.test.ts`, 구매사 가입 페이지 테스트. 개별 키 입력은 수집하지 않는다. 내부 행동·분석 ID·발송 본문은 30일 보관한다. 미완료 회원 연결은 초안 수명까지, 완료/삭제 연결은 종결 후 30일까지 보존하고 탈퇴 시 내부 기록을 cascade 삭제한다. 이미 외부로 전송된 Slack·GA·Clarity 자료는 각 서비스 보존 정책에 따른다.

로그아웃·계정/워크스페이스 변경은 브라우저의 연결·대기 행동을 해제한다. 로그인 연결이 호출 제한에 걸리면 소유자를 고정해 재시도하며, 연결 확인 전에는 익명 행동 전송을 멈춘다. 로그아웃 쿠키에는 `Max-Age=0`과 과거 `Expires`를 함께 보낸다. 현재 Next.js 쿠키 파서가 숫자 0인 maxAge를 생략하는 왕복에서도 삭제 의미가 남아야 한다. 규범: `lib/auth/__tests__/cookie-config.test.ts`의 실제 `ResponseCookies` 왕복과 위 계정 전환 E2E.

Slack 원문·첫 분석 댓글·행동 배치는 DB 선점과 전역 발송 gate로 직렬화한다. 429만 Retry-After 이후 자동 재시도하고 timeout·5xx·유실된 inflight는 unknown으로 남겨 중복 대신 유실 가능성을 수용한다. 이벤트 ID 중복 제거와 별개로 외부 Slack과의 정확히 한 번 커밋은 보장하지 않는다. 브라우저 큐·서버 저장량·시각 편차 한도와 복구 절차는 [운영 런북](GUEST_RFP_SLACK_THREADS.md)에 있다.

가드: `lib/server/repositories/drizzle/__tests__/guest-journey.test.ts`, `lib/server/services/__tests__/guest-journey-lifecycle.test.ts`, `lib/analytics/__tests__/guest-journey-client.test.ts`, `lib/analytics/__tests__/journey-contract.test.ts`, `lib/integrations/__tests__/slack-thread.test.ts`, `app/api/guest-rfp/events/__tests__/journey.test.ts`, `e2e/guest-rfp-intake.spec.ts`.

### 7.2 공개 자동 입력·절감액 (2026-10-29)

assist/savings POST는 기존 HttpOnly 초안 증명·동일 buyer Origin/Host·body 한도·revision을 확인한다. APICK 원문·대표명·전체 요율표는 공개하지 않는다. 제안과 quoteContext는 비신뢰 참고 정보이며 사용자 확인, 기존 가입/최종 요청 검증을 대체하지 않는다. 서버 계산은 저장된 업종·계약 유형과 서버 정책을 재조회한다. 선택한 PG·잠정 등급에 필요한 요율만 반환하며 잠정 등급은 승인 등급을 변경하지 않는다.

홈페이지 수집은 전체 6초·같은 호스트 최대 3개·256KiB 본문으로 제한한다. 사설·예약 IPv4/IPv6·혼합 DNS 응답을 거부하고 검증한 IP로 접속을 고정한다. 각 리다이렉트를 재검증하고 사용자 쿠키/인증은 전달하지 않는다. 페이지 코드·지시는 실행하지 않는다. AI에는 제한된 공개 페이지 텍스트와 업종 분류만 제공한다. strict 응답·원문 근거 검사에 실패한 필드를 버린다. AI의 의미 해석 정확성을 보증하지 않으며 사용자의 확인과 수정이 필수다.

부모 초안 잠금·복합 PK가 같은 유료 호출을 선점하고 24시간 재사용한다. 명시 재시도도 초안별 사업자 5회·홈페이지 3회와 IP 시간당 20회 예산을 소비한다. IP는 Caddy가 추가한 마지막 X-Forwarded-For를 해시하여 시간 버킷으로 저장한다. 새 초안 발급은 기존 proof/저장 한도를 유지한다. 한도는 무료 직접 작성·저장과 분리한다. 미완료 선점의 자동 재실행을 피하므로 응답 유실 시 유료 결과의 유실 가능성을 수용한다. 공개 Origin 헤더는 비브라우저 클라이언트를 인증하지 못한다는 기존 한계도 유지한다.

문맥은 초안 수명을 따르고 원문 페이지는 보관하지 않는다. 호출 캐시는 24시간, IP 예산은 1시간 후 기존 sweep-uploads에서 청소한다. 초안 완료·삭제 때 조회 캐시도 같은 트랜잭션에서 지운다. 새 운영 지표는 ID·개수·상태·필요한 제안 요율만 기록하며 회사/번호/홈페이지/원문은 추가하지 않는다. 상세 보관·배포 계약: [자동 입력 운영 문서](GUEST_QUOTE_ASSIST.md).

가드: lib/server/quote-assist/__tests__/{website,providers,extraction,savings,metrics}.test.ts, lib/server/services/__tests__/{quote-assist,quote-savings,quote-context,guest-drafts}.test.ts, app/api/guest-rfp/{assist,savings,drafts}/__tests__/route.test.ts, components/rfp/__tests__/quote-controller.test.ts, components/auth/__tests__/BuyerSignupWorkspaceForm.guest.test.tsx.

## 8. CS scan 후속 경계 (2026-10-18)

- **관리자 쓰기**: `WorkspaceService`가 트랜잭션 안에서 승인 관리자 행을 잠그고 호출자 권한을 다시 읽는다. 이름 변경·초대·재발송·취소·역할 변경·내보내기·사업자 정보 교체에 적용한다. 가드: `services/__tests__/workspace.test.ts`의 권한 취소 경합과 직접 호출 회귀.
- **미승인 PG 읽기**: 검색은 공통 PG 승인 게이트를 거친다. 전자서명 다운로드의 과거 PG 승인 검사는 2026-10-21 전환 이후 PG 계약 접근 전면 차단으로 대체됐다. 가드: `actions/search/__tests__/searchEntities.test.ts`, `signing/__tests__/download-handler.test.ts`.
- **운영계정 세션**: `authProvider`는 로그인 시 서버의 provider에서만 찍는다. Google 출처와 현재 allowlist가 모두 맞아야 synthetic admin이다. allowlist에 새로 추가된 이메일의 기존 비밀번호 세션은 폐기하며 Google 재로그인이 필요하다. 가드: `lib/auth/__tests__/master-login.test.ts`, `session.test.ts`, `jwt-callback.test.ts`.
- **가입 이메일 조회 (사용자 결정)**: 즉시 중복 안내를 유지한다. 두 공개 조회 진입점은 분당 IP별 60회·전체 300회 예산을 공유하고 성공해도 예산을 돌려주지 않는다. 저속·분산 조회로 가입 여부를 알아내는 잔여 위험은 2026-10-18 사용자 결정으로 수용했다. 가드: `actions/auth/__tests__/email-lookup-limit.test.ts`.
- **업로드 완료**: 일반 첨부의 `upload_workspace_id`를 현재 세션과 비교한다. 과거 계약 보관함 업로드도 `workspace_id`를 비교했으나 해당 API는 현재 404다. 사용자 ID가 같아도 다른 워크스페이스에서 완료할 수 없다. 구형 NULL 일반 업로드는 재예약해야 하며 기존 다운로드에는 영향이 없다. 일반 첨부는 업로더 행 잠금 아래 pending 또는 ready 미연결 행을 합쳐 50건까지 예약한다(개별 20MiB 상한으로 최대 1,000MiB). 가드: `presigned-upload/__tests__/{attachment,archive}-adapter.test.ts`.
- **익명 저장 예산**: DB 트랜잭션 잠금으로 미연결 초안 전체 1,000건·동일 HttpOnly proof 5건, 익명 파일 및 삭제 대기 파일 합계 1GiB를 제한한다. 초안별 5개 한도에는 삭제 대기도 포함한다. 저장소 삭제 실패가 예약량을 해제하지 않는다. 소유 계정에 연결된 정상 파일은 익명 예산에서 빠지고 기존 보관 기간을 유지한다. 빈 익명 삭제 기록은 7일 후 sweep에서 삭제한다. 가드: `services/__tests__/guest-drafts.test.ts`.
- **익명 이벤트**: DB 잠금으로 최근 24시간 전체 1,000건까지 선점한다. 중복 기록은 30일 보관하고 다음 선점 시 오래된 기록을 제거한다. 요청을 거절해도 원래 작성 흐름은 진행한다. 가드: `repositories/drizzle/__tests__/guest-rfp.test.ts`.
- **웹훅 본문**: SnowSign 서명 헤더·서버 비밀값이 없으면 본문을 읽지 않는다. 최대 64KiB·3초 안에서만 읽고 이후 HMAC을 검증한다. 가드: `app/api/signing/webhook/__tests__/route.test.ts`.
- **관측 데이터**: Slack Incoming Webhook URL은 문자열·span·breadcrumb·exception을 포함해 제거한다. 이메일 수신자·제목·dedupeKey는 Sentry와 pino/Axiom 전송 전 마스킹한다. 공통 스크러버는 Sentry core `normalize`로 순환 참조·깊이·속성 수를 제한한 뒤 마스킹한다. `toJSON` 결과도 마스킹하며 정규화에서 제외한 원본 필드를 다시 합치지 않는다. 기본 PII 수집은 끈다. 가드: `lib/observability/__tests__/{scrubber,logger}.test.ts`.

- **채널톡 (사용자 결정)**: `getChannelMember`는 앱 세션 버전을 확인해 폐기된 세션에 memberHash를 재발급하지 않는다. 이미 발급된 memberHash는 공급자의 고정 HMAC 인증값이므로 앱 로그아웃·비밀번호 변경으로 무효화되지 않는다. 상담 연동 유지와 이 잔여 위험 기록을 2026-10-18 사용자가 선택했다. 유출 사고가 확인되면 채널톡 콘솔에서 키를 재발급하고 서버 `CHANNEL_IO_SECRET`을 함께 교체한다. 신규 키만 배포하고 콘솔을 바꾸거나 그 반대로 하면 상담 인증이 실패한다. 실제 키 교체·기존 상담 삭제는 이번 코드 변경에서 수행하지 않았다. 근거: [채널톡 공식 memberHash 문서](https://developers.channel.io/en/articles/What-is-Member-Hash-cca4bd14). 가드: `lib/auth/__tests__/channel-member.test.ts`.

- **과거 임베드의 동일 당사자 간 원계약 상관관계 (사용자 결정, 신규 사용자 경로 폐지)**: SnowSign이 `external_id`를 반환하지 않는 임베드 계약은 원래 견적을 암호학적으로 증명할 수 없다. 지정 구매사·승인된 낙찰 PG·전원 본인인증 검증은 유지하되, 같은 당사자 사이 다른 견적의 미바인딩 계약을 연결할 가능성은 2026-10-18 사용자가 수용했다. 복구 후보는 사람이 계약 내용을 확인한 후 선택한다. 당사자가 다른 계약, 약한 인증, 이미 다른 딜에 바인딩된 provider ref는 계속 거부한다. 공급자가 상관키를 반환하면 현재의 정확일치 검사도 적용된다. 이 제한은 `csf_1aa77dbce7271387b7401ca3`의 잔여 위험이며 완전 해결/오탐으로 처리하지 않는다.
- **서명 상태 단조성**: 계약뿐 아니라 참여자 상태도 UPDATE 조건으로 단조 전이를 보장한다. 공급자 I/O 전에 읽은 pending 스냅샷이 늦게 돌아와도 signed/rejected를 viewed/pending으로 되돌리지 못한다. 가드: `services/__tests__/agreement-reconciliation-race.test.ts`.


## 신규사업체 구매사 자동 승인 경계 (2026-10-25)

- 브라우저의 등급·출처·상태·승인 요청은 신뢰하지 않는다. 액션의 국세청 조회와 서비스의 명시적 `verified=true`·`status=active` 확인을 거친 신규 구매사 생성 경로에서만 APICK을 호출한다. 공개 번호 조회 액션은 유료 APICK 경로를 호출하지 않는다. 보나페이 조회·판정은 제거했다.
- APICK 응답은 국세청에 제출할 후보 정보다. 성공 여부·요청 번호 일치·상세정보·공개 제한을 검사하고 개업일·대표명 조합을 국세청 `/validate`로 재검증한다. 응답 번호·요청 반향·정상 영업까지 일치해야 한국 날짜 기준 개업 6개월 미만 예외를 적용한다. 간이과세는 승인 근거가 아니다.
- APICK와 국세청 진위확인은 각각 헤더·본문 포함 5초로 제한하고 재시도·리다이렉트·캐시 없이 트랜잭션 전에 수행한다. 키 미설정·누락·오류는 수동 심사로 남는다. 가입 경로의 휴대폰 증명은 외부 조회 전에 검사하고 트랜잭션 안에서 재소비한다.
- 내부 등급 `sole`·`new_business_exception`, 워크스페이스·신청 승인과 `system:apick`의 `workspace.auto_approve` 감사를 같은 트랜잭션에 저장한다. 승인 감사에는 검증된 개업일·국세청 검증 출처·조회 시각을 남긴다. 감사 insert 실패는 전체 생성을 롤백한다.
- 사용자 결정에 따라 APICK 성공·사업자번호 일치 응답의 원본 JSON 전체(`api`·`data`, 대표명 포함)를 승인 여부와 무관하게 보관한다. 기존 `admin_audit_logs`에서 `entity_type=verification_application`과 신청 ID로 연결하고 별도 `workspace.apick_lookup` 사건의 `payload_json.after.response`에 저장한다. 조회 감사는 영세 판정이나 자동 승인의 증거 자체가 아니며 국세청 검증·업력 조건을 대체하지 않는다. 키·요청 헤더·국세청 원문은 저장하지 않는다. 원본은 관리자 감사 접근 경계 안에 두고 일반 구매사·PG 응답이나 운영 알림에 전달하지 않는다.
- 미인증 재가입 정리는 `system:apick`+`new_business_exception`과 과거 `system:bona-pay`+`api_confirmed`의 정확한 조합을 허용한다. 단독 admin·견적 없음·이메일 미인증 조건과 정확한 게스트 증명 재제출 복구를 유지한다. 공유·수동 확인·사용 이력이 있는 워크스페이스와 서로 다른 공급자/출처 혼합 조합은 보존한다.
- `active`는 이메일 인증을 대체하지 않는다. 기존 pending 건은 일괄 승인하지 않는다. APICK 키 제거·재시작으로 자동 승인을 중지하되 이미 승인된 계정과 과거 감사 기록은 보존한다.

가드: `lib/server/buyer-approval/new-business.test.ts`, `lib/server/services/__tests__/buyer-auto-approval.test.ts`, `scripts/migrations/__tests__/buyer-auto-approval.test.ts`, 기존 `lib/server/actions/__tests__/resolveBizProfile.test.ts`, `lib/auth/__tests__/shell-access.test.ts`.

## 카카오 알림톡 경계 (2026-10-15)

- `notify()`의 명시적 `alimtalk` 채널만 트랜잭션 안에서 별도 큐에 적재한다. 기존 이벤트 이름만으로 외부 발송을 유추하지 않는다.
- 서버가 연락처·수신 설정·활성 계정·이메일 인증·활성 구매사 워크스페이스·승인 멤버십을 일괄 확인하며 worker가 발송 직전에 다시 확인한다. 번호 변경·탈퇴·수신 해제 후 남은 큐는 건너뛴다. 설정 액션은 세션 사용자만 수정한다.
- 내용은 승인 템플릿의 사건 안내, 견적번호, 기존 역할별 딜룸 링크뿐이다. PG 메시지 알림은 견적번호 대신 PG 워크스페이스 이름(30자 상한)과 대화 링크를 쓰며 메시지 본문은 넣지 않는다. 금액·수수료·계약 본문·초대 토큰은 넣지 않는다. 큐의 번호는 서버 전용이며 설정 화면에는 마스킹한 값만 전달한다.
- SOLAPI HMAC 인증, 10초 데드라인, 메시지별 접수 판정을 사용한다. 문자 대체는 공급자의 `disableSms:false`만 사용하고 서버는 추가 문자를 보내지 않는다.
- `sending` 클레임은 네트워크 호출 전에 커밋한다. 타임아웃·5xx·해석 불가 응답·worker 종료는 자동 재전송하지 않는다. 이는 중복 방지를 위해 일부 미발송 가능성을 수용한 선택이다. `accepted`는 실제 수신 증거가 아니다.
- 수신자 재검증과 외부 HTTP 요청 사이의 짧은 경합은 남는다. 이미 공급자가 접수한 메시지는 수신 해제·번호 변경으로 회수할 수 없다.
- 가드: `lib/server/notifications/__tests__/alimtalk.test.ts`, `lib/server/sms/__tests__/alimtalk.test.ts`, `lib/server/actions/auth/__tests__/phoneAlimtalk.test.ts`, `lib/server/actions/user/__tests__/businessAlimtalk.test.ts`, 서비스의 알림톡 통합 테스트.


### 비로그인 견적 자동 요청 경계 (2026-10-25)

`/api/guest-rfp/requests`는 기존 초안의 동일 출처·크기·요청 빈도 제한을 공유한다. 가입 전 추천은 HttpOnly 초안 증명으로 저장된 답변을 조회하고 본인 요청 요약(제목·홈페이지·주요 상품), 접수 가능 여부와 후보 ID·이름·순서를 반환한다. 내부 정책·수수료를 공개하지 않는다. 계정 연결 후에는 JWT 폐기 여부와 실제 사용자·구매사 멤버십·초안 소유 워크스페이스를 확인하며 초안 비밀값만으로 연결된 상태를 읽을 수 없다. 인증 전에는 자기 예약 상태와 워크스페이스 선택에 필요한 정보만 읽는다.

발송은 현재 인증·active 구매사·멤버십·만료·revision·PG 및 첨부를 재검증한다. 초안 잠금 뒤 예약·견적·첨부·알림을 같은 트랜잭션으로 처리한다. 외부 트랜잭션 안의 생성은 커밋 후 알림 콜백을 외부 호출자에게 맡기며 롤백 시 발행하지 않는다. 완료 효과는 소유권 검증과 같은 잠금에서 선점하고 읽음 상태는 변경하지 않는다. 가드: `lib/server/services/__tests__/guest-requests.test.ts`, `app/api/guest-rfp/requests/__tests__/route.test.ts`.
