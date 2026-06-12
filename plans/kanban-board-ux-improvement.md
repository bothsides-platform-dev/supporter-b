# 견적란 칸반 보드 UX 진단 및 개선 계획

> 2026-06-12 작성. 대상: 구매사 `/rfp` · PG `/inbox` 칸반 보드 (`components/board/*`).
> 참고 이미지: Linear형 작업 칸반 (해야 할 일 / 진행 중 / HOLD / 완료 / DROP).

## 1. 진단 — 현재 UI/UX 부족점

### 1-1. [버그] 구매사 보드 드래그가 조용한 no-op

`KanbanBoard.handleDragEnd`는 lifecycle 드롭을 전부 `setPendingAction`으로 넘기지만,
`KanbanActionDialog`는 `navigate-*` 액션에 `null`을 반환한다 (주석: "navigate-* 는
다이얼로그 없이 즉시 라우팅하므로 여기 도달 안 함" — 호출측이 라우팅해야 하는데
KanbanBoard가 안 함). 결과: **진행중→선정 완료 드래그가 아무 반응 없음.**

### 1-2. 정보 격차 (표 뷰 vs 보드 뷰)

| 항목 | 표 | 칸반 카드 |
|---|---|---|
| '재요청' warning 칩 (PG, 액션 필요 신호) | 있음 (`InboxList.tsx:107`) | **없음** — `PgKanbanCard`에 필드 자체가 없음 |
| 구매사명 (PG — 누가 보낸 요청인지) | — | **없음** (오픈 게시판은 구매사명 노출하는데 초대 인박스 카드엔 없음) |
| 취소된 RFP 구분 (구매사) | status 칩 | **없음** — '마감' 컬럼에 구분 없이 섞임 |
| 결과 카드 D-day 노이즈 | — | PG는 `hideDday=isResult` 처리됨, **구매사는 미처리** (awarded/closed 카드에 D-day 칩 계속 노출) |

### 1-3. 드래그 인터랙션

- 무효 드롭이 **드롭 후 토스트로만** 통지 — 드래그 중 유효/무효 컬럼 시각 구분 없음
  (`isOver` 하이라이트가 무효 타겟에도 켜짐).
- `DragOverlay` 미사용 — 드래그 카드가 보드 z-order에 묻힘, 드롭 애니메이션 없음.
- 보드 컨테이너 `snap-x snap-mandatory`가 dnd-kit 자동 가로 스크롤과 충돌해 드래그가 튐.
- `DraggableCard` 래퍼 div에 dnd-kit attributes(role/tabIndex) + 내부 `<button>`
  → 중첩 버튼 시맨틱 · 카드당 탭스톱 2개. `touchAction:'none'`이 래퍼에 있어
  모바일에서 카드 위 세로 스크롤 차단.

### 1-4. 보드 구조

- 종결 컬럼(마감/미선정)이 **무한 누적** — 참고 이미지의 "완료로 표시된 업무 보기"
  같은 제한이 없어 시간이 지나면 보드가 죽은 카드에 지배됨.
- 보드 뷰에서 status 필터 칩이 **컬럼과 중복** — 선택하면 빈 컬럼들만 남음.

## 2. 컬럼 추가 여부 — 제안과 결정

### 제안했던 안: 구매사 '선정 대기' 컬럼 (4컬럼화)

현재 '진행중'에는 견적 수집 중인 RFP와 마감이 지나 선정만 남은 RFP가 섞여 있어
구매사의 핵심 액션(비교·선정) 신호가 묻힌다. `sent && deadline 경과 → 선정 대기`로
파생 분류하면 PG 보드(4컬럼)와 대칭이 되고 DDL 변경 없이 컬럼 1행 INSERT 백필로 가능.

### 결정: **현행 유지** (2026-06-12 사용자 확정)

- '선정 대기' 컬럼 추가 반려 — 컬럼·카드 모두 그대로. SCREEN_DESIGN 확정 결정
  (구매사 3컬럼 / PG 4컬럼) 불변.
- 참고 이미지의 HOLD/DROP식 **자유(커스텀) 컬럼도 도입하지 않음** — 이 보드는 상태
  파이프라인(카드 = 진행 중 거래 문서)이라 임의 컬럼은 상태와 보드의 어긋남을 만듦.
  placement/lifecycle 이원화 복잡성 때문에 이미 꺼둔 `CUSTOM_COLUMNS_ENABLED=false` 유지.
