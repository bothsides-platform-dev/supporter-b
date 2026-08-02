# THREAT_MODEL.md — 위협 모델 · 수용 리스크 대장

이 문서는 **위협 관련 결정과 수용 리스크(Accepted Risk, AR-N)** 를 기록하는 living doc 이다. 방어 메커니즘 자체의 SSOT 는 언제나 **코드 + 가드 테스트**이며, 이 문서의 각 항목은 해당 가드 테스트를 링크한다 — 산문이 코드와 3벌로 드리프트하는 사고(CLAUDE.md 의 OpportunityListing 블록이 남긴 교훈)를 피하기 위해 여기서는 *결정·근거·재검토 트리거*만 서술한다.

**유지 규칙**: 신뢰 경계를 바꾸는 변경(채널 ACL, 공개 projection, 웹훅 검증, presign 정책 등)은 이 문서의 해당 절을 같은 PR 에서 갱신한다. 수용 리스크를 해소했다면 AR 항목을 삭제하지 말고 "해소됨(날짜)" 으로 남긴다.

## 1. 신뢰 경계 · 자산

| 자산 | 민감도 | 경계 (SSOT 위치) |
|---|---|---|
| 봉인 입찰 데이터 (수수료·입찰 내용·경쟁사 수) | 최고 — 제품 핵심 불변식 | 서버 로더 strip + 명시 projection (§3.1) |
| 멤버 PII (이메일·이름·연락처) | 높음 | 관계 fail-closed 로더 (§3.1, `lib/server/user-profile-loader.ts`) |
| 첨부파일 (RFP·입찰·채팅) | 높음 | R2 presigned + ACL 302 프록시 (§3.3) |
| 전자서명 계약 (SnowSign) | 높음 | ACL-first 로더 + HMAC 웹훅 (§3.2) |
| 온라인 presence (누가 접속 중 + **누가 누구를 보는가**) | 중간 — 관찰자 축이 경쟁사-집합 신호로 승격될 수 있음 (§2.3) | 관계 게이트 subscribe-proxy (§2.3, 2026-07-23 전환) |
| 워크스페이스 디렉터리 (name↔UUID 맵) | 중간 — presence·기타 UUID 키 표면의 비익명화 오라클 | buyer 세션 + type=pg 한정 게이트 (§2.7) |

## 2. Realtime (Centrifugo)

자체호스팅 Centrifugo v6 (Caddy `wss://`, `deploy/centrifugo/config.yaml`). 채널 이름의 단일 출처는 `lib/realtime/channels.ts`.

### 2.1 연결 인증

- 연결 토큰: `lib/server/realtime/token.ts` — HS256, `sub` = userId, `info` = `{ workspaceId }` (→ Centrifugo `connInfo`), TTL 30m. 서버 서명이므로 **`user`/`connInfo.workspaceId` 는 클라이언트가 위조 불가**.
- 발급 라우트 `app/api/centrifugo/connection-token/route.ts`: 세션 필수(401) + 세션 취소(401) + 이메일 미인증(403) 게이트, 동시 in-flight load-shed(503, 기본 25 — `CENTRIFUGO_TOKEN_MAX_INFLIGHT` 로 조정). 즉 **모든 WS 연결은 인증 세션 뒤에 있다**.
- 세션 강제 종료: `disconnectCentrifugoUser` (session_version bump 후 호출).

### 2.2 채널 ACL 매트릭스

| 네임스페이스 | 채널 형식 | ACL | 가드 |
|---|---|---|---|
| `chat` | `chat:conversation:<uuid>` | subscribe-proxy — 대화 양측 ws 멤버만 | `app/api/centrifugo/subscribe/__tests__/route.test.ts` |
| `team` | `team:rfp:<rfpId>:<wsId>` | subscribe-proxy — ws 멤버 ∧ RFP 접근권 (buyer/PG 팀 채널 분리 = 봉인 입찰 불변식) | 상동 (t1–t6) |
| `presence` | `presence:ws:<wsId>` | subscribe-proxy — **관계 게이트** (멤버십∨대화∨RFP 초대∨pending 콜드피치, `PresenceAccessRepo.canObserve`) | 상동 (p1–p5) + `deploy/__tests__/centrifugo-presence-namespace.test.ts` + `lib/server/repositories/drizzle/__tests__/presence-access.test.ts` |

