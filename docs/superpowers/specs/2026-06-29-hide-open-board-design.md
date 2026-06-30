# 오픈게시판 임시 숨김 (kill switch) — 설계

- 날짜: 2026-06-29
- 상태: 설계 확정 (구현 대기)
- 범위: 프론트엔드 UI-only. 서버 액션·데이터·DB 스키마 불변.

## 배경 / 목표

PG가 사용하는 **오픈게시판**(open RFP discovery board)을 **잠시** 프론트에서 숨긴다. "잠시"가 핵심 — 데이터를 지우거나 코드를 들어내지 않고, 나중에 한 곳만 바꿔 즉시 되살릴 수 있어야 한다.

오픈게시판은 비초대 PG가 공개된 견적 요청을 발견하고 콜드피치(`rfp_pg_requests`)를 보내는 PG-facing 발견 surface다. 현재 7곳에 노출된다.

## 확정 결정 (브레인스토밍)

1. **되살리는 방식** — 단일 플래그 상수(SSOT). `true`로 바꾸고 배포하면 끝. 코드는 그대로 남는다.
2. **범위** — PG 발견 surface + 구매사 쪽 컨트롤(작성 위저드 노출 체크박스 + RFP 상세 노출 상태 칩)까지 모두 숨긴다. 비활성 기간에 만든 RFP의 `boardVisible`은 기본값(`true`)을 유지하므로, 다시 켜면 그 기간의 견적도 자연스럽게 노출된다.
3. **서버 차단** — 하지 않는다(UI-only). 서버 액션·쿼리는 그대로 동작하되 UI에서 도달 불가.
4. **`/opportunities` 라우트** — 직접 URL·북마크 진입 시 보드 대신 "준비중" 화면을 보여준다(redirect 아님).

## 아키텍처

### 1. 단일 플래그 (SSOT)

새 모듈 `lib/features/open-board.ts`:

```ts
/**
 * 오픈게시판(PG 발견 보드) 임시 kill switch.
 * 다시 켜려면 이 값만 `true` 로 바꿔 배포하세요 — 다른 파일은 손대지 않습니다.
 * UI-only 차단이라 서버 액션·데이터는 그대로 → 켜는 즉시 그동안 만든 RFP 도 노출됩니다.
 */
export const OPEN_BOARD_ENABLED: boolean = false;
```

`: boolean` 명시는 의도적이다. 타입을 `false` 리터럴로 좁히면 `if (OPEN_BOARD_ENABLED)`의 truthy 분기가 dead-code로 간주되어 ESLint(`no-unnecessary-condition` 등)에 걸린다. `boolean`으로 넓혀 분기를 살린다.

### 2. 가릴 화면 (플래그 off → 숨김 / on → 현행 그대로)

| # | 화면 | 파일 | 처리 |
|---|------|------|------|
| 1 | 사이드바 링크 + `g→o` 단축키 + 팔레트 nav 항목 | `lib/nav/nav-config.ts` | `getNavConfig`에서 off면 `INBOX_SECTION`의 `opportunities` 링크 제거. `getNavConfig`를 소비하는 `getNavCommands`(팔레트 nav)·`getChordMap`(단축키)도 자동으로 사라짐 — **한 곳 수정으로 3개 surface 동시 차단** |
| 2 | PG 홈 "참여 가능한 견적" 탐색 섹션 | `components/home/HomeDashboard.tsx` | 섹션 렌더 조건(`workspaceType === 'pg' && dashboard.openRfps != null && length > 0`)에 `&& OPEN_BOARD_ENABLED` 추가 |
| 3 | `/opportunities` 라우트 | `app/(app)/opportunities/page.tsx` | off면 `OpportunitiesLoader`(Suspense) 대신 "준비중" EmptyState 렌더. `requirePgPage` 가드는 유지 |
| 4 | 커맨드팔레트 "참여 가능한 견적" 그룹 | `components/shell/CommandPalette.tsx` | off면 해당 그룹을 groups 배열에서 제외 (cmdk `shouldFilter={false}`라 빈 헤딩이 남지 않도록 배열에서 빼는 방식) |
| 5 | 작성 위저드 "오픈 게시판에 노출하기" 체크박스 | `components/rfp/RfpStep4Review.tsx` | 블록(현 line 135–152)을 `{OPEN_BOARD_ENABLED && (…)}` 로 감쌈. `boardVisible` 드래프트 기본값(true)은 유지 → 데이터 무영향 |
| 6 | RFP 상세 노출 상태 칩 | `components/rfp/RfpBoardVisibilityStatus.tsx` | 컴포넌트 맨 위 `if (!OPEN_BOARD_ENABLED) return null;` → 전체화면(`rfp/[id]`)·모달(`rfp/@modal/(.)[id]`) 두 호출처를 한 점에서 커버 |

