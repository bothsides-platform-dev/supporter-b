# 샘플 견적 요청 (구매사 온보딩) — 설계

**작성일:** 2026-06-11
**상태:** 설계 확정 (구현 대기)
**범위:** 구매사(buyer) 온보딩. PG 온보딩은 범위 밖.

## 목적

신규(및 기존) 구매사가 처음 로그인했을 때 빈 화면(`아직 보낸 견적 요청이 없어요`) 대신,
**견적이 이미 도착해 있는 샘플 견적 요청 1건**을 보여줘 비교·선정 흐름을 바로 체험하게 한다.
샘플은 둘러보기용이므로 **언제든 직접 삭제**할 수 있고, 삭제하면 다시 나타나지 않는다.

## 핵심 결정 (확정)

| 항목 | 결정 |
|---|---|
| 샘플 형태 | 받은 견적(bid)이 있는 실제 RFP 1건 (실제 DB 로우) |
| 아키텍처 | **A — 실제 시드 로우, 실제 코드 경로 재사용** (합성 픽스처 아님) |
| 상호작용 | **보기·비교 전용 샌드박스** — 선정(award)·채팅 비활성 |
| 적용 범위 | 신규 구매사 자동 시드 + 기존 구매사 1회성 백필 |
| 비더 이름 | 가공의 샘플명 (`샘플페이 A/B/C`) — 실제 PG사 사칭 안 함 |
| 삭제 위치 | 상세 페이지 배너 + 목록 행 |
| 삭제 영속성 | 삭제 후 재시드 안 함 (`sampleSeededAt` 마커 유지) |

### 아키텍처 A를 택한 이유
샘플을 진짜 RFP로 심으면 목록·상세·비교가 **실제와 동일한 로더로 렌더링**된다.
온보딩이 실제 제품을 그대로 보여주고, 샘플이 실제 코드와 어긋날(drift) 위험이 없다.
대가는 마이그레이션 1회 + 버킷당 소수의 시드 로우 + 데모 PG 워크스페이스 + 게이트된 하드삭제.
위험한 부분(하드삭제)은 `isSample` 게이트로 격리한다.
(대안 C — DB 미저장 합성 픽스처 — 는 핵심 로더에 분기·이중 렌더링 경로를 영구히 남겨 기각.)

## 데이터 모델 변경 (additive, `drizzle-kit push`)

세 개 컬럼만 추가한다. 기존 행은 모두 default로 안전하게 백필된다.

```
rfps.isSample          boolean      NOT NULL DEFAULT false
workspaces.isDemo      boolean      NOT NULL DEFAULT false
workspaces.sampleSeededAt  timestamptz  NULL
```

- **`rfps.isSample`** — 샘플 RFP 로우 표식. `샘플` 칩, 샌드박스 가드, 삭제 게이트를 구동.
- **`workspaces.isDemo`** — 전역 데모 PG(비더) 워크스페이스 및 그 유저 표식. 모든 실제 표면에서 제외.
- **`workspaces.sampleSeededAt`** — 해당 구매사 워크스페이스에 샘플을 심은 시각. 시드 멱등성 + 삭제 영속성의 단일 근거.

`bids`에는 컬럼을 추가하지 않는다. 샘플 여부는 부모 RFP(`rfp.isSample`)에서 파생되고, bid는 RFP 삭제 시 cascade 된다.

## 컴포넌트

### 1. 전역 데모 비더 — `OnboardingService.ensureDemoPgs(tx)`
- `isDemo=true` PG 워크스페이스 3개(`샘플페이 A/B/C`)를 이름 기준 멱등 upsert.
- 각 데모 PG에 **로그인 불가** 데모 유저 1명 + 멤버십을 둔다 (`bids.submittedBy`·`rfp_invitations.acceptedByUserId`가 NOT NULL이라 필요).
- 모든 구매사의 샘플이 이 3개를 공유한다 (구매사마다 새로 만들지 않음).
- 데모 유저는 사용 가능한 자격증명을 갖지 않으며 `isDemo` 워크스페이스에만 속한다(멤버 목록은 워크스페이스 스코프이므로 실제 표면에 노출되지 않음).

