# PG 워크스페이스 Lazy Load + cmdk 설계

**날짜**: 2026-05-10  
**범위**: RFP 작성/편집 화면의 PG 워크스페이스 선택 UI

---

## 배경

`RfpCreateForm`과 `RfpInviteManager`는 PG 워크스페이스 검색 시 키 입력마다 `/api/workspaces/search?q=...&type=pg`를 250ms 디바운스로 호출한다. 한국 PG사 수는 수십 개 수준으로, 전체 목록을 한 번 받아 클라이언트에서 필터링하는 편이 UX와 서버 부하 면에서 유리하다.

---

## 목표

- 드롭다운 **첫 열람 시 전체 PG 목록을 1회 fetch**
- 이후 검색은 **클라이언트 필터링**으로 즉각 반응
- UI는 **cmdk** (`Command` 컴포넌트) 로 교체해 키보드 내비게이션·빈 상태 처리 내장화

---

## 1. API 변경 — `app/api/workspaces/search/route.ts`

### 현재 동작
- `q` 파라미터 필수 (최소 1자), ILIKE 검색, 최대 20건 반환

### 변경 후
- `q` 파라미터 **선택적** (없으면 전체 반환)
- `q` 없이 `type=pg` 호출 시 최대 **500건** 반환 (PG사 수 상한 고려)
- `q` 있을 때는 기존 ILIKE 동작 유지 (하위 호환)
- `type=buyer`는 인증 요구 조건 그대로 유지

```
GET /api/workspaces/search?type=pg        → 전체 PG 목록 (최대 500건)
GET /api/workspaces/search?q=서포터&type=pg → ILIKE 검색 (기존 동작)
```

응답 스키마는 기존과 동일:
```json
{ "workspaces": [{ "id": "...", "name": "...", "displayName": "..." }] }
```

---

## 2. 공유 훅 — `hooks/useLazyPgWorkspaces.ts`

두 컴포넌트의 fetch 로직 중복을 없애기 위해 훅으로 추출한다.

```ts
type PgWorkspace = { id: string; name: string; displayName: string }

function useLazyPgWorkspaces(): {
  pgList: PgWorkspace[]
  loading: boolean
  error: string | null
  load: () => void   // 첫 호출만 fetch, 이후 no-op
}
```

**동작 규칙**:
- `load()` 호출 시 `loaded` ref가 false인 경우에만 fetch 실행
- fetch 완료 후 `loaded` ref를 true로 설정 → 이후 `load()` 재호출은 no-op
- fetch 실패 시 `error` 세팅, `loading` false

컴포넌트는 Popover `onOpenChange(open)` 콜백에서 `if (open) load()` 호출.

---

## 3. cmdk Combobox 교체

### 컴포넌트 구조

```
<Popover onOpenChange={(open) => open && load()}>
  <PopoverTrigger>
    {/* 현재 입력 필드와 동일한 시각적 스타일 유지 */}
    <button>PG사 검색...</button>
  </PopoverTrigger>
  <PopoverContent>
    <Command>
      <CommandInput placeholder="PG사 이름 검색" />
      <CommandEmpty>
        {loading ? "불러오는 중..." : "결과 없음"}
      </CommandEmpty>
      <CommandList>
        {pgList.map(pg => (
          <CommandItem
            key={pg.id}
            value={pg.displayName}        // cmdk 필터링 대상
            onSelect={() => handleSelect(pg)}
            disabled={isAlreadyAdded(pg.id)}
          >
            {pg.displayName}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

### 필터링
cmdk의 내장 fuzzy filter가 `CommandInput` 값을 기준으로 `CommandItem[value]`를 자동 필터링. 별도 `useState` + `filter()` 로직 불필요.

### 이미 선택된 PG 처리
- `RfpCreateForm`: `selectedIds` 배열에 있으면 `CommandItem disabled`
- `RfpInviteManager`: 기존 `rfpInvitation` 목록에 있으면 `CommandItem disabled`

### 로딩·오류 상태
| 상태 | CommandEmpty 표시 |
|------|-------------------|
| 로딩 중 | "불러오는 중..." |
| 오류 | "불러오기 실패. 다시 시도해주세요." |
| 결과 없음 | "해당 PG사가 없습니다." |

---

## 4. 변경 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `app/api/workspaces/search/route.ts` | `q` 선택적으로, 전체 조회 시 limit 500 |
| `hooks/useLazyPgWorkspaces.ts` | 신규 — lazy fetch 훅 |
| `components/rfp/RfpCreateForm.tsx` | 커스텀 드롭다운 → cmdk Combobox |
| `components/rfp/RfpInviteManager.tsx` | 커스텀 드롭다운 → cmdk Combobox |

---

## 5. 제거되는 코드

- `RfpCreateForm`과 `RfpInviteManager`의 `debounce` 로직 (250ms setTimeout)
- 두 컴포넌트의 `searchQuery` state, click-outside ref, 드롭다운 open/close state (Radix Popover로 대체)
- 두 컴포넌트의 인라인 fetch + 결과 state (훅으로 이동)

---

## 6. 미변경 사항

- 선택 후 처리 로직 (`addPgWorkspacesToRfpAction`, Zustand `useRfpDraftStore`) 그대로 유지
- `/api/workspaces/search?q=...` ILIKE 검색 동작 하위 호환 유지
- MD3 디자인 시스템 토큰·타이포그래피 규칙 준수
