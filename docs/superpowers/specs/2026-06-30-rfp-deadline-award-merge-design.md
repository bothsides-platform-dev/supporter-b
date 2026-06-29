# 마감·선정완료 통합 표시 — 설계 스펙

- 작성일: 2026-06-30
- 상태: 설계 확정 (구현 대기)
- 범위: buyer RFP 상태 표시 (칸반 보드 + 목록 테이블 + 딜룸/모달 + 홈 미니보드)

## 1. 목표

buyer 화면에서 `마감`(closed)과 `선정완료`(awarded)를 **하나의 '마감' 종결 버킷**으로 통합해 보여준다.
종결된 RFP의 결과(선정완료 / 미선정 / 취소)는 **칩**으로 구분한다.

## 2. 대원칙 — 표시(display)만 변경

- `RfpStatus` enum(`draft | sent | closed | cancelled | awarded`)·DB 스키마·서버 로직은 **불변**.
- **DDL 0.** 데이터 모델은 종결 상태를 계속 구분(closed ≠ awarded ≠ cancelled). 통합은 순수 프레젠테이션 계층에서만 일어난다.
- 마이그레이션은 기존 워크스페이스의 잉여 칸반 컬럼 1개를 지우는 **1회성 스크립트**뿐.

## 3. 결과 칩 용어 (확정)

| status | 칩 라벨 | 칩 색 |
|---|---|---|
| awarded | **선정완료** | tertiary |
| closed | **미선정** | surface(중립) |
| cancelled | **취소** | error |

- 비종결 상태는 기존 유지: `draft → 임시저장`(surface), `sent → 요청 보냄`(warning).
- closed 라벨을 '마감' → '미선정'으로 바꾸는 이유: 통합 버킷(컬럼·마감일 열)이 이미 '마감'을 전달하므로, 칩에 '마감'을 또 쓰면 중복. '미선정'은 "선정 없이 종결"을 정확히 표현.

## 4. Part 1 — 칩 라벨 SSOT 재라벨

**파일: `lib/rfp-status.ts`**

`RFP_STATUS_CHIP` 단일 출처를 직접 수정한다.

```diff
- closed: { label: '마감', color: 'surface' },
- awarded: { label: '선정 완료', color: 'tertiary' },
+ closed: { label: '미선정', color: 'surface' },
+ awarded: { label: '선정완료', color: 'tertiary' },
  cancelled: { label: '취소', color: 'error' },
```

### 자동 전파 범위 (이 SSOT / `rfpStatusChip()` 소비처)

1. `components/rfp/RfpListTable.tsx` — buyer 목록 테이블. **코드 변경 불필요** — 행마다 `RFP_STATUS_CHIP[rfp.status]`를 이미 렌더하므로 재라벨만으로 "결과 칩만" 요구사항 충족(마감일 열 + 상태 칩).
2. `app/(app)/rfp/[id]/page.tsx` — buyer 딜룸 정식 페이지(`rfpStatusChip`).
3. `app/(app)/rfp/@modal/(.)[id]/page.tsx` — buyer 딜룸 @modal 인터셉트(`rfpStatusChip`).
4. `components/messages/ContextPanel.tsx` — messages(buyer+PG 공통) 연결 RFP 카드(`rfpStatusChip`).

### 봉인 경계 (영향 없음)

- **PG 화면은 별도 `pgRequestChip()`** 사용 — `RFP_STATUS_CHIP`를 참조하지 않는다. `lib/rfp-status.ts:33-34`의 "통일하지 말 것(승자 신원 비노출)" 의도가 보존된다. PG 딜룸은 계속 `선정됨`/`선정 마감`(중립), PG 칸반 lost 컬럼은 계속 `미선정`(개인 결과).

### ContextPanel 결정 (확정)

messages는 공통 화면이고 ContextPanel은 viewer 역할을 모른 채 `rfpStatusChip(status)`로 칩을 그린다. 재라벨 후 **PG도 closed RFP를 '미선정'으로 보게 되는 것을 허용**한다.
- 근거: `closed` RFP는 실제 선정자가 없으므로 '미선정'은 사실이며 승자 신원을 노출하지 않는다. `awarded`는 재라벨 전후 모두 중립적('선정 완료'→'선정완료')이라 추가 정보 노출 없음.
- 결론: ContextPanel은 **추가 작업 없이** SSOT 재라벨을 그대로 상속한다.

