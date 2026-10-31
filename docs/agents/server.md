# 서버 아키텍처 상세

액션·서비스·DB·알림·스토리지·실시간을 바꿀 때 해당 절을 읽는다. 계층 간 의존 방향은 Actions → Services → Repositories다.

## 구성

```
lib/server/
├─ actions/          # 얇은 진입점: 세션 검증 + 입력 파싱 후 서비스에 위임
├─ services/         # 비즈니스 로직 캡슐화 (전체 코드베이스 적용 완료)
│  ├─ rfp.ts         # RfpService: award / cancel / close
│  ├─ bid.ts         # BidService: submit / withdraw
│  ├─ chat.ts        # ChatService: sendMessage / conversation lookup
│  ├─ workspace.ts   # WorkspaceService: create / invite / member management
│  ├─ auth.ts        # AuthService: signup / password reset / email change
│  ├─ notification.ts# NotificationService: markRead / markAllRead / retryEmail
│  ├─ contract-signing.ts # ContractSigningService 파사드: 선정 후 전자서명 전체 흐름 조율
│  ├─ contract-dispatch.ts # PDF·조항형·공통 합의서 발송의 공통 ACL·상태 게이트와 저장 서식 게이트
│  ├─ signing-dispatch.ts # PDF·조항형·공통 합의서 발송 구현, 문서 렌더링·초안 복구
│  ├─ signing-recovery.ts # 복구 후보 조회: ACL·리스·예산·참여자 매칭·노출 기록
│  ├─ signing-reconciliation.ts # 공급자 상태 동기화·관측 계약 바인딩·완료 처리
│  ├─ signing-policy.ts # 공통 상태 판정·당사자 접근 판정·감사 실패 처리
│  ├─ signing-send-lease.ts # 발송 리스 취득·연장·반납·이어받기와 동료 알림
│  ├─ signing-sent-commit.ts # 공급자 발송 결과의 원자 커밋·참여자·감사·알림
│  └─ signing-party-notifications.ts # 구매사·PG 수신자와 딜룸 링크 파생
└─ repositories/     # DB 접근 추상화 (Drizzle 구현 — 단위 테스트는 PGlite 로 실 DB 검증)
```

## 서비스 레이어 규칙

