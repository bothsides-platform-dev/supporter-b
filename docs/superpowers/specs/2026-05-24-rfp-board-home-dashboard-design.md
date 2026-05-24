# RFP 보드 승격 + 홈 대시보드 + 사이드바 정리 — 설계 (2026-05-24)

## 목적

워크스페이스의 주 작업면을 **RFP/받은RFP 보드**로 승격한다. 보드에 **칸반↔표 토글 + 인페이지 필터 바**를 붙이고, 그 결과 (1) 칸반이 빠져 비게 된 **홈을 2단 대시보드(액션큐+KPI / 채팅 패널)** 로 재설계하며, (2) 필터가 인페이지로 들어가 중복된 **사이드바 상태 하위항목을 제거**한다.

세 가지 요청(홈 비우기 · RFP 토글/필터 · 사이드바 정리)은 사실상 하나의 재설계다. 칸반은 현재 `/home`에 살고 있어, 보드를 RFP로 옮기면 홈이 비고, 필터를 인페이지로 옮기면 사이드바 상태항목이 중복되기 때문이다.

> **선행 문서와의 관계**: 본 설계는 [`2026-05-24-linear-sidebar-main-redesign-design.md`](./2026-05-24-linear-sidebar-main-redesign-design.md)의 일부를 **갱신**한다. 그 문서가 사이드바에 도입한 *상태 하위항목*은 본 설계에서 인페이지 필터 바로 이동하며, *홈=보드* 전제는 *홈=대시보드*로 바뀐다. `status` searchParam 필터 자체와 `STATUS_LABELS` 매핑은 그대로 재사용한다.

## 범위

**대상**
- 홈 `/home` (buyer·PG): 칸반 보드 → 2단 대시보드
- RFP `/rfp` (buyer) · 받은RFP `/inbox` (PG): 표 단독 → 칸반↔표 토글 + 필터 바
- 사이드바: `getNavConfig`의 상태 하위항목 제거
- 신규 서버 집계: 대시보드 KPI/액션큐, 보드 필터 (모두 순수 함수)

**제외 (YAGNI)**
- 채팅 **기능/백엔드** — 홈 우측에 placeholder 패널만 둔다(레이아웃 자리 확보). Buyer↔PG 메시징(→ 추후 팀채팅) 연결 지점만 마련.
- 인페이지 **텍스트 검색** 필터 — 제목·번호 검색은 헤더 `⌘K` 커맨드 팔레트가 담당.
- RFP/Inbox **상세** 페이지, 인증/가입 화면 변경 없음.
- 도메인 모델·15개 정책(PG_RFP_SPEC §3) 변경 없음.

## 양면 대칭

플랫폼은 양면(Buyer↔PG)이고 본 설계는 **완전 대칭**으로 적용한다.
- 보드 토글+필터: buyer `/rfp` ↔ PG `/inbox`
- 홈 대시보드: buyer ↔ PG 각각

🛡️ **도메인 가드** (PG_RFP_SPEC, CLAUDE.md):
- **완전 비공개** — 경쟁사 정보(`competitorCount`, 경쟁 PG 수/순위 등)는 어디에도 노출하지 않는다. PG 대시보드는 자기 워크스페이스 데이터만.
- **결재선 없음 (v0)** — 승인 대기열·결재 위젯을 대시보드에 넣지 않는다.

---

## 1. 홈 대시보드 (2단)

**레이아웃**: `lg+` → 좌 `flex-1` 대시보드 / 우 고정폭(~360px) 채팅 레일. `md` 이하 → 채팅 레일을 대시보드 하단으로 스택. Linear 하드룰 준수(저대비 테두리, 라인 SVG 빈상태, 스피너 금지).

### 좌측 — KPI 스트립(클릭형) + "지금 처리할 일"

집계는 서버 순수 함수가 담당하고, 데이터는 다음에서만 파생한다(추가 경쟁 데이터 없음).

**Buyer** — 소스: RFP rows + RFP별 응답(bid) 수.

| KPI 타일 | 정의 | 클릭 딥링크 |
|---|---|---|
| 진행중 | `status = sent` | `/rfp?status=active` |
| 마감 임박 | `status = sent` 且 `deadline ≤ today+7d` | `/rfp?status=active&deadline=d7` |
| 응답 검토대기 | `status = sent` 且 `bidCount ≥ 1` | `/rfp?status=active` |
| 계약완료 | `status = awarded` | `/rfp?status=awarded` |

액션큐 "지금 처리할 일" (행 클릭 → `/rfp/[code]`):
1. **마감 임박** — `sent` 且 `deadline ≤ D-7`. `deadline` 오름차순. `D-n` 뱃지.
2. **응답 도착·검토대기** — `sent` 且 `bidCount ≥ 1`. "응답 n건".
3. **무응답 경과** — `sent` 且 `bidCount = 0` 且 `sentAt ≤ today-3d`. "응답 0건 · 발송 n일". (`3일`은 시작값 — 튜닝 가능한 상수로 둔다.)