## 5. Part 2 — 칸반 컬럼 병합 (buyer 파이프라인 보드)

3컬럼(`진행중 / 선정 완료 / 마감`) → **2컬럼(`진행중 / 마감`)**. 홈 미니보드도 동일 상수를 공유하므로 함께 반영된다.

### 5.1 상수·분류 (`lib/server/buyer-kanban.ts`)

```diff
- export type BuyerKanbanStage = 'active' | 'awarded' | 'closed';
+ export type BuyerKanbanStage = 'active' | 'closed';

- BUYER_KANBAN_ORDER = ['active', 'awarded', 'closed']
+ BUYER_KANBAN_ORDER = ['active', 'closed']

  BUYER_KANBAN_LABEL = {
    active: '진행중',
-   awarded: '선정 완료',
    closed: '마감',
  }

  // classifyBuyerRfp
- if (rfp.status === 'awarded') return 'awarded';
  if (rfp.status === 'closed' || rfp.status === 'cancelled') return 'closed';
+ if (rfp.status === 'awarded') return 'closed';   // 선정완료도 '마감' 버킷
  return 'active';
```

`BuyerKanbanCard`에 **`status: RfpStatus`를 추가**(`toBuyerCard`/`loadBoard`에서 채움)해 카드가 결과 칩을 그릴 수 있게 한다.

**파일: `lib/server/columns/lifecycle-keys.ts`** — `CROSS_SIDE_LIFECYCLE_KEYS` 집합(비삭제 시스템 컬럼)에서 buyer side `'awarded'`를 제거한다. 병합 후 'awarded' lifecycleKey를 쓰는 buyer 컬럼이 없어지므로. (PG side `won`/`lost`는 그대로 — award→won/lost 크로스사이드 프로토콜은 award **액션**으로 일어나며 buyer 'awarded' 컬럼 존재와 무관.)

### 5.2 시드 (`lib/server/columns/seed.ts`)

`buyerSpecs()`는 `BUYER_KANBAN_ORDER`를 그대로 매핑하므로 신규 워크스페이스는 자동으로 2컬럼만 시드된다. 코드 변경 불필요(상수 변경에 따라감).

### 5.3 마이그레이션 스크립트 (신규)

**파일: `scripts/remove-awarded-kanban-columns.ts`** (기존 `scripts/remove-draft-kanban-columns.ts` 패턴 복제)

```ts
// lifecycle_key = 'awarded' AND kind = 'pipeline' 컬럼 삭제.
// rfps.board_column_id 는 ON DELETE SET NULL → 포인터가 풀리고,
// resolveCardColumn 이 다음 렌더에서 카드를 'closed'(마감) 컬럼으로 재배치.
```

- 운영 1회 실행: `tsx scripts/remove-awarded-kanban-columns.ts`
- 미실행 시: 기존 워크스페이스에 빈 '선정 완료' 컬럼이 유령으로 잔존(상수만 바뀌고 DB 컬럼은 그대로). 배포 체크리스트에 포함.

### 5.4 카드 결과 칩 (`components/board/PipelineCard.tsx`)

```diff
  function BuyerBody({ card }) {
-   const isResult = card.stage === 'awarded' || card.stage === 'closed';
+   const isResult = card.stage === 'closed';
    return (
      <CardHead ... hideDday={isResult} />
-     {(card.isCancelled || card.isSample) && (
-       {card.isCancelled && <Chip label="취소됨" color="error" />}
-       {card.isSample && <Chip label="샘플" color="surface" />}
-     )}
+     {(isResult || card.isSample) && (
+       {isResult && <Chip label={RFP_STATUS_CHIP[card.status].label}
+                          color={RFP_STATUS_CHIP[card.status].color} />}
+       {card.isSample && <Chip label="샘플" color="surface" />}
+     )}
    )
  }
```