subscribe-proxy(`app/api/centrifugo/subscribe/route.ts`)의 불변식: 항상 HTTP 200, 모든 거부는 동일한 generic deny(존재 오라클 없음), 예외 → deny(fail-closed), uuid 게이트 후 DB 접근.

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

`CENTRIFUGO_PROXY_SECRET` 미설정 시 subscribe-proxy 라우트는 비밀 헤더 검사를 **건너뛴다**(의도된 fail-open — dev 에서 컨테이너 없이 동작). 설정 시에는 상수시간 비교. **prod 에서는 반드시 설정**해야 하며(라우트가 Caddy 뒤에서 공개 도달 가능), 컨테이너 쪽 주입 경로는 `CENTRIFUGO_VAR_PROXY_SECRET` — **prod compose 와 dev compose(realtime 프로필) 모두** 이 브리지를 정의한다(한쪽만 있으면 v5 `static_http_headers` 팬텀 키 사고와 같은 "헤더 없는 프록시 → 전 구독 거부" 클래스가 재발한다). 가드: `deploy/__tests__/centrifugo-proxy-secret.test.ts` (양쪽 compose 단언).

### 2.6 presence 관계 게이트 — 구현 기록 (2026-07-23)

- **술어** (`lib/server/repositories/drizzle/presence-access.ts`): `canObserve(userId, targetWsId)` = 멤버십 ∨ 대화 ∨ RFP 초대 쌍(상태 무관) ∨ **pending** 콜드피치 쌍(거절은 영구 — rejected 는 절대 허가 금지). 전 절 방향 대칭. 대화-이전 UI 표면 5곳(`RfpBriefPanel`·`BidContextStrip`·`RfpInviteManager`·`FocusComparison`·`RfpPendingRequests`)이 초대·콜드피치 절에 의존한다 — 대화 게이트만 있으면 이 표면들의 점이 조용히 꺼진다(rev1 이 정확히 이 지점에서 좌초해 D1 이 됐던 이력).
- **관찰자 ws 해석**: v6 subscribe-proxy 페이로드에는 `connInfo` 가 포함되지 않는다(공식 문서 확인 2026-07-23, centrifugal.dev proxy 문서 — SubscribeRequest 필드에 info 없음). 따라서 서명된 `user`(userId)의 **전 멤버십** 기준으로 판정한다 — 활성 워크스페이스 개념이 프록시에 없으므로 이것이 유일하게 올바른 축이다.
- **config**: presence 블록 = `subscribe_proxy_enabled: true` + `allow_subscribe_for_client` **부재 필수** — v6 권한 평가는 "먼저 허용하는 메커니즘이 이긴다" 순서(공식 channel permission 문서 확인 2026-07-23)라 남겨두면 proxy deny 후 fallback grant 로 공개 모델이 조용히 부활한다.
- **배포 순서 (역순 = 전면 블랙아웃)**: ① 앱 배포(프록시 분기 포함) → ② `docker compose -f docker-compose.prod.yml restart centrifugo` → ③ 관계 계정 2종으로 점 육안 확인 + 무관 계정 raw 클라이언트 deny 확인. 런북: `docs/DEPLOY_LIGHTSAIL.md` §Centrifugo.
- **비용·거동**: 탭당 최대 51채널(INTEREST_CAP 50 + 자기 채널) × 재연결마다 proxy 왕복, 채널당 최대 4회 인덱스 점조회(조기 반환). proxy deny 는 centrifuge-js 에 비일시 오류로 전달돼 재시도 루프를 만들지 않고, 해당 점은 offline 으로 읽힌다(무관 워크스페이스 점이 있던 자리 = 오늘의 offline 과 동일 UX).

### 2.7 AR-3 — 워크스페이스 디렉터리 API (**게이트 도입 2026-07-23**, 잔여 수용)