- 따라서 **DDL/백필/시드 변경 전혀 없음.** 순수 UI + 카드 페이로드 + repo 조회 확장만.

## 3. 확정 범위

버그 수정(무조건) + 카드 정보 보강 + 드래그 인터랙션 + 보드 구조 정리 (사용자 선택, 전부).

## 4. 작업 방식

- worktree 브랜치 `fix/kanban-board-ux` (EnterWorktree; origin/main 분기 시 `git reset --hard dev` 먼저).
- **TDD 필수**: 각 항목 RED → GREEN. 단일 파일 `pnpm test <path>`로 확인.
- node 20 필요: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test`.
  worktree는 `ln -s <main>/node_modules node_modules`.

## 5. 구현 계획

### W0. 드래그 navigate no-op 버그 수정

- `components/board/KanbanBoard.tsx` `handleDragEnd`의 `case 'lifecycle'`:
  `navigate-rfp-detail` → `router.push('/rfp/<rfpId>')`, `navigate-inbox` →
  `router.push('/inbox/<rfpId>')`, 그 외(cancel-rfp/withdraw-bid)만 `setPendingAction`.
  `KanbanActionDialog`는 안전망으로 불변.
- 테스트: `components/board/__tests__/KanbanBoard.test.tsx` — navigate 드롭 시
  `router.push` 호출 (기존 mock에 `push: vi.fn()` 있음).

### W1. 카드 정보 보강

Repo 계층 (테스트 먼저, PGlite 패턴):
- `lib/server/repositories/types.ts`: `InvitationRepo.findByPgWorkspace` 반환에
  `buyerName: string` 추가 (구조분해 호출이라 비파괴).
  `RfpRequoteRequestRepo.findPendingByPgWs(pgWsId)` bulk 메서드 신설 —
  `inbox/page.tsx:87` 주석이 이미 예고한 메서드.
- `lib/server/repositories/drizzle/invitation.ts`:
  `innerJoin(workspaces, eq(rfps.buyerWsId, workspaces.id))` + `buyerName` select
  (선례: `rfp-pg-request.ts:109`). 메모리 구현 동기화.
- `lib/server/repositories/drizzle/rfp-requote-request.ts`: `pgWsId AND status='pending'` 단일 쿼리.

도메인/로더:
- `lib/server/pg-kanban.ts`: `PgKanbanCard`에 `buyerName?: string; hasPendingRequote: boolean`,
  `toPgCard` 인자 확장(기본 false).
- `lib/server/board/loadBoard.ts` pg 분기: `findPendingByPgWs`로 `Set<rfpId>` 구성해 전달.
- `app/(app)/inbox/page.tsx`: 기존 N+1(`findPendingByPair` Promise.all, 86–94행)을 bulk로 교체.
- `lib/server/buyer-kanban.ts`: `BuyerKanbanCard`에 `isCancelled: boolean` (`isSample` 선례).

UI (`components/board/PipelineCard.tsx`):
- `PgBody`: 구매사명 행 + `hasPendingRequote && <Chip label="재요청" color="warning" />`
  (InboxList와 동일 어휘·색).
- `BuyerBody`: `hideDday={stage==='awarded'||stage==='closed'}` (PgBody 패턴 재사용) +
  `isCancelled && <Chip label="취소됨" color="error" />` (Chip 색 규칙: 실패/오류→error).

테스트: `pg-kanban.test.ts`, `buyer-kanban.test.ts`, repo 테스트 2건,
`loadBoard.test.ts`(pg payload), `PipelineCard.test.tsx`(구매사명·재요청·취소됨·D-day 부재).
함정: `loadDashboard.ts`도 `findByPgWorkspace` 사용 — 구조분해라 무영향이나 타입 확장 시 확인.

### W2. 드래그 인터랙션

전부 `components/board/KanbanBoard.tsx` 중심. dnd-kit 6.3.1 기능만(신규 의존성 없음).

- (a) 유효/무효 타겟 시각화: 신규 순수 헬퍼 `components/board/computeValidDropTargets.ts`
  — `(activeCard, columns, cardType) → Set<columnId>` (`resolveBoardDrop` 재사용).
  `onDragStart`에서 `activeCard` state, `ColumnView`에 `dropState: 'idle'|'valid'|'invalid'`
  prop — invalid는 `opacity-40` dim, `isOver` 강조는 valid일 때만 (모션 규칙: opacity/color만).
- (b) snap 완화: 평시 `snap-x snap-proximity`, 드래그 중(`activeCard != null`) snap 제거.
- (c) DragOverlay: `<DragOverlay>{activeCard && renderCard(activeCard)}</DragOverlay>`.
  원본 카드는 transform 제거, `isDragging`이면 placeholder(opacity 감소)로 자리 유지.
- (d) 접근성/터치: drag activator를 카드의 실제 버튼으로 통합 — context로
  `{ attributes, listeners, setActivatorNodeRef }` 전달, 래퍼 div는 `setNodeRef`만
  (role/tabIndex 제거), `PipelineCard`의 `<button>`이 listeners + `aria-roledescription` +
  `touchAction:'none'` 보유. `BidCard`(rfp_bids 보드)도 동일 context 소비.
  PointerSensor `distance: 4`로 클릭/드래그 공존 안전, KeyboardSensor 키보드 DnD 유지.

테스트: `computeValidDropTargets.test.ts`(신규, 핵심 로직 TDD),
`KanbanBoard.test.tsx`(카드당 button role 1개·래퍼에 role 없음).
드래그 시각 동작은 수동 브라우저 확인 보완. `PipelineBoard.test.tsx`는 KanbanBoard mock — 무영향.

### W3. 보드 구조 정리

- 종결 컬럼 누적 제어: `KanbanBoard`에 optional prop
  `columnOverflow?: (column) => { limit: number; moreHref: string } | null`.
  초과분 클라이언트 슬라이스(loadBoard가 전체 로드라 서버 제한은 과설계),
  컬럼 푸터에 `<Link>전체 N건 보기</Link>`. `PipelineBoard`에서 주입(limit 10):
  buyer `closed`→`/rfp?view=table&status=closed`, `awarded`→`/rfp?view=table&status=awarded`;
  pg `won`/`lost`→`/inbox?view=table&status=closed` (status-filter의 won+lost→closed 폴드 재사용).
  `resolveBoardView`가 `?view=table` 우선이라 딥링크 동작 확인됨.
- status 필터 칩 숨김: `BoardFilterBar`에 `hideStatus?: boolean` — true면 status ChipGroup
  미렌더(마감일·등급 유지). 두 페이지에서 `hideStatus={view === 'board'}`
  (`app/(app)/rfp/page.tsx:119`, `app/(app)/inbox/page.tsx:139`).
  잔류 파라미터 함정: 보드 전환 시 `?status=`가 남으면 칩은 숨고 필터만 적용됨 →
  `BoardViewToggle`에서 board 전환 시 status param 삭제.

테스트: `KanbanBoard.test.tsx`(11장 → 10장 + "전체 11건 보기" href),
`PipelineBoard.test.tsx`(overflow 매핑), `BoardFilterBar.test.tsx`(hideStatus),
`BoardViewToggle.test.tsx`(board 전환 시 status 제거).

### 문서 갱신

- `SCREEN_DESIGN.md` §0.3a 칸반 블록: 컬럼 구성 불변 — 종결 컬럼 10건 제한 + 표 딥링크,
  보드 뷰 status 칩 숨김 한 줄 추가.
- 드라이브바이: `lib/server/buyer-kanban.ts:1` 주석 "4개 컬럼" → 실제 3개 (stale).

## 6. Verification

1. TDD 중: 단일 파일 `pnpm test <path>` (node20 PATH prefix).
2. 전체: `pnpm test` + `pnpm tsc --noEmit` + `pnpm lint`.
   알려진 무관 잡음: BidForm draft flake(재실행), wizard test globals typecheck red(grep 필터),
   dev의 PG-landing test 1건.
3. 수동 확인(드래그 시각): `.env` 복사 + test DB 5433으로 dev 서버,
   PG `ws-toss-admin@example.com` 로그인 → /inbox 칸반에서 dim/하이라이트·DragOverlay·재요청 칩,
   /rfp 칸반 드래그 navigate 동작.
4. PR은 `/ship` 스킬로 생성 (base: dev).
