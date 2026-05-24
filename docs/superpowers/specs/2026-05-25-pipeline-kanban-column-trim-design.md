# 파이프라인 칸반 컬럼 정리 — 설계

> 2026-05-25 · 브레인스토밍 산출물 · 다음 단계: writing-plans

## 1. 문제

파이프라인 칸반(`/rfp` 구매사, `/inbox` PG — 표/칸반 토글의 칸반 뷰)이
스펙의 **정규 4단계 모델보다 많은 컬럼**을 렌더한다.

- `PG_RFP_SPEC.md` §5 IA — **B2 `/rfp`**: `작성중 / 진행중 / 마감 / 계약완료` (4)
- `PG_RFP_SPEC.md` §5 IA — **P2 `/inbox`**: `신규 / 작성중 / 제출완료 / 마감` (4)
- `SCREEN_DESIGN.md` B2(62줄)·P2(74줄) — 동일한 4탭
- 표 뷰 필터(`STATUS_OPTIONS`)도 이미 이 4개를 사용

그런데 칸반 구현(`lib/server/buyer-kanban.ts` / `pg-kanban.ts`)은 독립적으로
**6컬럼**으로 확장됐다(두 파일 모두 주석에 "6개 컬럼" 명시). CLAUDE.md 규칙상
**`PG_RFP_SPEC.md` 가 정본이며 다른 문서가 drift 하면 안 된다** — 즉 칸반 구현이
drift 다. 이 세션의 목표는 **불필요한 라이프사이클(필수) 컬럼을 제거**하여
칸반을 정규 모델에 맞추는 것.

> 범위 밖(별도 세션): 커스텀 컬럼 추가/이름변경/색상/삭제(`AddColumnControl`·`⋯`
> `ColumnMenu`) 제거, 드래그앤드롭 축소. 이번 변경은 **라이프사이클 컬럼 집합**만 다룬다.

## 2. 현재 → 목표 매핑

### 구매사(buyer) 6 → 4
| 목표 컬럼 (label / key) | 구성 |
|---|---|
| 작성중 `draft` | 그대로 |
| **진행중 `active`** | ← 발송 `sent` + 응답수집 `collecting` + 비교·협상중 `comparing` (3→1 병합) |
| 계약완료 `awarded` | ← 낙찰 (label 변경) |
| 마감 `closed` | ← 종료 (label 변경) |

컬럼 순서: `draft → active → awarded → closed` (생존 단계의 기존 상대 순서 유지).

### PG 6 → 5
| 목표 컬럼 (label / key) | 구성 |
|---|---|
| **신규 `received`** | ← 수신 `received` + 검토중 `reviewing` (2→1 병합, "열람" 수신확인 단계 제거) |
| 작성중 `drafting` | 그대로 |
| 제출완료 `submitted` | 그대로 |
| 낙찰 `won` | 그대로 (승패 구분 유지 — 결정 사항) |
| 실패 `lost` | 그대로 |

컬럼 순서: `received → drafting → submitted → won → lost`.

### 결정된 판단 사항
- **PG 낙찰/실패 분리 유지** (스펙은 `마감` 단일이나 PG 영업에 승패는 핵심 —
  `/home` PG `수주율`, `BidCard` `낙찰` 칩과 일관). → 스펙에서 의도적으로 deviate.
- **구매사 비교·협상중은 진행중으로 병합** (스펙 준수, 미니멀).

> 문서 정합: PG 보드가 5컬럼으로 스펙(4탭)과 달라지므로, 구현 후
> `PG_RFP_SPEC.md` §5 + `SCREEN_DESIGN.md` P2 에 "칸반은 낙찰/실패를 분리 표기"
> 주석을 추가해 drift 가 아니라 의도된 차이임을 기록한다.

## 3. 영향 받는 코드 (구현 표면)

순수 도메인부터 바깥으로:

1. **`lib/server/buyer-kanban.ts`**
   - `BuyerKanbanStage`: `'draft' | 'active' | 'awarded' | 'closed'`
   - `BUYER_KANBAN_ORDER` / `BUYER_KANBAN_LABEL`: 4개로 축소, `active='진행중'`,
     `awarded='계약완료'`, `closed='마감'`
   - `classifyBuyerRfp`: `status==='sent'` → `'active'` (제출 bid 수·마감·초대수
     기반 collecting/comparing 분기 제거)
   - `compareBuyerCards`: 단계 키 기반 정렬에서 collecting/comparing 참조 제거
     (active = deadline 오름차순, draft/awarded/closed = createdAt 내림차순)
   - `BuyerKanbanCard` 필드(invitedPgCount/submittedBidCount)는 **유지** — 카드
     표시(`응답 N/M`)는 그대로. 컬럼 분류만 단순화.