`GET /api/workspaces/search` 는 name↔UUID 디렉터리(최대 500건)를 반환한다. **2026-07-23 이전에는 인증만 통과하면 양방향(type=buyer 포함) 전체 열거가 가능**했고, 이것이 §2.3 관찰자 축의 비익명화 오라클이었다. 현재 게이트: **buyer 활성 세션 + `type=pg` 질의만 허용**(정규 소비자 = 견적요청 위저드 PG 피커 단일). 구매사 디렉터리(type=buyer)는 소비자가 없어 전면 거부.

**잔여(수용)**: 가입이 열려 있으므로 buyer 계정을 만들면 PG 디렉터리는 여전히 열거 가능하다 — 위저드 피커가 전체 목록을 요구하는 한 구조적이며, PG 디렉터리 자체는 저민감(PG 사는 공개 영업 주체)으로 판단. 재검토 트리거: PG 측이 UUID 로 키되는 새 공개 표면 추가, 또는 buyer 가입 게이트 완화. 가드: `app/api/workspaces/search/__tests__/route.test.ts`.

## 3. 포인터 절 — 다른 신뢰 경계 (여기가 SSOT 아님)

각 항목의 규범 서술과 강제 지점은 링크된 코드·테스트·문서가 소유한다. 이 절은 색인일 뿐이다.

### 3.1 봉인 입찰 공개 경계
오픈보드 공개 필드 화이트리스트는 `OpportunityListing`(`lib/types/pg-request.ts`) + 명시 SELECT projection + exact-key 가드 테스트가 강제하고, 산문 SSOT 는 CLAUDE.md Domain Context 블록 한 곳이다. 초대 PG 대상 필드 숨김은 `hidden_from_pg` 경로 allowlist 를 `PG_STRIP` 이 fail-closed 로 strip 한다(`loadPgRfpDetail`). 신원 카드 PII 는 `lib/server/user-profile-loader.ts` 가 관계 fail-closed.

### 3.2 SnowSign 전자서명
웹훅 `POST /api/signing/webhook` 은 HMAC-SHA256 검증 + payload 불신(트리거 전용, 상태는 재조회 단일 경로), 시크릿 미설정 시 401 fail-closed. 계약 조회·조작 ACL 은 낙찰 PG ws + buyer ws, `getForActor` ACL-first. 상세는 CLAUDE.md Domain Context.

두 번째 인바운드 경계 — **발송 임베드의 `postMessage`** (`SigningSendEmbed`, v0.4.37.0 에서 템플릿 등록 화면 폐지와 함께 딜룸 계약 탭으로 이관). **스테이크가 올라갔다**: 예전 메시지는 "템플릿 id" 를 실어왔지만 지금은 **어떤 스노우싸인 계약을 우리 계약 행에 바인딩할지**를 실어온다. 그래서 클라이언트 가드는 방어심층일 뿐이고 **진짜 게이트는 서버**다 — `attachProviderContract` 가 ① ACL 재검증(낙찰 PG 인가) ② `getContract` 재조회(실재하는가) ③ **실제 발송 여부**(`isDispatchedProviderStatus` — `draft` 거부) ④ `provider_ref` 바인딩 유일성(다른 계약이 이미 쥐고 있지 않은가) ⑤ `markSentIfAwaiting` CAS 를 모두 통과해야 상태가 바뀐다. 멱등이라 중복 도착은 무해하다. ③이 없으면 완료 이벤트를 위조하거나 초안 id 를 흘려 **아무에게도 발송되지 않은 계약으로 딜룸을 `sent` 로 만들고 양측에 알림까지 트리거**할 수 있었다(구매사는 오지 않을 서명 메일을 기다린다).

