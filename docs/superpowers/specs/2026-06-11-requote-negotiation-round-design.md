# 견적 재요청 — 마감 전 협상 라운드 설계

**작성일**: 2026-06-11
**상태**: 설계 확정 (구현 전)

## 배경 / 목적

지금 RFP·견적 흐름은 **단일 패스**다. RFP는 `draft → sent → {closed | cancelled | awarded}` 로만 흐르고, 한 PG는 RFP당 견적을 **딱 한 번**만 낼 수 있다(`bids` 테이블 `UNIQUE(rfpId, pgWsId)`). 제출한 견적은 수정 불가이고, 철회(withdraw)는 일방향이며 재제출 경로가 없다. 라운드·개정·재오픈 개념은 존재하지 않는다.

현실의 견적 협상은 한 번에 끝나지 않는다. 구매사는 1차 견적을 받아본 뒤, **마음에 드는 후보 PG에게 "조건을 더 개선해서 다시 내달라"**고 요청하고 싶어 한다. 이 스펙은 RFP가 아직 진행 중(`sent`)일 때, 구매사가 **특정 PG를 골라 개선 요청 메시지와 새 마감일을 담아 재요청**을 보내고, 그 PG가 **새 라운드 견적을 다시 제출**할 수 있게 하는 협상 라운드 기능을 정의한다.

선정(award) 전 단계의 협상이며, 종료된 RFP를 다시 여는 시나리오는 **범위 밖**이다.

## 확정 결정 (브레인스토밍 합의)

1. **트리거 = 마감 전 협상 라운드**: RFP는 `sent` 상태를 유지한 채 일어난다. 종료(closed/cancelled/awarded) 상태를 재오픈하는 흐름이 아니다.
2. **대상 = 구매사가 직접 선택**: 구매사가 PG를 하나 이상 골라 타깃 재요청한다. (전체 일괄·자동 아님.)
3. **1차 견적 = 라운드 이력 보존**: 기존 견적은 동결하고, 재제출분은 새 라운드 행으로 누적한다. "개선 전/후" 비교가 가능하다.
4. **마감 = 새 마감일 지정**: 구매사가 재요청 시 새 마감일을 입력하고, `rfps.deadline`을 그 값으로 갱신한다.
5. **메시지 = 필수**: 재요청에는 개선 요청 메시지가 반드시 들어간다(빈 값 거부).
6. **모델 = 전용 테이블 + round 컬럼** (접근법 A): cold-pitch(`rfp_pg_requests`)의 검증된 "쌍당 요청 + 상태 + 버튼" 패턴을 차용한 신규 테이블 + `bids.round`.
7. **round = PG별 시퀀스**: 전역 라운드가 아니라 (rfp, pg)별 제출 순번. 구매사가 PG를 따로 고르므로 PG마다 라운드가 다를 수 있다(PG-A=round 3, PG-B=round 2).
8. **재요청 대상 자격 = 현재 submitted 견적 보유 PG만**: 협상은 기존 제안을 개선하는 것이므로, 1차 견적이 없는(또는 철회한) PG는 대상이 될 수 없다.
9. **봉인 입찰 무결성 유지**: 재요청은 1:1 buyer→PG 신호일 뿐, 경쟁사 정보·참여수 누출 없음(`Bid.competitorCount` 미존재 원칙 유지). 타깃 지정이 "당신은 후보다"라는 신호인 것은 의도된 동작이며 PG간 교차 누출이 아니다.

## 데이터 모델

### `bids` 테이블 변경

- `round int NOT NULL DEFAULT 1` 추가 — PG별 제출 순번 (1차=1, 재요청 응답=2, …).
- 제약 교체: `UNIQUE(rfpId, pgWsId)` → **`UNIQUE(rfpId, pgWsId, round)`**.
- **현재 견적(current bid)** = 그 PG의 `status='submitted'` 행 중 **최대 round** 행. 이전 라운드 행은 동결돼 이력으로 남는다.
- 기존 행은 모두 `round=1` 로 채워진다(DEFAULT).

