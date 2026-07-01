# PG 관리 'PG 워크스페이스 추가' — 드롭다운 → 인라인 칩 — 설계

- 날짜: 2026-06-30
- 상태: 설계 확정 (구현 대기)
- 범위: 프론트엔드 UI-only. 서버 액션·데이터 흐름·DB 스키마 불변.

## 배경 / 목표

구매사(buyer) 딜룸 **'PG 관리' 탭**(`RfpInviteManager`)에서 견적 요청에 PG를 추가하는 UI가 현재 **`Popover` + `cmdk` 드롭다운 검색**("PG사 검색…" 트리거 → 검색창 + 결과 목록)이다. 이를 **견적 작성 위저드 3단계(`RfpStep3PgSelect`)와 동일한 인라인 칩**으로 바꿔, 같은 "PG를 고른다" 행위가 두 화면에서 일관된 모양·조작을 갖도록 한다.

`RfpInviteManager`는 `components/deal-room/buyer/BuyerDealRoomBody.tsx`(line 127)에서 'PG 관리' 탭으로 렌더된다.

## 확정 결정 (브레인스토밍)

1. **선택 스타일** — 인라인 칩(위저드 `RfpStep3PgSelect`와 동일). `WorkspaceAvatar + 이름` 칩을 flex-wrap으로 나열. **검색창 없음**.
2. **추가 동작 = 즉시 추가** — 칩 클릭 → 기존 서버 액션(`addPgWorkspacesToRfpAction`) 그대로 호출. 위저드의 토글(draft 다중선택)과 달리, 여기선 클릭=추가 전용(토글-off 없음). 추가된 PG는 위 '초대 PG' 목록('대기중')으로 이동.
3. **이미 초대된 PG는 칩 풀에서 숨김** — 위 '초대 PG' 목록에 상태칩으로 이미 보이므로 칩 풀에는 **추가 가능한 PG만** 노출.
4. **`chosungCommandFilter` 제거(A)** — 검색이 사라지면 이 export와 전용 단위 테스트는 소비처 0의 죽은 코드 → 함수·테스트 둘 다 제거.
5. **'전체 추가' 버튼 미포함(B)** — 관리 화면에서 전체 초대는 드묾. 칩 개별 클릭만.

## 아키텍처

### 대상 파일 (단일)

`components/rfp/RfpInviteManager.tsx` — 선택 표면만 교체. props(`rfpId`, `invitations`, `canEdit`)·서버 액션·`초대 보내기` 버튼은 불변.

### 1. 제거

- `import * as Popover from '@radix-ui/react-popover'`
- `import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from 'cmdk'`
- `import { getChoseong } from 'es-hangul'`
- `chosungCommandFilter` 함수 (export 포함) — **결정 A**.
- `pgOpen` 상태 + `Popover.Root/Trigger/Portal/Content` + `Command*` 트리 전체.

> `@radix-ui/react-popover`·`cmdk`·`es-hangul`은 다른 곳(`CommandPalette` 등)에서 쓰이므로 **package.json 의존성은 유지**, 이 파일의 import만 제거한다.

### 2. 추가

- `import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar'`
- **마운트 시 eager-load**: 현재 `loadPg()`는 팝오버 열 때 lazy 호출인데 트리거가 없어지므로 `useEffect`로 마운트 시(=`canEdit` 분기) 호출. `useLazyPgWorkspaces`의 `loadedRef` 중복로드 가드와 `useCallback` 안정 참조 그대로 활용.
  ```tsx
  useEffect(() => { loadPg(); }, [loadPg]);
  ```
  (`canEdit && (...)` 블록 안에서만 렌더되므로 effect도 그 안쪽 서브컴포넌트/조건에 둔다. 비편집 RFP는 추가 영역 자체가 렌더되지 않아 fetch도 발생 안 함.)

### 3. 칩 렌더 (위저드 `RfpStep3PgSelect` 스타일 차용)

- 데이터: `available = pgList.filter((pg) => !invitations.some((i) => i.wsId === pg.id))` — 이미 초대된 PG 제외.
- 각 칩: `<button type="button" disabled={pending} onClick={() => handleSelect(pg)}>` + `WorkspaceAvatar(size="sm", aria-hidden)` + `pg.displayName`.
- 스타일: 위저드의 미선택 칩 클래스 재사용(`inline-flex items-center gap-1.5 py-[5px] pl-[5px] pr-3 rounded-[6px] text-[13px] border border-[var(--md-sys-color-outline-variant)]`). 여기 칩은 "추가 버튼"이라 selected 상태(primary 채움)는 쓰지 않는다.
- 컨테이너: `flex flex-wrap gap-[6px]`.

### 4. 상태 처리

| 상태 | 조건 | 표시 |
|---|---|---|
| 로딩 | `pgLoading && pgList.length === 0` | 펄스 스켈레톤 칩(또는 "불러오는 중…") — DESIGN.md 로딩 모션 허용 |
| 에러 | `pgError` | 에러 문구(기존 `font-mono ... error` 스타일) |
| 빈 풀 | 로드 완료 & `available.length === 0` | "추가할 PG가 없어요" 안내 |
| 추가 중 | `pending` | 칩 `disabled` |