2. **`lib/server/pg-kanban.ts`**
   - `PgKanbanStage`: `'received' | 'drafting' | 'submitted' | 'won' | 'lost'`
   - `PG_KANBAN_ORDER` / `PG_KANBAN_LABEL`: `reviewing` 제거, `received='신규'`
   - `classifyPgInvitation`: `invitation.status==='opened' → 'reviewing'` 분기 제거
     (열람도 `received`/신규로)
   - `comparePgCards`: won/lost 유지 — 변경 최소

3. **`lib/server/columns/lifecycle-keys.ts`**
   - `CROSS_SIDE_LIFECYCLE_KEYS`: buyer `sent/collecting/comparing` → `active`
     로 치환(나머지 awarded/closed/received/submitted/won/lost 유지)
   - "private skeleton" 주석에서 `reviewing` 제거

4. **`lib/server/columns/seed.ts`** — `defaultColumns` 는 `*_KANBAN_ORDER` 에서
   파생되므로 **자동으로 4/5 컬럼**. 코드 변경 불필요(ORDER 배열만 바뀌면 따라옴).

5. **`components/home/dragMatrix.ts` + `components/board/resolveBoardDrop.ts`**
   드래그 전이가 단계 키 기반 — 새 단계로 매트릭스 재작성:
   - buyer: `draft→active`(send-rfp), `active→awarded`(navigate-rfp-detail),
     `{draft,active}→closed`(cancel-rfp)
   - pg: `received→drafting`(navigate-inbox), `drafting→submitted`(navigate-inbox),
     `submitted→lost`(withdraw-bid)
   - (DnD 자체는 유지 — 컬럼 집합에만 맞춤)

6. **DB 백필 마이그레이션** (기존 워크스페이스는 6 파이프라인 컬럼이 시드돼 있음)
   - 각 워크스페이스에 대해 파이프라인 컬럼을 새 집합으로 재조정:
     - buyer: `sent`·`collecting`·`comparing` 컬럼 삭제 + `active`(진행중) 컬럼 1개
       삽입(올바른 position), `awarded`→title 계약완료, `closed`→title 마감
     - pg: `reviewing` 컬럼 삭제, `received`→title 신규
   - 카드는 `board_column_id` 가 거의 항상 null → `resolveCardColumn` 의 lifecycleKey
     매칭으로 새 컬럼에 **자동 재분류**. 커스텀 파이프라인 컬럼은 보존.
   - `seed.ts` 주석이 언급한 기존 백필 스크립트 경로를 확장/추가.

7. **테스트(TDD — RED 먼저)**: `buyer-kanban`·`pg-kanban`·`lifecycle-keys`·
   `seed.test.ts`·`loadBoard.test.ts`·`dragMatrix`/`resolveBoardDrop` 테스트 갱신
   + 백필 마이그레이션 테스트 추가.

## 4. 부수 고려 (코어 아님)

- **PG 상태 필터**(`STATUS_OPTIONS` in `app/(app)/inbox/page.tsx`)는 현재
  `new/draft/submitted/closed`. 보드가 won/lost 로 갈라지므로 필터에 승/패 옵션을
  추가할지 여부는 별건 — 필터는 컬럼과 1:1일 필요 없음. 본 변경에서는 손대지 않음(메모만).
- 컬럼 순서에서 구매사 `awarded`(계약완료) vs `closed`(마감) 표시 순서는 기존 상대
  순서(awarded→closed) 유지. 스펙 탭 순서(마감→계약완료)와 다르나 칸반 진행 방향상
  성공 단계를 먼저 두는 게 자연스러움.

## 5. 완료 기준

- 구매사 칸반 = 4컬럼, PG 칸반 = 5컬럼. 표 뷰·필터와 정합(승/패 제외).
- 기존 워크스페이스 백필 후 모든 카드가 올바른 새 컬럼에 표시(유실 카드 없음).
- 커스텀 컬럼 기능·DnD 동작은 회귀 없음(범위 밖이나 깨지지 않아야 함).
- `pnpm test` 전체 그린, `tsc --noEmit`·`lint` 클린.