> **bidCount는 선행 인프라**: KPI "응답 검토대기"와 액션큐 ②③이 RFP별 응답 수에 의존한다. §4에서 응답 수 집계 쿼리를 신설한다(아래 데이터 흐름 참조). "추후 결정"이 아니라 본 작업의 전제다.

**PG** — 소스: inbox rows(`invitationStatus`·`rfpStatus`·`deadline` 보유, 기존 `/inbox` 로더 재사용).

| KPI 타일 | 정의 |
|---|---|
| 신규 | `invitationStatus = sent` (미열람) |
| 마감 임박 | 미제출(`sent`/`opened`) 且 `deadline ≤ D-7` |
| 작성중 | `invitationStatus = opened` (미제출) |
| 제출완료 | `invitationStatus = accepted` |

액션큐 (행 클릭 → `/inbox/[id]`):
1. **신규 받은 RFP** — `invitationStatus = sent`.
2. **응답 마감 임박** — 미제출 且 `deadline ≤ D-7`.
3. **작성중 응답** — `invitationStatus = opened`.

각 액션큐 항목이 0건이면 해당 그룹은 숨기고, 전부 0이면 `EmptyState`("지금 처리할 일이 없습니다").

### 우측 — 채팅 패널 placeholder

- **구조를 미리 보여주는 placeholder**(단순 빈 박스 아님): 헤더 "메시지" + **빈 대화 목록** + 비활성 "새 메시지" CTA. 플랫폼이 RFP별 비공개 1:N이므로 채팅의 최종 형태는 **RFP별 스레드 목록**(이 구매사 ↔ 각 PG, RFP 단위)일 가능성이 높고, 이 placeholder가 그 구조를 미리 텔레그래프한다.
- 백엔드·스토어·이벤트 없음(렌더 전용). 추후 Buyer↔PG 메시징(→ 팀채팅 확장) 연결 지점.
- 기존 `ChannelTalk`(우하단 고객지원 위젯)과는 별개 — 위치 충돌 없음(채팅 레일은 본문 영역 내부).

---

## 2. RFP/받은RFP 보드 (대칭)

구조: `PageHeader → FilterBar → ViewToggle(표/칸반) → 본문(표 | 칸반)`

### 단일 필터 소스 + 두 뷰

- 서버는 **rows**(buyer: RFP rows / PG: inbox rows; `status`·`deadline`·`grade` 보유)와 **board**(`loadBoard` columns+cards)를 로드한다.
- 필터 predicate는 **rows**에 적용해 `visibleIds: Set<string>`를 만든다(단일 필터 소스).
- **표 뷰**: 필터된 rows를 그대로 렌더(`RfpListTable`/`InboxList` 재사용).
- **칸반 뷰**: 칼럼은 그대로 두고 `visibleIds`에 없는 카드만 숨긴다 — **뷰 전용 필터**. 칼럼·DnD·`board_column_id` 데이터는 건드리지 않는다(통합 칸반 cutover 모델 유지: 칼럼은 워크스페이스당 하나).

### 토글 (`?view=`)

- `?view=table|board` 가 source of truth. 부재 시 **per-page 쿠키**(`rfpBoardView` / `inboxBoardView` — 페이지별 독립 선호), 그것도 없으면 `'table'`.
- 토글 시 client가 URL `?view=`를 갱신하고 해당 페이지 쿠키를 기록(UI 선호, 도메인 아님). 서버는 `?view ?? cookie ?? 'table'`로 SSR(첫 페인트 깜빡임 없음).
- `resolveBoardView(paramView, cookieView)` 순수 함수로 분리.

### 필터 바 (`URL searchParam`)

| 필터 | 파라미터 | 값 | 비고 |
|---|---|---|---|
| 상태 | `?status=` | buyer: `draft/active/closed/awarded`, PG: `new/draft/submitted/closed` | **기존 토큰맵 재사용** → 하위호환 ✅ (`/rfp?status=active` 그대로 동작) |
| 마감일 | `?deadline=` | `d7`(임박) / `month`(이번달) / `overdue`(지난마감) / 부재(전체) | `matchesDeadlineBucket(deadline, bucket, now)` |
| 가맹점 등급 | `?grade=` | `영세/중소1/중소2/중소3/일반` | 소스 `rfp.bizProfile?.grade`. 상태·마감일과 **동격**(사용자 명시 선택). 빈 `bizProfile`은 등급 필터 적용 시 제외 |