### 2. 버킷당 시드 — `OnboardingService.seedSampleRfp(tx, {buyerWsId, buyerUserId})`
`workspaces.sampleSeededAt IS NULL`일 때만 동작 (멱등). 같은 트랜잭션 내에서:

1. `ensureDemoPgs(tx)` → `nextRfpId(tx)`로 코드 발급 → **RFP 1건 삽입**:
   - `isSample=true`, `status='sent'`, `boardVisible=false`
   - `deadline` = 충분히 먼 미래 (예: now + 3650일) — 샘플이 `마감` 상태로 노후화되지 않도록
   - `createdBy=buyerUserId`, `sentAt=now`
   - 현실적 내용: 제목 `온라인 쇼핑몰 PG 견적 요청 (샘플)`, `requiredPaymentMethods=['card','virtual_account','easy_pay']`, 거래액/현재 수수료/정산조건 등 채움
2. 데모 PG 3개 각각에 대해: `rfp_allowed_pg` + `rfp_invitations(status='accepted', tokenHash=random)` + **bid 1건(`status='submitted'`)** 삽입.
   - 세 bid의 조건을 **의도적으로 차별화**해 비교가 의미를 갖게 한다:
     - A: 카드 수수료 최저, 정산 느림(D+2), 한도 낮음
     - B: 중간 수수료, 정산 빠름(D+1), 한도 높음
     - C: 수수료 다소 높음, 간편결제 우대 등 종합 조건 우수
   - 수수료는 우대수수료 매트릭스(TierRates: 영세/중소/일반)로 표현해 실제 제안 화면을 그대로 보여준다.
3. `workspaces.sampleSeededAt = now` 설정.
4. `boardColumnId`는 null로 두어 칸반 분류기가 자동 배치 (별도 배치 불필요).
- bid·invitation 로우는 직접 삽입하며 **알림 팬아웃·이메일을 발생시키지 않는다**.

### 3. 시드 훅 포인트
- **신규 구매사:** `createWorkspaceInTx`(`lib/server/actions/workspace/_createWorkspace.ts`)에서 `type==='buyer'`일 때 같은 원자적 트랜잭션 안에서 `seedSampleRfp` 호출. PG 워크스페이스는 시드 안 함.
- **기존 구매사:** 1회성 멱등 스크립트 `scripts/backfill-sample-rfp.ts` — `sampleSeededAt IS NULL`인 모든 buyer 워크스페이스를 순회, 각 워크스페이스의 admin 유저를 `createdBy`로 사용해 `seedSampleRfp` 호출. 배포 후 수동 1회 실행 (프로젝트는 push-only + 수동 스크립트 운용).

### 4. 삭제 — `deleteSampleRfpAction` → `OnboardingService.deleteSampleRfp(code, actor)`
- 세션에서 `actor = {userId, workspaceId}` 추출.
- 코드로 RFP 로드 후 **`buyerWsId === actor.workspaceId` AND `isSample === true`가 아니면 거부** (`{ok:false, error}`). 실제 RFP는 이 경로로 절대 하드삭제되지 않는다.
- `DELETE FROM rfps WHERE id=...` → bids·rfp_invitations·rfp_allowed_pg·attachments·rfp_team_messages cascade.
  - 구현 시 각 FK의 `ON DELETE CASCADE` 여부를 확인하고, cascade가 아닌 자식이 있으면 트랜잭션 내에서 명시적으로 먼저 삭제한다.
- `sampleSeededAt`은 그대로 둔다 → 재시드 안 함. 전역 데모 PG는 유지(공유).
- 소유 서비스: 온보딩 관심사를 한데 모은 신규 `OnboardingService`(`seedSampleRfp` + `deleteSampleRfp` + `ensureDemoPgs`). 액션은 얇은 래퍼. (서비스 레이어 규칙 준수)

### 5. UI (모두 `rfp.isSample` 키 기반)
- **`샘플` 칩:** 목록 행 · 보드 카드 · 상세 헤더에 표시 (neutral/surface — 정보성, 상태 칩과 별개로 병기). Chip 컴포넌트 사용 (대괄호 평문 금지).
- **샌드박스 가드 (상세 페이지):**
  - 선정 버튼 비활성 + 인라인 안내: `샘플에서는 선정할 수 없어요. 실제 견적 요청을 보내보세요.`
  - 채팅 레일(ChatRail) 비활성 + 샘플 안내.