- `inputError`("이미 추가된 워크스페이스입니다.") — 이제 풀에서 초대된 PG를 숨기므로 거의 도달 불가하지만, refresh ↔ 클릭 race 방어용으로 `handleSelect`의 가드와 표시는 유지.
- `handleSelect`·`handleSendDrafts` 본문은 불변(액션 호출·`router.refresh()`·toast 그대로).

### 5. UX 라이팅

- 라벨 "PG 워크스페이스 추가" 유지.
- 보조 문구(현 line 205–208 "추가된 PG는 [ 대기중 ] 상태로 쌓여요…")는 의미 유지하되, CLAUDE.md/`UX_WRITING.md`상 상태는 Chip으로 — 본문 `[ 대기중 ]` 대괄호 표기는 손보는 김에 평문/칩 언어로 정리(예: "칩을 누르면 '대기중'으로 쌓여요. 아래 '초대 보내기'를 누르면 메일이 나가요."). 동작 변경 아님.

## TDD 계획 (RED → GREEN)

CLAUDE.md TDD 하드룰 적용. 칩 렌더는 조건 분기·핸들러를 포함하므로 시각 예외 아님.

### 단위 — `components/rfp/__tests__/RfpInviteManager.test.tsx` (재작성)

기존 파일은 (a) `chosungCommandFilter` describe + (b) 팝오버/cmdk 기반 컴포넌트 테스트. (a)는 **삭제**(결정 A), (b)는 칩 기반으로 재작성:

1. **추가 가능 PG가 칩으로 렌더** — `pgList` 모킹(http/`useLazyPgWorkspaces`), 초대 안 된 PG가 `button` role + 이름으로 보임.
2. **이미 초대된 PG는 칩 풀에서 제외** — `invitations`에 있는 wsId는 칩으로 렌더되지 않음(위 '초대 PG' 목록엔 그대로 보임).
3. **칩 클릭 → `addPgWorkspacesToRfpAction` 호출** — 모킹된 액션이 해당 wsId로 1회 호출.
4. **상태**: 로딩(스켈레톤/문구), 빈 풀("추가할 PG가 없어요"), 에러 문구.
5. **`canEdit=false`** → "PG 워크스페이스 추가" 영역·칩 미렌더(기존 가드 유지 확인).

> 모킹 주의: 컴포넌트가 `next/navigation`(`useRouter`)·`@/lib/server/actions/rfp`·`@/hooks/useLazyPgWorkspaces`·`toast`를 쓰므로 기존 테스트의 모킹 셋업을 따른다. `useLazyPgWorkspaces`를 모킹해 `pgList`/`loading`/`error`/`load`를 주입하는 방식이 가장 결정적.

### e2e — `e2e/scenario-d-buyer-add-pg.spec.ts` (수정)

현재 흐름(line 125–126): `getByRole('button', { name: 'PG사 검색…' }).click()` → `getByRole('option', { name: NEW_PG_NAME }).click()`.

→ **칩 직접 클릭**으로 변경: `getByRole('button', { name: NEW_PG_NAME }).click()` (드롭다운 열기 단계 제거). 이후 '대기중' 칩·"초대 보내기" 검증(line 128~)은 그대로.

`canEdit=false` 케이스(line 214–216): `'PG사 검색…'` 트리거 부재 → **"PG 워크스페이스 추가" 영역(또는 칩) 부재**로 단언 교체.

> e2e는 로컬 인프라 의존이라 CI에서 최종 검증(프로젝트 관행). 변경 자체는 스펙에 명시.

## 검증 (Health)

- `pnpm test components/rfp/__tests__/RfpInviteManager.test.tsx` — 단일 파일 RED→GREEN.
- `pnpm tsc --noEmit`, `pnpm lint`, 전체 `pnpm test` 그린.

## 명시적 비대상

- 서버 액션·`/api/workspaces/search`·`addPgWorkspacesToRfpAction`·데이터/DB — 불변.
- 위저드 `RfpStep3PgSelect` 자체 — 변경 없음(스타일 차용만).
- '전체 추가' 일괄 초대(결정 B) — 미포함.
- 검색/필터 — 제거(추후 PG 목록이 크게 늘면 재검토, 결정 1).

## 리스크 / 함정

- **검색 상실** — 칩에 검색이 없어 PG가 많아지면 훑기 부담. 현재 정규 PG는 bounded 목록이라 수용. 늘어나면 검색창 + 칩(브레인스토밍 옵션 B 레이아웃) 재도입 가능.
- **eager-load 위치** — `canEdit` 추가 영역 바깥에서 `loadPg()`를 호출하면 비편집 RFP에서도 불필요 fetch. effect를 편집 영역 조건 안쪽에 두어야 함.
- **죽은 코드 제거 누락** — `chosungCommandFilter`/`getChoseong`/cmdk·popover import를 남기면 lint(no-unused) 빨개짐. import·함수·테스트를 함께 제거.
- **기존 e2e 회귀** — scenario-d를 칩 클릭으로 갱신하지 않으면 빨개짐(필수 동반 변경).
- **워크트리 LSP 거짓 진단** — fresh `pnpm tsc` + `pnpm test`가 진실(프로젝트 관행).