- 서비스는 트랜잭션·알림 팬아웃·이메일 아웃박스를 소유한다. 액션은 이를 직접 다루지 않는다.
- 가입과 워크스페이스 생성·초대 수락의 공통 쓰기는 `WorkspaceMembership`에 필요한 repository를 주입해 실행한다. 바깥 `AuthService`/`WorkspaceService`가 전달한 같은 트랜잭션을 사용하며 `services`에서 `actions`의 내부 helper를 역참조하지 않는다. 미인증 가입의 크로스 애그리거트 정리는 `services/purge-unverified-signup.ts`의 명시적 DB 접근 예외로 유지한다.
- 이메일 실행은 `lib/server/outbox/`가 소유한다. repository는 일반·채팅·팀 채팅의 원자적 선점과 결과 갱신을 맡고, 실행기가 배치 발송·백오프를 적용한다. `scheduled_at`은 예약 시각이며 작업 소유권은 별도 `claim_token`·`claim_expires_at`으로 표현한다. 신규 코드는 `outboxRepo.flush()` 대신 실행기를 호출한다. DDL 선행·구 실행기 배출·롤백은 `docs/OUTBOX_CLAIMS_ROLLOUT.md`를 따른다.
- **알림 팬아웃 단일 API**: `lib/server/notifications/notify.ts`의 `notify(tx, input)` — in-app row insert와 email·alimtalk outbox enqueue를 채널(`inapp`/`email`/`alimtalk`) 지정 한 번으로 처리하고, 생성한 `Notification[]`을 반환한다(호출자가 `pendingEmits`에 모아 commit 후 emit). `rfp.ts`/`bid.ts`/`chat.ts`/`team-chat.ts`/`contract-signing.ts` 의 알림 발송이 모두 이 API로 통일되어 있다 — 신규 알림 발송 코드는 `dispatchNotification`+`outboxRepo.enqueue` 두 호출을 직접 조합하지 말고 `notify()`를 쓴다. **범위 밖(의도적)**: `auth.*`/`workspace.*` 서비스와 `lib/server/services/workspace-membership/notify-invitation.ts`는 기존 `dispatchNotification`/outbox 직접 호출 패턴을 그대로 유지한다.
  - **삽입은 채널당 한 문장이다 (v0.4.47.0)**: 수신자 수와 무관하게 `dispatchNotifications`(→`notificationRepo.saveMany`)와 `outboxRepo.enqueueMany` 를 각각 1회 호출한다. 알림톡은 명시적인 타입 입력이 있을 때 수신 연락처·설정을 일괄 조회하고 별도 `alimtalk_outbox`에 같은 트랜잭션으로 일괄 적재한다. 발송 전 권한·설정·번호를 재확인하며, 불명확한 접수 결과는 자동 재시도하지 않는다(운영 절차: `docs/ALIMTALK_ROLLOUT.md`). 예전에는 수신자마다 단건 INSERT 를 돌아 트랜잭션이 팀 규모에 비례해 길어졌다. **수신자별로 값이 갈려야 하면 루프를 돌지 말고 함수를 넘긴다** — `dedupeKey: (r) => …`, `linkUrl: string | ((r) => …)`. 이 두 필드가 함수를 받기 전에는 호출부가 `recipients:[한 명]` 으로 루프를 도는 것 말고는 표현할 방법이 없었고, 그게 12곳에 퍼져 있었다.
  - **⚠️ `dedupeKey` 는 수신자마다 달라야 한다**: 전원이 같은 키를 내면 outbox 의 dedupe UNIQUE 에 걸려 **첫 1건 말고는 메일이 조용히 사라진다**(중복 억제가 목적일 때만 의도적으로 상수 키를 준다). 파라미터 이름은 타입이 아니라서 옛 시그니처(`(email) => …`)를 그대로 둔 호출부는 **컴파일을 통과한 채** 키가 `[object Object]` 로 굳는다 — `notify()` 가 런타임에 throw 해서 막는다.
- `Actor = { userId, workspaceId }` — 세션에서 추출해 액션이 서비스에 전달한다.
- `ServiceResult<T> = { ok: true } & T | { ok: false; error: string }` — 서비스 레이어 반환 타입. 예외 throw 없이 결과를 반환한다.
- `ActionResult<T> = { ok: true } & T | { ok: false; error: string }` — 액션 레이어 반환 타입 SSOT (`lib/server/actions/_result.ts`). 각 도메인 파일의 동일 타입 선언을 대체한다.
- 액션 공통 세션 헬퍼: `requireBuyerActor` / `requirePgActor` / `requireActiveWorkspace` (`lib/server/actions/_session.ts`) — 세션 검증·Actor 추출 로직의 단일 출처. 신규 액션도 이 헬퍼를 사용한다.
- 서비스 싱글턴은 `lib/server/_singleton.ts` 의 `defineAsyncSingleton(key, 'service', build)` 한 줄로 만든다 — `export const { get: getRfpService, set: __setRfpServiceForTest, reset: __resetRfpServiceForTest } = defineAsyncSingleton(…)`. 레지스트리는 `globalThis` 위 Map 하나(HMR 생존)이고, 의미는 `get = override ?? cache ?? build()` · `set(undefined)` 는 override 만 지움 · `reset` 은 둘 다. 인프라 클라이언트(`snowsign-client`·`storage`·`nts`)는 같은 헬퍼의 `'infra'` 그룹. **`repositories/factory.__resetForTest()` 가 `'service'` 그룹을 함께 리셋**하므로 테스트 하네스는 서비스별 reset 을 나열하지 않는다(인프라 더블은 남는다). 모듈마다 `declare global` + `getX` + `__setXForTest` + `__resetXForTest` 를 손으로 복사하던 시절의 블록은 전부 이 헬퍼로 대체됐다.