- **삭제 어포던스:**
  - 상세 페이지 샘플 배너 — `둘러보기용 샘플 견적 요청이에요. 다 살펴봤다면 삭제해도 돼요.` + `샘플 삭제` 버튼.
  - 확인 다이얼로그 — `샘플 견적 요청을 삭제할까요? 삭제하면 다시 표시되지 않아요.`
  - 성공 시 `/rfp`로 리다이렉트 + 토스트.
  - 목록 행에도 샘플 항목 삭제 액션 제공.
- 모든 문구는 `UX_WRITING.md`(해요체·능동형·긍정형) 준수. 용어는 `견적 요청`(RFP)/`견적`(bid)/`선정`(award).

### 6. 안전 / 제외 지점 (회귀 테스트 대상)
- **샘플 RFP가 PG 오픈 게시판에 새지 않도록:** `boardVisible=false` **그리고** 게시판 쿼리(`lib/server/repositories/drizzle/rfp-pg-request.ts`)에서 `isSample=true` 제외. (이중 방어)
- **데모 PG 워크스페이스 제외:** 구매사 PG 허용목록 피커(현재 `listCanonicalPgWorkspaces`가 `canonicalPgKey IS NOT NULL`만 반환 → 데모 PG는 `canonicalPgKey` NULL이라 이미 제외; 구현 시 재확인), 멤버 검색, 기타 워크스페이스 목록에서 제외. 데모 PG는 인증되지 않음.
- **삭제는 `isSample && 소유권`으로 엄격 게이트.**

## 테스트 (TDD — RED 먼저, 프로젝트 필수 규칙)

각 항목은 실패하는 테스트를 먼저 작성·확인한 뒤 최소 구현한다.

- `ensureDemoPgs` — 데모 PG 3개 + 유저 멱등 생성 (2회 호출해도 중복 없음).
- `seedSampleRfp` — RFP 1건(isSample, sent, boardVisible=false) + bid 3건 + invitation/allowlist 생성; `sampleSeededAt` 설정; 두 번째 호출은 no-op.
- `deleteSampleRfp` — 샘플+자식 cascade 삭제; 비-샘플 RFP 거부; 타 워크스페이스 RFP 거부; `sampleSeededAt` 유지(재시드 안 함).
- 게시판 쿼리가 `isSample`/`boardVisible=false` 샘플을 제외함 (회귀).
- 허용목록 피커가 데모 PG를 제외함.
- `createWorkspace` — buyer는 샘플 시드, pg는 시드 안 함.
- 상세 페이지 — `isSample`일 때 선정 버튼 비활성 + 샘플 배너 노출 (컴포넌트 테스트).
- 목록 — 샘플 행에 `샘플` 칩 + 삭제 액션 노출.

## 영향 받는 파일 (예상)

- `lib/db/schema/rfps.ts` (isSample), `lib/db/schema/workspaces.ts` (isDemo, sampleSeededAt)
- `lib/server/services/onboarding.ts` (신규: OnboardingService)
- `lib/server/actions/workspace/_createWorkspace.ts` (buyer 시드 훅)
- `lib/server/actions/onboarding/deleteSampleRfpAction.ts` (신규)
- `scripts/backfill-sample-rfp.ts` (신규, 1회성)
- `lib/server/repositories/drizzle/rfp-pg-request.ts` (게시판 쿼리 isSample 제외)
- `app/(app)/rfp/page.tsx` + 목록/보드 컴포넌트 (샘플 칩 · 삭제 액션)
- `app/(app)/rfp/[id]/` 상세 컴포넌트 (샘플 배너 · 선정/채팅 샌드박스 가드)
- `SCREEN_DESIGN.md` (샘플 온보딩 동작 등록)

## 범위 밖 (YAGNI)
- PG 워크스페이스 온보딩 샘플.
- 샘플 첨부파일(제안 PDF) — 초기엔 생략, 필요 시 후속.
- 샘플 award 동작(샌드박스이므로 비활성).
- "실제 RFP 0건일 때만 표시" 같은 조건부 숨김 — 사용자는 수동 영속 삭제를 택함.
