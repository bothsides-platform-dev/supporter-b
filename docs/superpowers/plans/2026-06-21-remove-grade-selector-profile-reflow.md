# 프로필 가맹점 등급 선택기 제거 + 단일 컬럼 재정렬 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구매사 프로필(`/settings/profile`)에서 가맹점 등급 편집기를 제거하고, 비게 되는 워크스페이스 영역을 단일 컬럼으로 재정렬한다.

**Architecture:** 순수 프론트엔드 변경. 클라이언트 컴포넌트 1개와 그 테스트를 삭제하고, 서버 컴포넌트 셸(`profile/page.tsx`)에서 해당 컴포넌트를 언와이어한 뒤 2컬럼 그리드를 단일 `divide-y` 컬럼으로 합친다. 백엔드(액션·스키마·데이터)는 일절 손대지 않는다.

**Tech Stack:** Next.js App Router (서버 컴포넌트 페이지) + React 클라이언트 폼 컴포넌트, Tailwind v4 CSS 변수 토큰, Vitest(삭제만).

## Global Constraints

- **TDD 면제 근거(프로젝트 규칙)**: `app/**/page.tsx`는 단순 조립 서버 셸이라 면제. 이번 작업은 컴포넌트/테스트 **삭제** + **시각/레이아웃** 재정렬이라 신규 테스트를 작성하지 않는다. 검증 = 기존 전체 스위트 green 유지.
- **백엔드 불변**: `lib/server/actions/rfp/updateWorkspaceBizProfileAction.ts`는 `WorkspaceBizNoForm`이 사업자번호 저장에 계속 사용하므로 **삭제 금지**. 액션·액션 export·액션 테스트 모두 유지.
- **등급 데이터 불변**: `grade` 값·`biz_profiles.grade` 컬럼·`merchantGradeEnum`·`lib/types/biz-profile.ts` 변경 없음. 읽기 전용 "가맹점 등급" KV 표시는 유지.
- **PG 프로필 불변**: PG 워크스페이스 렌더 결과는 변경 전후 동일해야 한다(회귀 확인 포인트).
- **Linear 디자인 하드룰**: 저대비 `outline-variant` 보더 유지, 새 그림자/필 금지, 기존 토큰·typescale 그대로 사용.
- **검증 명령**: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test`. (단일 파일 빠른 확인은 `pnpm test <path>`.)

---

## File Structure

- `components/settings/WorkspaceBizProfileForm.tsx` — **삭제** (등급 라디오 편집기).
- `components/settings/__tests__/WorkspaceBizProfileForm.test.tsx` — **삭제** (위 전용 테스트).
- `app/(app)/settings/profile/page.tsx` — **수정** (import·사용 제거 + 단일 컬럼 재정렬).

유지(손대지 않음): `WorkspaceBizNoForm.tsx`, `WorkspaceNameForm.tsx`, `WorkspaceLogoForm.tsx`, `updateWorkspaceBizProfileAction.ts` 및 그 테스트/Export, `lib/types/biz-profile.ts`.

---

## Task 1: 등급 선택기 컴포넌트·테스트 삭제 + 페이지 언와이어

편집기 컴포넌트와 그 전용 테스트를 삭제하고, 프로필 페이지에서 import/사용 지점을 제거한다. 이 시점에는 **2컬럼 그리드 구조는 그대로 두고** 우측 컬럼에서 등급 폼만 사라진다(중간 상태도 정상 렌더). 레이아웃 재정렬은 Task 2.

**Files:**
- Delete: `components/settings/WorkspaceBizProfileForm.tsx`
- Delete: `components/settings/__tests__/WorkspaceBizProfileForm.test.tsx`
- Modify: `app/(app)/settings/profile/page.tsx` (import line 5, usage line 156)

**Interfaces:**
- Consumes: 없음 (삭제 작업).
- Produces: `WorkspaceBizProfileForm` 심볼이 코드베이스에서 완전히 사라짐. Task 2는 `app/(app)/settings/profile/page.tsx`가 더는 이 컴포넌트를 참조하지 않는 상태를 전제로 한다.

- [ ] **Step 1: 컴포넌트 파일 삭제**

```bash
git rm components/settings/WorkspaceBizProfileForm.tsx
```

- [ ] **Step 2: 컴포넌트 전용 테스트 삭제**

```bash
git rm components/settings/__tests__/WorkspaceBizProfileForm.test.tsx
```

- [ ] **Step 3: 페이지에서 import 제거**

`app/(app)/settings/profile/page.tsx`에서 다음 import 한 줄을 삭제한다:

```tsx
import { WorkspaceBizProfileForm } from '@/components/settings/WorkspaceBizProfileForm';
```

- [ ] **Step 4: 페이지에서 사용 지점 제거**

`app/(app)/settings/profile/page.tsx`의 우측 컬럼 안, 다음 한 줄(현재 line 156)을 삭제한다:

```tsx
              {biz && <WorkspaceBizProfileForm currentGrade={grade} />}