⚠️ **마이그레이션 주의**: 컬럼 추가는 추가형이라 안전하나, `UNIQUE(rfpId,pgWsId)` → `UNIQUE(rfpId,pgWsId,round)` 제약 교체는 **비추가형**이다. push-only 정책(`drizzle-kit push`, migrations 폴더 없음) 하에서 배포 시 surgical ALTER(기존 제약 DROP + 신규 ADD)를 검토한다.

### 신규 테이블 `rfp_requote_requests`

cold-pitch `rfp_pg_requests` 패턴 차용.

| 컬럼 | 타입 | 의미 |
|---|---|---|
| `id` | uuid PK | |
| `rfpId` | FK→rfps.id (onDelete cascade) | |
| `pgWsId` | FK→workspaces.id | 재요청 대상 PG |
| `round` | int NOT NULL | 요청하는 라운드 번호 (= 그 PG의 현재 최대 round + 1) |
| `message` | text **NOT NULL** | 구매사 개선 요청 (필수) |
| `deadline` | timestamp NOT NULL | 이 라운드의 새 마감일 |
| `status` | enum `pending` \| `responded` | PG가 해당 라운드 견적을 내면 `responded` |
| `createdBy` | FK→users.id | |
| `createdAt` | timestamp NOT NULL default now() | |
| `respondedAt` | timestamp NULL | 응답 시각 |

- 제약: **`UNIQUE(rfpId, pgWsId, round)`** — (rfp,pg)당 라운드별 1요청, 중복 pending 방지.
- 신규 enum `rfp_requote_request_status` = `['pending', 'responded']`.
- `status`는 cold-pitch처럼 **명시 상태**(존재 여부로 파생하지 않음) — PG 인박스 UI("재요청 받음"/"응답 완료")와 감사추적에 사용.
- 응답하지 않으면 `pending`인 채 마감 경과 → 1차 견적이 그대로 유효. 별도 `declined`/`expired` 상태는 두지 않는다(YAGNI; "응답 안 함"은 pending lapse로 표현).

### RFP 상태

- `rfp.status`는 **`sent` 그대로 유지** — 상태머신(`lib/server/rfp-state.ts`) 변경 없음. 재요청은 종료 상태를 만들지 않는다.
- 재요청 발송 시 `rfps.deadline`을 새 마감일로 **갱신**한다.
- 여러 PG에 시점을 달리 재요청하면 **가장 마지막 요청의 마감일**이 `rfps.deadline`에 반영된다(latest wins, 단순화). 각 요청의 라운드 마감은 요청 레코드의 `deadline`이 권위를 가진다.

## 서버 레이어

계층 의존 방향(Actions → Services → Repositories)을 따른다.

### `RfpService.requote()`

RFP 전환·알림·아웃박스를 소유하는 `RfpService`에 추가 (award/close/cancel과 동일 위치).

```
requote(
  rfpId: string,
  input: { targetPgWsIds: string[]; message: string; newDeadline: Date },
  actor: Actor,
): ServiceResult
```

한 트랜잭션 안에서:

1. RFP 조회 + 소유권 검증 (actor가 buyer 워크스페이스 멤버이고 RFP를 소유).
2. **가드**:
   - `rfp.status === 'sent'` (종료 RFP면 거부).
   - `newDeadline > now`.
   - `targetPgWsIds.length >= 1`.
3. 각 대상 PG:
   - 현재 `status='submitted'` 견적이 있어야 함 (없으면 그 대상 거부).
   - 이미 `round = (최대 round + 1)` 에 pending 요청이 있으면 거부(중복).
4. 각 대상마다 `rfp_requote_requests` 레코드 생성 (`round = 그 PG 최대 round + 1`, `message`, `deadline = newDeadline`, `status='pending'`).
5. `rfps.deadline = newDeadline` 갱신.
6. 알림 팬아웃(아래) + 이메일 아웃박스 enqueue → post-commit flush.