**⚠️ 소유 검증은 현재 작동하지 않는다 (수용, P2).** 코드에는 `external_id === sc:<signingContractId>` 검증이 있지만, 실측(2026-08-01, `docs/SNOWSIGN_SANDBOX.md` Q3) 결과 `GET /v1/contracts/{id}` 응답에 `external_id`·`integration` 키가 **아예 없어** 그 분기가 한 번도 실행되지 않는다. 따라서 위 목록의 ①③④⑤만이 실제 방어선이다(②는 실재 확인까지만 한다). 남는 위험: 단일 `SNOWSIGN_API_KEY`=1 org 이므로 **다른 계약의 UUID 를 아는 PG 가 그것을 자기 딜에 바인딩**해 상태·완료본에 접근할 수 있다. 도달성은 낮다(계약 id 는 비열거·불투명 UUID, 이미 바인딩된 계약은 선착순 가드로 보호됨). **v0.4.38.0 정정**: 「어느 PG-facing 화면에도 노출되지 않음」은 더 이상 사실이 아니다 — 고아 복구 다이얼로그가 후보의 `providerContractId` 를 브라우저로 보낸다(화면 텍스트로 렌더하지는 않는다). 다만 그 목록은 `participantsMatchDeal` 을 통과한 것뿐이라 **노출 범위를 정하는 건 이제 그 술어**이고, 같은 술어를 복구 바인딩에서 한 번 더 적용해 목록이 유일한 관문이 되지 않게 했다. 즉 근거가 '아무 데도 안 보인다'에서 '이 딜의 당사자인 계약만 보인다'로 바뀌었다. 닫는 법은 TODOS.md Signing 절 "external_id 소유 검증이 현재 무력". 검증 코드는 지우지 않는다 — 공급자가 필드를 추가하면 그 순간 복원된다.

클라이언트 가드는 유지된다: 핸들러는 `iframeUrl` 에서 파생한 origin 과 정확히 일치하는 메시지만 받고(**파싱 실패 시 모두 거부** — v0.4.30.0 의 fail-closed 전환을 그대로 이식), 이벤트 네임스페이스(`snowsign.embed.`)와 계약 id 경로-세그먼트 화이트리스트를 `lib/signing/embed-events.ts` 순수 함수가 강제하며, 완료는 1회만 처리한다. iframe 은 `sandbox`(top-navigation 제외) + `referrerPolicy="no-referrer"` 로 가둔다. 규범은 `components/deal-room/signing/__tests__/SigningSendEmbed.test.tsx` 의 origin·1회·네임스페이스 케이스와 `lib/signing/__tests__/embed-events.test.ts` 가 SSOT.

**잔여 수용**: ① `e.source` 미검증 — 같은 origin 의 다른 창은 통과한다(서버 게이트가 뒤에 있어 실피해로 이어지지 않는다). ② 신뢰 origin 을 공급자 응답(`iframe_url`)에서 파생하므로 allowlist 가 아니다 — 앱 전체에 CSP 자체가 없어 `frame-src` 핀도 없다. 둘 다 TODOS.md Design 절 "스노우싸인 임베드 iframe 하드닝" · "postMessage 핸들러가 `e.source` 를 검증하지 않음" 참조.

**신뢰 이전 (수용)**: 임베드는 참여자 프리필을 지원하지 않아 **PG 가 구매사 서명자 이메일을 직접 타이핑한다**. 예전에는 앱이 DB 에서 양측 담당자를 뽑아 넣었다. 완화는 표시 + 사후 탐지다 — 임베드 패널이 정확한 이름·이메일을 띄우고, 바인딩 시 수신자 목록에 구매사 담당 이메일이 없으면(대소문자 무시) `participantMismatch` 로 경고해 취소를 유도한다. 이미 발송된 계약이라 차단하지는 않는다.

### 3.3 첨부 스토리지 (R2)
업로드 = presign 2-phase + 서버 스니핑 검증, 다운로드 = ACL 검증 후 302 presigned GET(TTL 15분). 완료본 다운로드 프록시의 잔여 하드닝은 TODOS.md 참조.

### 3.4 인증·게이트
셸 가드 순서·이메일 인증 게이트는 `lib/auth/shell-access.ts` + CLAUDE.md Routing Architecture. 서버 액션 데이터 경계 강제는 의도적 후속(TODOS.md P2 항목들).