```

삭제 후 해당 우측 컬럼 블록은 `biz_required` 안내 + `WorkspaceBizNoForm`만 남는다. `grade` 변수는 여전히 `wsKvPairs`의 "가맹점 등급" 행(`GRADE_LABELS[grade]`)에서 쓰이므로 미사용 경고가 발생하지 않는다.

- [ ] **Step 5: 잔존 참조 없음 확인**

Run:
```bash
grep -rn "WorkspaceBizProfileForm" --include="*.ts" --include="*.tsx" . | grep -v node_modules
grep -rn "ws-merchant-grade\|등급 갱신" --include="*.ts" --include="*.tsx" . | grep -v node_modules
```
Expected: 두 grep 모두 **출력 없음**(0건). 무언가 남으면 그 파일도 정리한 뒤 다시 확인.

- [ ] **Step 6: 타입체크·린트**

Run:
```bash
pnpm tsc --noEmit && pnpm lint
```
Expected: 에러 0. (삭제된 import·미사용 심볼로 인한 에러가 없어야 함.)

- [ ] **Step 7: 테스트 스위트 green 확인**

Run:
```bash
pnpm test
```
Expected: 전체 green. 삭제한 `WorkspaceBizProfileForm.test.tsx` 외 회귀 없음. (`WorkspaceBizNoForm.test.tsx`, `update-workspace-biz.test.ts`는 그대로 통과해야 한다 — 액션은 삭제하지 않았으므로.)

> 참고: 워크트리에서 LSP/에디터 진단이 거짓 양성을 낼 수 있다. 진실은 `pnpm tsc --noEmit` + `pnpm test`의 출력이다.

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: remove buyer profile merchant-grade selector

가맹점 등급 편집기(WorkspaceBizProfileForm)와 그 테스트를 삭제하고
프로필 페이지에서 언와이어. 등급 읽기 표시·등급 데이터·사업자번호 폼이
쓰는 updateWorkspaceBizProfileAction은 그대로 유지.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 구매사 워크스페이스 섹션 단일 컬럼 재정렬

2컬럼 그리드를 제거하고 좌·우 컬럼을 하나의 `divide-y` 스택으로 합친다. 순서는 로고 → 이름 → 사업자번호(buyer) → KV(업태·가맹점 등급·생성일). 비게 되는 우측 반쪽이 사라져 페이지가 짧고 밀도 높게 정리된다. PG는 기존에도 단일 컬럼이라 렌더 결과가 동일해야 한다.

**Files:**
- Modify: `app/(app)/settings/profile/page.tsx` (워크스페이스 `<section>`, 현재 line 108–160 영역)

**Interfaces:**
- Consumes: Task 1 이후 상태 — 페이지에 `WorkspaceBizProfileForm` 참조 없음.
- Produces: 최종 UI. 이후 태스크 없음.

- [ ] **Step 1: 워크스페이스 섹션을 단일 컬럼으로 교체**

`app/(app)/settings/profile/page.tsx`에서 워크스페이스 `<section>`의 `<div className={ws.type === 'buyer' ? 'grid ...' : ''}>` 그리드 래퍼와 그 안의 좌/우 두 컬럼 구조를 아래 단일 컬럼 구조로 **통째로 교체**한다.

**교체 전(현재 구조, 헤더 div 다음부터 `</section>` 직전까지):**

```tsx
        <div
          className={
            ws.type === 'buyer'
              ? 'grid grid-cols-1 lg:grid-cols-2 lg:gap-x-12'
              : ''
          }
        >
          {/* Left: meta KV (이름 폼 포함) */}
          <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
            <WorkspaceLogoForm workspaceId={ws.id} name={ws.name} logoUpdatedAt={ws.logoUpdatedAt} />
            <WorkspaceNameForm
              currentName={ws.name}
              canEdit={memberMeta?.role === 'admin'}
            />
            {wsKvPairs.map(([k, v]) => (
              <div key={k} className={kvRowClass}>
                <span className={kvLabelClass}>{k}</span>
                <span className={kvValueClass}>{v}</span>
              </div>
            ))}
          </div>

          {/* Right: 사업자번호/등급 폼 (buyer only) */}
          {ws.type === 'buyer' && (
            <div className="mt-6 pt-6 border-t border-[var(--md-sys-color-outline-variant)] space-y-6 lg:mt-0 lg:pt-0 lg:border-t-0 lg:space-y-8">
              {biz_required === '1' && !biz && (
                <>
                  <BizRequiredToast />
                  <p
                    role="alert"
                    className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]"
                  >
                    사업자번호를 등록하면 견적 요청을 보낼 수 있어요.
                  </p>
                </>
              )}
              <WorkspaceBizNoForm
                currentBizNo={biz?.bizNo ?? null}
                returnUrl={biz_required === '1' && !biz ? '/rfp-create' : undefined}
              />
            </div>
          )}
        </div>