## 리포지토리 경계

**리포지토리 경계 (ESLint 강제):** 모든 DB 접근은 `lib/server/repositories/**` 가 소유한다. 그 밖의 `lib/`·`app/` 코드는 `@/lib/db/schema`·`@/lib/db/client` 를 **값(value)으로 정적 import 할 수 없다** — 레포를 주입(`repositories/factory` 의 `get*Repo()`)해서 쓴다. `import type { DB }`(타입 전용)는 허용. **서비스의 트랜잭션 핸들은 `repositories/factory` 의 `getDb()` 로 받는다** — 리포와 **같은 주입점**이라 테스트는 `__useDrizzleWithDbForTest(db)` 한 번으로 리포·서비스가 함께 PGlite 로 간다(서비스를 손으로 재배선하는 하네스는 없다; 서비스가 `import('@/lib/db/client')` 를 직접 열던 시절에는 액션 테스트마다 서비스 7개를 `new XService(db, …)` 로 다시 조립해야 했다). 위반 시 lint 에러(`@typescript-eslint/no-restricted-imports`, 규칙명 `repo-boundary/db-access`) + 독립 드리프트 가드 테스트(`lib/server/__tests__/repo-boundary.test.ts`)가 잡는다 — 가드는 ESLint 가 못 보는 동적 `import('@/lib/db/*')` 와 `lib/server/services/**` 밖의 `getDb()` 호출도 잡는다(핸들을 그대로 내주는 접근자라 액션·로더가 부르면 경계가 조용히 다시 열린다). **의도적 예외**(`lib/server/db-boundary-allowlist.mjs` 에 명문화, 단일 출처)는 하나뿐이다: 크로스-애그리거트 캐스케이드(`services/purge-unverified-signup.ts`). **액션은 DB 핸들을 만지지 않는다** — 옛 `actionDb()` 테스트-오버라이드 레지스트리는 마지막 호출처 3개(loginAction 의 죽은 인자, `RfpService.setBoardVisible`, `WorkspaceService.replaceBizProfile` 로 이관)와 함께 사라졌고, 액션·로더 테스트 하네스는 `lib/server/__tests__/_harness.ts` 의 `setupServerTestEnv()` 하나다(서비스 단위 테스트는 SUT 를 직접 `new XService(…)` 로 조립한다 — 생성자 인자가 바뀌면 그 헬퍼들도 함께). 예외를 늘리려면 allowlist 에 추가하고 리뷰한다.

## 대화 읽음 상태

**대화 읽음 상태는 의도적인 tier-spanning 예외다.** `lib/chat/read-state/`가 `(conversation, active workspace, user)` 읽음 cursor, 상대 workspace 판정, unread·상대 읽음 영수증 projection을 함께 소유한다. 서버 호출자는 `markRead`·`projectInbox`·`projectThread`·`projectDigest` interface만 사용하며, 화면은 `useConversationReadReceipt`만 사용한다. Postgres 영속은 기존 `ChatReadRepo`/Drizzle adapter가 담당하고 Centrifugo는 best-effort 전달 adapter다. raw digest dedupe key codec은 읽음 의미가 아니라 queue envelope이므로 `lib/server/outbox/chat-digest-key.ts`에 남는다. team chat은 이 module의 범위가 아니다. 결정 근거는 `docs/adr/0003-conversation-read-state-vertical-module.md`를 본다.

## 스토리지