- 필터는 누적(AND). "전체" = 해당 파라미터 부재.
- 필터 바 UI: 칩/세그먼트 토글(상태·마감일) + 드롭다운(등급). Linear 하드룰(대괄호 plain text 금지, 칩 색 매핑) 준수.

---

## 3. 사이드바 / 내비

- `lib/nav/nav-config.ts`: `workspaceSection`의 `statuses` 제거 → RFP/받은RFP는 단일 링크. `top`(홈·알림)·설정 섹션·`getChordMap` 유지.
- `STATUS_LABELS`는 필터 바·`status-filter.ts`가 계속 사용 → **유지**.
- `getBreadcrumbSegments`: 홈이 유지되므로(대시보드) 경로 기반 로직 변경 불필요. `/rfp?status=` 브레드크럼은 무해하게 유지.
- 최종 사이드바: 홈 · 알림 / RFP(또는 받은RFP) / 설정(프로필·멤버).

---

## 4. 영향 파일 (개략)

| 파일 | 변경 |
|---|---|
| `app/(app)/home/page.tsx` | 칸반 → 대시보드 조립. buyer/PG 분기 유지 |
| `components/home/BuyerHome.tsx`·`PgHome.tsx` | 대시보드로 재작성 |
| `components/home/HomeDashboard.tsx` | **신규** — 2단 레이아웃(좌 대시보드 / 우 채팅 레일) |
| `components/home/KpiStrip.tsx`·`ActionQueue.tsx`·`ChatPanelPlaceholder.tsx` | **신규** |
| `lib/server/dashboard/loadDashboard.ts` | **신규** — `buildBuyerDashboard`·`buildPgDashboard` (순수 집계) |
| `lib/server/repositories/*` (bid/rfp repo) | **신규 메서드** — RFP별 응답 수 집계(`findByBuyerWsWithBidCount(wsId): {rfp, bidCount}[]` 권장 — 1쿼리). buyer KPI·액션큐의 선행 인프라 |
| `app/(app)/rfp/page.tsx`·`app/(app)/inbox/page.tsx` | rows+board 로드, FilterBar+ViewToggle 통합 |
| `components/rfp/RfpFilterBar.tsx` (+ PG용 재사용/변형) | **신규** |
| `components/board/BoardViewToggle.tsx` | **신규** — 표/칸반 세그먼트 토글(`BidViewToggle` 패턴 참고, 대괄호 없이) |
| `lib/server/board/filterRows.ts` | **신규** — `matchesStatus`·`matchesDeadlineBucket`·`matchesGrade`·`filterRfpRows`·`resolveBoardView` (순수) |
| `components/board/KanbanBoard.tsx`/`PipelineBoard.tsx` | `visibleIds` prop 추가(미포함 카드 숨김) |
| `lib/nav/nav-config.ts` | `statuses` 제거 |

## 5. TDD 슬라이스 (failing test 먼저)

순수 함수부터 RED → GREEN (CLAUDE.md "TDD — Hard Rules"):
1. `matchesDeadlineBucket(deadline, bucket, now)` — d7/month/overdue/전체 경계값.
2. `matchesStatus`·`matchesGrade`·`filterRfpRows` — AND 누적, 빈 bizProfile 처리.
3. `resolveBoardView(paramView, cookieView)` — param > cookie > 'table'.
4. `buildBuyerDashboard(rows, bidCounts, now)` / `buildPgDashboard(inboxRows, now)` — KPI 카운트 + 액션큐 항목 분류(경계: D-7, 무응답 3일, 0건 그룹 숨김).
5. 컴포넌트: `RfpFilterBar`(URL 갱신), `BoardViewToggle`(URL+쿠키), `KanbanBoard`(visibleIds 숨김), `ActionQueue`/`KpiStrip` 렌더, `ChatPanelPlaceholder` 빈 대화목록.
6. **DnD × 필터 회귀 테스트** — 칼럼 중간 카드가 필터로 숨겨진 상태에서 보이는 두 이웃 사이로 드롭 시, 숨은 카드 포함 전체 `board_column_id` 순서가 보존되는지(`resolveBoardDrop.ts`). 필터-중-드래그가 순서를 조용히 망가뜨리지 않도록 명시 검증.

면제: `app/**/page.tsx` 단순 조립부는 내부 client/server 단위로 테스트.

## 6. 열린 항목 (구현 중 확정)

- **bidCount 집계 쿼리 형태**: `findByBuyerWsWithBidCount` 단일 쿼리(LEFT JOIN + count) vs 별도 `countByRfp(ids[])` — repo 코드 확인 후 확정. *집계 자체는 범위 확정*(선행 인프라).
- **마감일 버킷 라벨/카피**: 임박=D-7 확정, `month`/`overdue` 표기 문구.