- '마감' 컬럼 카드는 `RFP_STATUS_CHIP[card.status]`로 **선정완료 / 미선정 / 취소** 칩을 표시. (컬럼 헤더가 '마감'을 전달하므로 별도 '마감' 칩은 불필요.)
- 기존 `취소됨` 특수 칩은 통합 '취소' 칩으로 흡수. `샘플` 칩은 유지.

### 5.5 DnD 의미 (`components/home/dragMatrix.ts`)

병합으로 buyer 보드의 두 종결 컬럼이 하나가 되므로, 종결 컬럼으로의 드롭 의도를 하나로 정리한다.

```diff
  function resolveBuyer(i) {
    if (i.from === i.to) return null;
-   if (i.from === 'active' && i.to === 'awarded')
-     return { kind: 'navigate-rfp-detail', rfpId: i.rfpId };
-   if (i.from === 'active' && i.to === 'closed')
-     return { kind: 'cancel-rfp', rfpId: i.rfpId, title: i.title };
+   // 진행중 → 마감: 선정/취소는 상세에서 결정 → 상세로 이동
+   if (i.from === 'active' && i.to === 'closed')
+     return { kind: 'navigate-rfp-detail', rfpId: i.rfpId };
    return null;
  }
```

- **확정**: 진행중 → 마감 드롭 = **RFP 상세로 이동**(거기서 선정 또는 취소 결정).
- 결과: 드래그-취소 단축키는 사라진다. 취소는 RFP 상세 페이지에서 계속 가능.
- **`cancel-rfp` DragAction 경로가 고아가 된다.** 직접 원인이 이 병합이므로 함께 정리:
  - `dragMatrix.ts`: `cancel-rfp` union 멤버 제거.
  - `components/home/KanbanActionDialog.tsx`: `cancel-rfp` 케이스 제거(navigate-rfp-detail은 다이얼로그 없이 `useBoardDnd`가 `/rfp/{id}`로 이동, 기존 동작).
  - cancel 자체(`cancelRfpAction`/`RfpService.cancel`)는 상세 페이지에서 계속 호출되므로 **서버 로직은 불변**.

## 6. 영향받는 테스트 (TDD — RED 먼저)

기존 테스트 갱신:
- `lib/__tests__/rfp-status.test.ts` — awarded → '선정완료', closed → '미선정' 단언.
- `lib/server/__tests__/buyer-kanban.test.ts` — `classifyBuyerRfp(awarded)` → `'closed'`.
- `lib/server/columns/__tests__/seed.test.ts` — buyer 컬럼 lifecycleKey === `['active','closed']`.
- `lib/server/columns/__tests__/lifecycle-keys.test.ts` — 'awarded' 제거 반영.
- `lib/server/actions/workspace/__tests__/createWorkspace.test.ts` — buyer 시드 컬럼 단언.
- `components/home/__tests__/dragMatrix.test.ts` — active→awarded 제거, active→closed = navigate-rfp-detail.
- `components/board/__tests__/resolveBoardDrop.test.ts` — active→closed lifecycle = navigate(상세 이동).
- `components/board/__tests__/useBoardDnd.test.tsx` — cancel-rfp 경로 제거 반영.
- `components/home/__tests__/KanbanActionDialog.test.tsx` — cancel-rfp 다이얼로그 테스트 제거.

신규 테스트:
- `PipelineCard` — '마감' 컬럼 카드가 status별 결과 칩(선정완료/미선정/취소)을 렌더하는지.
- (선택) 마이그레이션 스크립트 — 기존 `remove-draft-kanban-columns` 테스트 유무에 맞춤.

## 7. 배포 체크리스트

1. 코드 배포.
2. **`tsx scripts/remove-awarded-kanban-columns.ts` 1회 실행** (기존 워크스페이스 '선정 완료' 컬럼 제거 — 안 하면 빈 컬럼 잔존).
3. DDL 없음. 일괄 로그아웃 없음.

## 8. 비범위 (Out of scope)

- PG 칸반/딜룸/목록 — 별도 `pgRequestChip()` 사용, 변경 없음.
- `RfpStatus` enum·DB 컬럼 변경 — 없음.
- 컬럼 추가/커스터마이즈 — 없음(현행 lifecycle 컬럼 구조 유지, 개수만 3→2).