① 첨부파일: Cloudflare R2(S3 호환 API, `lib/server/storage/r2.ts`, 키 `attachments/<id>`) — 라우트는 `getStorage()` 만 본다. 업로드는 2-phase presigned 직행 PUT(`POST /api/files/presign` → 브라우저→R2 PUT → `POST /api/files/{id}/complete` 서버 스니핑 검증, `attachments.status` pending→ready, 클라 공용 헬퍼 `lib/attachments/upload-client.ts`). 일반 다운로드는 `GET /api/files/{id}` 가 ACL 검증 후 302 → presigned GET(TTL 15분)이고, PDF 썸네일은 같은 ACL을 통과한 `GET /api/files/{id}?preview=1`이 앱에서 바이트를 스트리밍한다. 버려진 pending 은 `/api/cron/sweep-uploads`(1h 초과) 가 청소, 버킷 CORS(PUT) 필수. R2 env(`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET`) 미설정 시 모든 환경에서 throw(폴백 없음) — 로컬 dev도 실 R2 버킷 사용, 단위 테스트는 `__setStorageForTest` mock 주입, e2e 첨부 스펙은 R2 env 없으면 skip.

② 사용자 프로필 사진: Postgres bytea — `user_avatar_blobs` 테이블, `UserAvatarRepo`(`getUserAvatarRepo()`) — `getStorage()` 외부, 별도 repo 패턴.

③ 계약 보관 문서: 같은 R2 버킷의 `contract-archives/signing/<signingContractId>/{document,audit}.pdf`에 완료본·감사추적인증서를 자동 보관한다. 사용자에게는 구매사 소유 `platform_buyer`만 공개하고 PG·레거시·수동 업로드 행은 내부 보존한다. 수동 업로드 presign/complete API는 404다. 다운로드는 소유권·계약 종류·서명 정책 확인 후 presigned GET(TTL 15분)을 발급한다. sweeper는 과거 `source='upload'` pending만 정리하며 signing 하이드레이션 대기는 삭제하지 않는다

> **Presigned upload 불변식:** 첨부 브라우저 PUT은 `pending/<final>` staging 키로만 발급한다. 공통 모듈이 HEAD ETag에 고정된 range GET + 조건부 CopyObject를 거쳐 최종 키를 공개한다. 재사용된 PUT URL의 고아 staging 객체는 `attachments/pending/` R2 lifecycle이 청소한다. 계약 수동 업로드의 기존 코드·기록은 보존하되 사용자 업로드 API는 폐지됐다.

## 런타임과 관측

**Node**: Node.js — `mise.toml`이 단일 출처(로컬 mise·CI `setup-node`가 읽고 perf 컨테이너·bootstrap 기본값은 테스트가 맞춤, README 로컬 개발 환경), `package.json`의 `engines.node`가 설치 시 고정 버전을 하한으로 강제

**Logging**: Pino + Axiom — 서버 운영 로그는 `@axiomhq/pino` transport. 브라우저 web-vitals 는 `@axiomhq/react` 훅(`useReportWebVitals`+`transformWebVitalsMetric`)이 모으고 keepalive fetch 로 `POST /api/axiom` 서버 릴레이에 보낸다 — `@axiomhq/logging` 은 서버(`lib/observability/axiom-server.ts`)에서만 쓴다(클라이언트에 넣으면 서버용 `@axiomhq/js` 가 번들에 딸려 온다). 비인증 수집 경계는 THREAT_MODEL §4.1

**Realtime**: Centrifugo (자체호스팅 WS, Caddy `wss://`) + `centrifuge-js` — 채팅 라이브(즉시 수신·타이핑·프레즌스·읽음). 메시지는 자사 Postgres에만 영속, 비공개 ACL은 subscribe-proxy로 앱에 보존

**Client data fetching**: SWR — `force-static` 랜딩 헤더(`LandingHeaderNav`/`PgLandingHeaderNav`)가 마운트 후 `/api/auth/session`을 클라이언트에서 재조회해 로그인 상태를 반영(`components/landing/use-session-authed.ts`); 같은 키를 쓰는 두 헤더 인스턴스 요청을 SWR 캐시가 자동 중복제거
