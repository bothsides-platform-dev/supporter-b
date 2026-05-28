# RFP 피크 패널 (Peek Panel) 디자인 스펙

**날짜**: 2026-05-28  
**상태**: 승인됨

## 배경 및 목적

현재 RFP 목록에서 항목을 클릭하면 `/rfp/[id]` 혹은 `/inbox/[id]`로 전체 페이지 이동이 발생한다. 이로 인해 목록 컨텍스트가 사라지고, 다른 RFP로 이동할 때마다 뒤로가기를 반복해야 한다.

노션·Linear처럼 **목록을 유지한 채 오른쪽 패널에서 상세 내용을 바로 볼 수 있는** 피크(Peek) 패널을 도입해 탐색 효율을 높인다. 전체화면 버튼으로 기존 상세 페이지로도 이동 가능하다.

## 적용 범위

- **구매사 RFP 목록** (`/rfp`) — 리스트 뷰 및 보드 뷰(`?view=board`)
- **PG 인박스** (`/inbox`) — 리스트 뷰 및 보드 뷰

## 레이아웃 설계

### 기본 상태 (패널 없음)
```
[앱 사이드바(44px)] | [RFP 목록 — 전체 너비]
URL: /rfp
```

### 패널 열림 상태
```
[앱 사이드바(44px)] | [목록 240px] | [피크 패널 — 나머지]
URL: /rfp?peek=P-2605-0042
```

- 목록 압축 너비: **240px 고정**
- 목록↔패널 구분선: `border-right: 1px solid var(--md-sys-color-outline-variant)`
- 선택된 행: `border-left: 2px solid var(--md-sys-color-primary)` + 배경 강조 — `useSearchParams()`로 `peek` 파라미터를 읽어 해당 코드와 일치하는 행에 적용
- 전환 애니메이션: `transition: grid-template-columns 200ms ease`
- **보드 뷰**: 칸반 영역이 240px 대신 나머지 너비를 차지하지 않고, `SplitView`가 `[칸반 영역] | [패널]` 구조로 동일하게 적용됨. 칸반은 좁아진 영역 안에서 기존 가로 스크롤 유지

### 패널 헤더 (항상 고정)
```
[RFP 코드 (monospace)]    [⤢ 전체화면] [✕]
```
- 높이: 36px (헤더와 동일)
- 전체화면 버튼: `router.push('/rfp/[id]')` — 기존 상세 페이지로 hard navigation
- 닫기 버튼(✕): `?peek` 파라미터 제거

### 패널 콘텐츠
기존 `RfpDetailContent` (구매사) 및 `PgRfpDetailContent` (PG) 컴포넌트를 **그대로 재사용**. 이중화 없음.

## URL 설계

| 액션 | URL 변화 | 라우터 메서드 |
|------|----------|--------------|
| RFP 행/카드 클릭 | `/rfp` → `/rfp?peek=P-2605-0042` | `router.replace` |
| 다른 RFP 클릭 | `?peek=0042` → `?peek=0041` | `router.replace` |
| 닫기 버튼 | `?peek=0042` → `/rfp` | `router.replace` |
| 전체화면 버튼 | → `/rfp/P-2605-0042` | `router.push` |
| 보드 뷰 + 피크 | `/rfp?view=board&peek=P-2605-0042` | `router.replace` |

**`router.replace` 사용 이유**: 클릭마다 history 스택이 쌓이면 뒤로가기를 여러 번 눌러야 하는 UX 문제 방지. 새로고침 시 `?peek` 파라미터가 유지되어 패널이 복원된다.

## 컴포넌트 아키텍처

### 신규 파일

| 파일 | 역할 |
|------|------|
| `components/ui/split-view.tsx` | 순수 레이아웃 컴포넌트. `peek` prop 유무에 따라 `grid-cols-[240px_1fr]` / `grid-cols-[1fr]` 전환 |
| `components/rfp/RfpPeekPanel.tsx` | 구매사 피크 패널: 헤더(코드, 전체화면, 닫기) + `<RfpDetailContent>` |
| `components/inbox/InboxPeekPanel.tsx` | PG 피크 패널: 헤더 + `<PgRfpDetailContent>` |

### 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `app/(app)/rfp/page.tsx` | `searchParams.peek` 읽어 `getRfpDetail` 병렬 fetch → `<SplitView>` 렌더 |
| `app/(app)/inbox/page.tsx` | 동일 패턴 |
| `components/rfp/RfpListTable.tsx` | `onClick` → `router.replace` (기존 필터 파라미터 유지, `peek=` 추가/교체). `useListNavigation` Enter 키도 동일하게 처리 |
| `components/inbox/InboxList.tsx` | 동일 |
| `components/board/PipelineBoard.tsx` | `onSelect` 콜백 → `router.replace` (기존 `view=board` 등 파라미터 유지) |

### 데이터 흐름

```
클릭 → router.replace('/rfp?peek=P-2605-0042')
         ↓  (Next.js RSC 재렌더)
page.tsx (Server Component)
  peek = 'P-2605-0042'
         ↓
  병렬 fetch:
  ├── getRfpList(filters)          → <RfpListTable> (기존)
  └── getRfpDetail('P-2605-0042') → <Suspense> → <RfpPeekPanel>
                                                    └── <RfpDetailContent>
```

패널 콘텐츠는 `<Suspense>` 경계로 감싸 스켈레톤 표시. 목록 데이터는 Next.js 기본 fetch 캐싱으로 서빙되므로 패널 전환 시 깜빡임 없음.

## TDD 계획

각 단위별 RED → GREEN → REFACTOR 사이클:

1. **`SplitView`** — `peek` prop 유무에 따른 grid 클래스 검증
2. **`RfpListTable`** — 행 클릭 시 `router.replace` 호출 + `?peek=` 파라미터 검증
3. **`InboxList`** — 동일
4. **`RfpPeekPanel`** — 닫기 버튼: peek 제거 / 전체화면: `router.push('/rfp/[id]')` 검증
5. **`InboxPeekPanel`** — 동일 패턴
6. **`rfp/page.tsx` 통합** — `?peek` 있을 때 `RfpPeekPanel` 렌더 검증

## 검증 방법

1. `pnpm test` — 위 단위 테스트 전체 통과
2. `pnpm tsc --noEmit` — 타입 에러 없음
3. `pnpm lint` — 린트 에러 없음
4. 브라우저 수동 확인:
   - `/rfp` 목록에서 행 클릭 → 패널 열림, URL `?peek=` 추가
   - 다른 행 클릭 → 패널 내용 전환, URL 교체
   - 닫기 버튼 → 패널 닫힘, URL 복원
   - 전체화면 → `/rfp/[id]` 이동
   - 새로고침 → 패널 복원
   - `/inbox` 동일 흐름 확인
   - `?view=board` 보드 뷰에서도 동일 동작 확인
