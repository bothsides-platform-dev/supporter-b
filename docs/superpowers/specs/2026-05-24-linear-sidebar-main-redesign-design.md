# Linear식 사이드바 + 메인 리뉴얼 — 설계 (2026-05-24)

## 목적

앱 셸의 (1) 사이드바 정보구조(IA)와 (2) 목록 페이지 메인 패턴을 Linear의 **구조 패턴**(그룹 섹션 · 섹션 헤더 · 접기/펴기 · 상태 하위 항목 · 가벼운 breadcrumb)으로 전환한다. 색·폰트·테두리는 이미 Linear(`tokens.css`)이므로 본 작업은 **구조/IA만** 다룬다.

## 범위

**대상**
- 사이드바: 단일 레일 + 섹션 구조 (별도 `Subnav` 패널 흡수)
- 메인: 목록 페이지(`/rfp`, `/inbox`, `/notifications`)의 breadcrumb + 콘텐츠 헤더 + 빈 상태 패턴
- 알림 전용 페이지 신설
- 상태 필터링(searchParam) 도입

**제외 (YAGNI)**
- 홈 대시보드 레이아웃, RFP/Inbox **상세** 페이지, 인증/가입 화면
- 브라우저식 탭 스트립 (검토 후 제외 결정)
- 헤더의 필터·정렬 컨트롤 (별도 기능 — 본 작업서 미구현)
- 도메인 모델·15개 정책(PG_RFP_SPEC §3) 변경 없음 — 순수 셸/IA

## 사이드바 (Full Linear · 단일 레일)

`components/shell/Sidebar.tsx` 재작성. 데스크톱 레일과 모바일 `Sheet` 드로어가 동일 `SidebarBody`를 공유하는 현 구조 유지.

- **상단**: 워크스페이스 스위처 + 검색 아이콘(🔍, `⌘K` 유지) + 작성 아이콘(✎ → `/rfp/new`, **buyer 전용**).
- **그룹 없는 상단 항목**: `홈`, `알림`(미읽음 배지 = 기존 `useNotifications().unreadCount`).
- **섹션 (헤더 클릭 시 접기/펴기, 상태는 persist)**:
  - buyer — **RFP**: 작성중·진행중·마감·계약완료 (각 `/rfp?status=draft|active|closed|awarded`)
  - PG — **받은 RFP**: 신규·작성중·제출완료·마감 (각 `/inbox?status=new|draft|submitted|closed`)
  - 공통 — **설정**: 프로필·멤버·알림 설정 (`/settings/*`)
- **푸터**: 테마 토글 + 아바타 메뉴(설정/로그아웃). **기존 종 아이콘 제거** (알림이 상단 항목으로 승격).
- **활성 표시**: `pathname` + `useSearchParams()` 조합. 예) `/rfp?status=active` 항목은 `pathname==='/rfp' && searchParams.get('status')==='active'` 일 때 활성. 상태 미지정 bare `/rfp`는 어떤 상태 항목도 활성 아님(전체 목록).
- **섹션 접힘 상태**: UI 전용이므로 zustand `persist`(localStorage) 슬라이스로 보관. 도메인 데이터 아님.

## 메인 (목록 페이지 패턴)

- **Breadcrumb 컴포넌트(신규)**: `‹ ›` 히스토리(`router.back()/forward()`) + 경로 라벨("RFP / 진행중"). 탭 스트립 없음.
- **콘텐츠 헤더(신규 경량 컴포넌트)**: 제목 + 건수 칩(목록 길이에서 산출) + 주요 액션 버튼(buyer 목록은 "새 RFP"). 상태 탭이 사이드바로 갔으므로 인페이지 상태 탭 없음.
- **빈 상태**: 기존 `EmptyState` 프리미티브 재사용 (라인 SVG · 일러스트/스피너 금지 하드룰 준수).

## 라우팅 / 상태

- **상태 필터 = searchParam**: `/rfp?status=…`, `/inbox?status=…`. `/rfp/[id]` 동적 세그먼트와 충돌 회피 + URL 기반이라 deep-link·공유 가능.
- 목록 로더가 `status`로 서버 쿼리 필터링(현재 무필터 전체 → 필터 추가). bare 목록은 전체.
- **알림 페이지**: `/notifications` (현재 비어 있는 경로). 기존 `app/(app)/settings/notifications/NotificationActivityList.tsx` 재사용. `/settings/notifications`는 알림 *설정*만 유지.

## 영향 파일 (개략)

| 파일 | 변경 |
|---|---|
| `components/shell/Sidebar.tsx` | 섹션/접기/항목/검색아이콘/작성아이콘/푸터/활성상태 — 대폭 |
| `components/shell/AppShell.tsx` | 소폭 (Subnav 흡수에 따른 레이아웃 정리) |
| `components/shell/Subnav.tsx` | **제거** |
| `app/(app)/settings/layout.tsx` | `Subnav` 제거 (설정 내비는 사이드바 섹션으로) |
| `app/(app)/notifications/page.tsx` | **신규** — `NotificationActivityList` 재사용 |
| `app/(app)/rfp/page.tsx` + 로더, `components/rfp/RfpListTable.tsx` | `status` searchParam 필터 + breadcrumb/헤더 |
| `app/(app)/inbox/page.tsx` + 로더, `components/inbox/InboxList.tsx` | `status` searchParam 필터 + breadcrumb/헤더 |
| `components/shell/Breadcrumb.tsx`, `components/shell/PageHeader.tsx` | **신규** |
| `lib/stores/ui.ts` (또는 신규 persist 슬라이스) | 섹션 접힘 상태 |

## TDD (프로젝트 하드룰)

모든 프로덕션 코드는 **failing test 우선** (RED → GREEN → REFACTOR). 단위 테스트 대상:
- 사이드바 활성-상태 로직(pathname + searchParam 조합), 워크스페이스 타입별 항목 렌더(buyer vs pg), 작성 아이콘 buyer 전용 노출
- 섹션 접기 토글 + persist
- Breadcrumb 라벨 산출 / 히스토리 버튼
- 상태 필터: 로더가 `status`로 거른 목록만 반환
- `/notifications` 페이지가 활동 리스트 렌더

면제: 순수 셸 조립(`page.tsx`/`layout.tsx`)이 단순 컴포넌트 배치일 때 — 내부 client/server 단위로 테스트.

## 미해결/추후

- **사이드바 상태별 건수 배지**: 설계 목업엔 있었음. 저렴한 count-by-status 경로가 있으면 `(app)/layout`에서 집계해 Sidebar로 전달, 비용이 크면 v0 보류(알림 미읽음 배지는 유지). 구현 중 판단.