`ServiceResult` 패턴(예외 throw 없이 `{ ok: true } | { ok: false; error }`)을 따른다.

### `BidService.submit()` 변경

현재 "이미 제출함 → `BID_ALREADY_SUBMITTED`" 차단 로직(bid.ts L112–115)을 **라운드 인지 3-way 분기**로 교체:

- PG 견적 없음 → 1차 제출, `round = 1` (기존 경로 유지).
- PG에 submitted 견적 있고 **pending 재요청 있음** → 허용: `round = 요청.round`로 **새 행 생성**, 해당 요청 `status='responded'` + `respondedAt` 기록.
  - 단 요청 `deadline` 이후면 거부 (`REQUOTE_DEADLINE_PASSED`).
- PG에 submitted 견적 있고 **pending 재요청 없음** → 기존대로 `BID_ALREADY_SUBMITTED` 차단.
- 1차(이전 라운드) 견적 행은 **수정·삭제하지 않는다**(동결).
- 기존 검증(allowlist `canAccess`, `status==='sent'`, 결제수단 검증, 첨부 검증)은 그대로 유지.

### 액션

- 신규 `requestRequoteAction(rfpId, pgWsIds[], message, newDeadline)` → 세션·소유권 검증 후 `RfpService.requote`에 위임.
  - zod: `message` 필수(trim 후 비어있으면 거부), `newDeadline` 미래, `pgWsIds` ≥ 1.
- PG 재제출은 **기존 `submitBidAction` 그대로 재사용** (라운드 로직은 BidService 내부). 새 PG 액션 불필요.

### 알림

신규 타입 **`'rfp.requote_requested'`**:

- 대상 PG의 admin-role 멤버에게 **인앱 + 이메일**.
- 이메일 템플릿 `renderRfpRequoteRequested`: RFP 코드·제목, 구매사명, **개선 요청 메시지**, 새 마감일, `inbox/[rfpId]`(견적 폼) 링크. PG-facing이므로 `partner.supporter-b.com` 오리진.
- dedup 키: `rfp:{rfpId}:requote:ws:{pgWsId}:round:{round}:user:{userId}`.
- PG가 재제출하면 → **기존 `bid.submitted` 알림이 구매사에게 그대로 발화**(재사용). 별도 신규 알림 없음.

## UI

UI 한국어 문구는 전부 '견적 / 재요청 / 선정' 도메인 언어(`UX_WRITING.md`). 코드 식별자·라우트는 영어(`requote`). Linear 디자인 하드룰 준수.

### 구매사 측 (`/rfp/[id]` 비교 화면)

- 비교 영역에 **`견적 재요청` CTA** → `RequoteDialog` 오픈:
  - 현재 submitted 견적을 낸 PG 목록을 **체크박스 다중선택**.
  - **개선 요청 메시지** textarea (필수, 빈 값 제출 차단).
  - **새 마감일** 피커 (미래만; 기존 RFP 마감일 입력 컴포넌트 재사용).
  - 전송 → `requestRequoteAction`.
- 상태 표시: 재요청 보낸 PG 카드에 **Chip `재요청함 · 응답대기`**(warning) → PG 재제출 시 **`재제출됨`**(tertiary)으로 전환.
- **라운드 비교**: 그 PG 카드에서 직전 라운드 값 대비 **개선분(델타)** 표시 — 기존 `ImprovementSummary` / `FocusComparison`에 round 라벨·이전값을 얹어 재사용. 이전 라운드는 접힌 형태로 열람.
- 디자인 하드룰: 상태는 Chip(대괄호 텍스트 금지), 금액·수수료·마감일은 `.md-numeric`, 6px 버튼(pill 금지).

### PG 측 (`/inbox/[rfpId]`)

- pending 재요청이 있으면 상세 상단에 **`재요청 받음` 배너**: 구매사 메시지 + 새 마감일, **`재요청에 응답하기` CTA**.
- 현재 종결 화면인 `inbox/[rfpId]/submitted` → pending 재요청 있으면 **직전 라운드 값으로 prefill된 견적 폼**으로 라우팅해 다시 편집·제출(조건을 낮춰 다시 내는 흐름).
- 인박스 목록: 해당 RFP 행에 **`재요청` 태그**.
- 응답 완료(재제출) 후엔 다시 종결 상태(최신 라운드 기준).