```

**교체 후(단일 컬럼):**

```tsx
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          <WorkspaceLogoForm workspaceId={ws.id} name={ws.name} logoUpdatedAt={ws.logoUpdatedAt} />
          <WorkspaceNameForm
            currentName={ws.name}
            canEdit={memberMeta?.role === 'admin'}
          />

          {/* 사업자번호 (buyer only) */}
          {ws.type === 'buyer' && (
            <div className="py-4 space-y-4">
              {biz_required === '1' && !biz && (
                <>
                  <BizRequiredToast />
                  <p
                    role="alert"
                    className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]"
                  >
                    사업자번호를 등록하면 견적 요청을 보낼 수 있어요.
                  </p>
                </>
              )}
              <WorkspaceBizNoForm
                currentBizNo={biz?.bizNo ?? null}
                returnUrl={biz_required === '1' && !biz ? '/rfp-create' : undefined}
              />
            </div>
          )}

          {wsKvPairs.map(([k, v]) => (
            <div key={k} className={kvRowClass}>
              <span className={kvLabelClass}>{k}</span>
              <span className={kvValueClass}>{v}</span>
            </div>
          ))}
        </div>
```

핵심 변화: ① 그리드 래퍼 제거(`grid lg:grid-cols-2` → 단일 `divide-y` 컨테이너), ② 우측 컬럼 래퍼(`mt-6 pt-6 border-t … lg:…`) 제거, ③ buyer 전용 사업자번호 블록을 `py-4 space-y-4` 셀로 감싸 이름 폼과 KV 행 **사이**에 배치(미리보기에서 합의한 순서), ④ KV 행(업태·가맹점 등급·생성일)은 컨테이너 맨 끝으로 이동. `BizRequiredToast`/`WorkspaceBizNoForm`/`WorkspaceLogoForm`/`WorkspaceNameForm`/`Chip`/`Label` import는 이미 존재하므로 추가 import 불필요.

- [ ] **Step 2: 타입체크·린트**

Run:
```bash
pnpm tsc --noEmit && pnpm lint
```
Expected: 에러 0.

- [ ] **Step 3: 테스트 스위트 green 확인**

Run:
```bash
pnpm test
```
Expected: 전체 green (회귀 없음).

- [ ] **Step 4: 시각 확인 (선택, 권장)**

`pnpm dev` 후 구매사 계정으로 `/settings/profile` 접속:
- 워크스페이스 영역이 **단일 컬럼**으로, 로고 → 이름 → 사업자번호 → 업태 → 가맹점 등급 → 생성일 순으로 쌓이는지.
- "가맹점 등급"이 **읽기 전용 텍스트**로 보이고 라디오/갱신 버튼이 없는지.
- 데스크톱(lg+)에서 우측 빈 반쪽이 사라졌는지.
- PG 계정으로 `/settings/profile` 접속 시 레이아웃이 이전과 동일한지(로고·이름·생성일 단일 컬럼, 사업자번호/등급 블록 없음).

(시각 확인은 회귀 방지 테스트 대체가 아니며, green 스위트가 게이트다.)

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: single-column reflow of profile workspace section

등급 편집기 제거로 비던 우측 컬럼을 없애고 워크스페이스 정보를
단일 divide-y 컬럼(로고·이름·사업자번호·업태·등급·생성일)으로 재정렬.
PG 렌더 결과는 불변.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage**
- 스펙 "제거" §1·§2(컴포넌트+테스트 삭제) → Task 1 Step 1–2. ✅
- 스펙 "제거" §3(페이지 언와이어) → Task 1 Step 3–4. ✅
- 스펙 정정(액션 유지) → Global Constraints + Task 1 Step 7이 액션 테스트 green 유지로 보증. ✅
- 스펙 "유지"(등급 읽기 KV·grade 데이터·PG 불변) → Task 2 교체 후 코드에 KV 유지, PG 분기 유지. ✅
- 스펙 "레이아웃 변경"(단일 컬럼, 순서, biz_required 유지) → Task 2 Step 1. ✅
- 스펙 "검증"(tsc·lint·test) → 두 태스크 모두 포함. ✅
- 스펙 "비범위"(스키마·마이그레이션·위저드·PG 변경 없음) → 어떤 태스크도 건드리지 않음. ✅

**2. Placeholder scan**: "TBD/TODO/적절히 처리" 류 없음. 모든 코드 스텝에 실제 코드/명령 포함. ✅

**3. Type consistency**: 새 타입/시그니처 도입 없음(삭제+마크업 재배치만). `wsKvPairs`/`kvRowClass`/`kvLabelClass`/`kvValueClass`/`grade`/`biz`/`ws`/`memberMeta` 등 식별자는 기존 페이지 정의를 그대로 사용. ✅

빈틈 없음 — 실행 가능.