**준비중 화면 문구(③, 잠정):** 제목 "참여 가능한 견적을 잠시 닫았어요", 설명 "곧 다시 열릴 예정이에요." (Linear 라인 SVG EmptyState 패턴 재사용, `InboxIcon`)

### 3. 일부러 그대로 두는 것 (UI-only 범위)

- **서버 액션·쿼리** — `createPgRequestAction`(콜드피치), `searchEntitiesAction`(오픈보드 검색), `findOpenRfpsForPg`(repo): 그대로 동작, UI에서만 도달 불가.
- **`components/rfp/RfpPendingRequests.tsx`** (구매사 콜드피치 수신함) — **남겨둠**. 숨기기 직전 들어온 진행 중 요청을 구매사가 수락/거절할 수 있어야 하므로. 비어 있으면 이미 `null` 반환.
- **데이터** — `board_visible` 컬럼·기본값·오픈보드 projection 화이트리스트(`rfp-pg-request.ts`) 전부 불변.
- **breadcrumb** `/opportunities` 라벨(`nav-config.ts` 현 line 277) — 준비중 화면용으로 무해하니 유지.

### 4. 드리프트 가드

`lib/features/__tests__/open-board-flag.test.ts` — 위 6개 surface 소스 파일을 읽어 각각 `OPEN_BOARD_ENABLED` 참조가 살아있는지 검증. 향후 누군가 surface를 리팩터하거나 새 surface를 추가하며 게이트를 빠뜨리면 테스트가 빨갛게 뜬다. (기존 `proxy-matcher`·`pg-strip-coverage` 드리프트 가드 패턴 미러)

## TDD 계획 (surface별 RED → GREEN)

CLAUDE.md TDD 하드룰 적용. 각 surface는 조건 분기(상태/렌더 로직)를 추가하므로 시각 예외에 해당하지 않는다.

- 각 surface: **"off → 숨김" 실패 테스트 먼저** 작성 → RED 확인 → 최소 구현.
- **주의 — 기존 테스트는 보드가 켜진 상태를 가정**한다. 플래그를 `false`로 내리면 기존 테스트(예: 사이드바에 opportunities 항목 존재, 홈 탐색 섹션 렌더 등)가 깨진다. 대응:
  - on-분기는 플래그를 `true`로 모킹(`vi.resetModules()` + `vi.doMock('@/lib/features/open-board', () => ({ OPEN_BOARD_ENABLED: true }))` + 동적 `import()`)해 기존 커버를 보존.
  - off-분기(실제 출고 상태, 플래그 false)는 새 테스트로 검증.
- `nav-config`(순수 모듈)는 off/on 둘 다 `doMock` + 동적 import로 한 파일에서 검증 가능.
- `app/(app)/opportunities/page.tsx`는 async RSC라 직접 테스트가 번거롭다 → "준비중" 뷰를 작은 프레젠테이션 컴포넌트로 추출(가벼운 렌더 테스트)하고, 페이지 분기는 드리프트 가드로 커버.

검증 surface 목록:
1. `nav-config` — off → `getNavConfig`/`getNavCommands`/`getChordMap`에 opportunities 없음; on → 있음
2. `HomeDashboard` — off → openRfps 있어도 탐색 섹션 없음; on → 렌더
3. `/opportunities` 준비중 뷰 — off → 준비중 EmptyState
4. `CommandPalette` — off → "참여 가능한 견적" 그룹 없음
5. `RfpStep4Review` — off → 노출 체크박스 없음
6. `RfpBoardVisibilityStatus` — off → `null`
7. 드리프트 가드 테스트

## 다시 켜는 절차

1. `lib/features/open-board.ts`의 `OPEN_BOARD_ENABLED` → `true`
2. `pnpm test`
3. 배포

데이터 마이그레이션 없음. 비활성 기간에 만든 RFP도 `boardVisible` 기본값(true) 유지라 즉시 노출.

## 명시적 비대상

- SEO `llms.txt`/`product-facts`·랜딩 페이지(`PgLanding`)의 오픈게시판 언급은 건드리지 않음. (필요 시 후속)
- 서버 측 차단(direct API/URL 호출 방어) — 의도적 비대상. UI-only 결정.

## 리스크 / 함정

- **기존 테스트 회귀** — 위 TDD 계획대로 on-분기 모킹으로 커버 보존 필수. 빠뜨리면 무관한 테스트가 대거 빨개진다.
- **lint dead-code** — 플래그 타입 `: boolean` 명시 누락 시 `false` 리터럴 narrowing으로 분기가 죽은 코드 취급.
- **cmdk 빈 그룹** — 그룹을 단순히 빈 배열로 두면 헤딩만 남을 수 있음 → groups 배열에서 제외해야 함.
- **워크트리 LSP 거짓 진단** — fresh `pnpm tsc`와 `pnpm test`가 진실(프로젝트 관행).