## 비즈니스 규칙 / 엣지 케이스

- 종료 RFP(`awarded`/`closed`/`cancelled`)에는 재요청 불가 → 에러.
- submitted 견적 없는 PG는 재요청 대상 불가 (피커 제외 + 서버 가드 이중).
- **철회(withdrawn)한 PG**: 유효 제안 없음 → 대상 불가.
- (rfp, pg)당 같은 round에 pending 재요청 중복 불가 (UNIQUE + 가드).
- 새 마감일은 미래만. 재요청 응답(round ≥ 2)은 그 요청 `deadline` 이전에만 허용 → 이후 거부.
- 재요청 받은 PG가 **응답 안 하면**: 요청 `pending` 유지, **1차 견적이 그대로 유효**(불이익 없음).
- **선정(award)**: 항상 각 PG의 **현재(최대 round, submitted) 견적** 기준. 구매사는 응답을 기다렸다가 선정하거나, 기다리지 않고 바로 현재 견적으로 선정 가능.
- 비초대 PG가 마감 연장 후 첫 견적(round 1)을 내는 것은 기존 동작 그대로 허용(무해). 재요청 게이트는 round ≥ 2에만 적용.

## 테스트 전략 (TDD — RED → GREEN)

모든 코드는 실패 테스트를 먼저 작성·확인한 뒤 구현한다.

- **`RfpService.requote`**: 요청 레코드 생성 · `deadline` 갱신 · 알림 팬아웃 / 가드(종료 RFP, 비입찰 대상, 과거 마감일, 빈 대상, 중복 pending) 각각.
- **`BidService.submit` 라운드 분기**: 재요청 시 round 증가 + 새 행 생성 + 요청 `responded` 마킹 / pending 없으면 차단 / 요청 deadline 경과 후 차단 / 1차 행 동결 확인.
- **리포지토리**: `UNIQUE(rfp,pg,round)`, current-bid = max(round) 쿼리, 라운드 이력 조회.
- **로더**(`rfp-detail-loader`): 비교 화면이 최신 라운드 + 이력 노출, PG 상세가 pending 재요청 노출.
- **액션**: `requestRequoteAction` 인증(buyer가 RFP 소유) + zod 검증(메시지 필수 · 마감 미래 · 대상 ≥ 1).
- **컴포넌트**: `RequoteDialog`(메시지 필수, 마감 피커, PG 다중선택), PG 재요청 배너 + prefill 폼.
- **e2e**: 구매사 재요청 → PG 개선 재제출 → 구매사 델타 확인 → 선정 시나리오.

## 마이그레이션 / 배포

- push-only 정책(`drizzle-kit push`, migrations 폴더 없음). 테스트 부트스트랩은 스키마에서 DDL 생성(`lib/db/schema-ddl.ts`).
- 추가형 변경(`bids.round` 컬럼, `rfp_requote_requests` 테이블, 신규 enum)은 운영 데이터 안전.
- ⚠️ **`bids` UNIQUE 제약 교체는 비추가형** — 배포 시 기존 `UNIQUE(rfpId,pgWsId)` DROP + `UNIQUE(rfpId,pgWsId,round)` ADD를 surgical ALTER로 검토(공유 DB cross-branch drop 주의).

## 범위 밖 (Non-goals)

- 종료(closed/cancelled/awarded) RFP의 재오픈.
- 전체 PG 일괄 재요청 / 자동 재요청.
- 라운드별 마감의 PG별 분리 영속(현 모델은 `rfps.deadline` latest-wins + 요청 레코드 deadline).
- PG의 명시적 "재요청 거절" 액션(응답 안 함 = pending lapse로 충분).
- 1차 견적을 라운드 비교 없이 덮어쓰는 모드.
