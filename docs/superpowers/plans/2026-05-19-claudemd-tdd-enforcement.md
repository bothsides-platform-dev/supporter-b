# CLAUDE.md TDD 강제 (prose-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CLAUDE.md에 TDD 우선 규범을 prose로 박아 향후 모든 세션이 `superpowers:test-driven-development` 스킬을 자동 발동하도록 만든다.

**Architecture:** 단일 파일(`CLAUDE.md`) 변경만. 4개 변경 = 신설 1개 섹션("TDD — Hard Rules") + 기존 3개 섹션(Work Order / Skill routing / Health Stack)에 진입 신호 라인 추가. 코드·hook·CI 무변경. 변경은 **bottom-up으로 적용**해 line 번호 어긋남 회피, 하나의 atomic commit으로 마무리.

**Tech Stack:** Markdown 편집만. 검증은 `Read` tool로 파일 내용 확인 + `pnpm lint`(markdown 미체크지만 hook 안전 확인).

**Spec 참조:** `docs/superpowers/specs/2026-05-19-claudemd-tdd-enforcement-design.md`

---

## File Structure

```
CLAUDE.md                                           # MODIFY (단일 파일)
docs/superpowers/specs/2026-05-19-...-design.md     # 이미 존재, 무변경
docs/superpowers/plans/2026-05-19-...md             # 본 파일
```

CLAUDE.md 변경 후 섹션 순서 (변경 부분 굵게):

```
## Material Design 3 — Hard Rules
**## TDD — Hard Rules           <- 신설 (변경 #1)**
## Work Order                    <- 끝에 1줄 추가 (변경 #2)
## When Editing Documentation    <- 무변경
## Skill routing                 <- 문구 2줄 변경 (변경 #3)
## Health Stack                  <- 끝에 1줄 추가 (변경 #4)
```

---

## Task 1: CLAUDE.md 4개 변경 적용 + commit

**Files:**
- Modify: `CLAUDE.md` (4곳)

**적용 순서**: 변경 #4 → #3 → #2 → #1 (bottom-up). 위에서부터 적용하면 line 번호가 어긋나 Edit tool의 `old_string` 매칭이 깨질 수 있다. 모든 anchor는 변경 전 파일을 기준으로 작성됨.

- [ ] **Step 1: 변경 #4 적용 — Health Stack 끝에 한 줄 추가**

Edit tool 사용:

`old_string`:
```
- typecheck: `pnpm tsc --noEmit`
- lint: `pnpm lint`
- test: `pnpm test`
```

`new_string`:
```
- typecheck: `pnpm tsc --noEmit`
- lint: `pnpm lint`
- test: `pnpm test`

TDD 사이클 중 단일 파일만 실행: `pnpm test <path-to-test>` — RED/GREEN 확인은 항상 단일 파일로 빠르게, 전체 그린 확인은 `pnpm test`.
```

- [ ] **Step 2: 변경 #3 적용 — Skill routing 두 라인 변경 + TDD 스킬 추가**

Edit tool 사용:

`old_string`:
```
대부분의 스킬은 description 자동 매칭에 의존한다. 아래 4개만 프로젝트 특수 라우팅:

- `/plan-eng-review` — M2 이후 새 기능 코딩 시작 전 (아키텍처 락인)
```

`new_string`:
```
대부분의 스킬은 description 자동 매칭에 의존한다. 아래는 프로젝트 특수 라우팅:

- `superpowers:test-driven-development` — **모든 신규 코드/버그픽스/리팩터링 직전 필수**. 면제 범위는 "TDD — Hard Rules" 참조.
- `/plan-eng-review` — M2 이후 새 기능 코딩 시작 전 (아키텍처 락인)
```

- [ ] **Step 3: 변경 #2 적용 — Work Order 끝에 한 줄 추가**

Edit tool 사용:

`old_string`:
```
Per-PR verification checklist lives in IMPLEMENTATION.md §4. Copy it into PR body. Three end-to-end scenarios (A/B/C in PG_RFP_SPEC.md §6) are the ultimate clickthrough acceptance tests.
```

`new_string`:
```
Per-PR verification checklist lives in IMPLEMENTATION.md §4. Copy it into PR body. Three end-to-end scenarios (A/B/C in PG_RFP_SPEC.md §6) are the ultimate clickthrough acceptance tests.

**모든 구현·버그픽스 작업은 "TDD — Hard Rules" 섹션에 따라 failing test부터 시작한다.** 코드 작성 전 `superpowers:test-driven-development` 스킬을 발동했는지 먼저 확인.
```

- [ ] **Step 4: 변경 #1 적용 — "TDD — Hard Rules" 섹션 신설**

MD3 Hard Rules 섹션의 마지막 줄 다음에 새 섹션 삽입. Edit tool 사용:

`old_string`:
```
If frontend code looks "generic SaaS", check DESIGN.md §9 (anti-patterns) before defending it.

## Work Order
```

`new_string`:
````
If frontend code looks "generic SaaS", check DESIGN.md §9 (anti-patterns) before defending it.

## TDD — Hard Rules

모든 코드 변경은 `superpowers:test-driven-development` 스킬을 발동하고 **RED → GREEN → REFACTOR** 사이클로 진행한다. 이 스킬의 Iron Law가 본 프로젝트의 비결정 사항이다:

> **NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.**

- **Failing test 먼저, 구현 나중**. `__tests__/<name>.test.ts(x)`에 테스트를 작성하고 `pnpm test <path>`로 빨갛게 떨어지는 것을 직접 확인한 뒤 구현 코드를 작성한다.
- **테스트 후행 금지**. 구현부터 작성한 코드는 "참고용"으로도 남기지 말고 삭제 후 테스트부터 다시 시작. ("이미 X시간 썼는데 아까워서…"는 sunk-cost.)
- **즉시 통과한 테스트는 가짜 테스트**. RED를 직접 본 적 없으면 그 테스트는 무엇도 보장하지 않는다.
- **수동 브라우저 클릭은 테스트 대체재가 아니다**. 시각/UX 확인용이지 회귀 방지는 아니다 — 자동 테스트와 병행한다.
- **버그 픽스는 먼저 회귀 테스트로 재현**. 테스트가 빨갛게 뜨는 것을 보고 나서 픽스.
- **GREEN은 최소 코드만**. 통과시키기 위한 최소 구현 — 미래를 위한 옵션·파라미터·추상화 금지(YAGNI).

**TDD 면제 (그 외에는 모두 적용)**:
- 일회용 prototype/spike (커밋 안 함)
- 생성 코드 (codegen 산출물)
- 순수 설정 파일 (`*.config.*`, `eslint.config.mjs`, `drizzle.config.ts` 등)
- 시각/스타일만 손대는 변경 — 단 상태(state)·핸들러·조건 분기를 같이 추가하면 비예외.
- `app/**/page.tsx`·`app/**/layout.tsx` shell이 단순 컴포넌트 조립일 때 (안의 client component·server function 단위로 테스트).

면제에 해당해도 **확신이 안 서면 우선 테스트부터** — 30초 손해보다 회귀 한 번이 비싸다.

세부 RED-Flag 합리화 패턴(예: "이건 너무 사소해서…", "이미 수동으로 확인했어")과 cycle 가이드는 `superpowers:test-driven-development` 스킬 본문 참조.

## Work Order
````

- [ ] **Step 5: 변경 결과 육안 검증**

Read tool로 `CLAUDE.md` 전체 다시 읽고 아래 6개 anchor가 **이 순서로** 존재하는지 확인:

1. `## Material Design 3 — Hard Rules` (기존)
2. `## TDD — Hard Rules` (신설)
3. `> **NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.**` (신설 섹션 내부)
4. `**모든 구현·버그픽스 작업은 "TDD — Hard Rules" 섹션에 따라 failing test부터 시작한다.**` (Work Order 끝)
5. `` - `superpowers:test-driven-development` — **모든 신규 코드/버그픽스/리팩터링 직전 필수** `` (Skill routing 첫 항목)
6. `TDD 사이클 중 단일 파일만 실행: ` (Health Stack 끝)

빠진 게 있거나 순서가 다르면 해당 step으로 돌아가 재적용. (실패 시 `git diff CLAUDE.md` 로 무엇이 적용되었는지 확인 후 누락분만 보강.)

- [ ] **Step 6: pnpm lint 통과 확인**

Run: `pnpm lint`
Expected: pass (markdown은 lint 대상 아니지만 hook이나 다른 검사 영향 없는지 확인용).

실패 시: lint 에러가 CLAUDE.md 변경과 무관하면(예: 기존 dirty state에서 전파) `git stash` 후 다시 시도해 본인 변경이 원인인지 절단. 본인 변경이 원인이면 메시지 보고 수정.

- [ ] **Step 7: Commit**

CLAUDE.md만 staged하고 commit. 다른 dirty 파일은 무시 (`git status`로 dirty 많음 — 본 작업과 무관).

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: CLAUDE.md TDD 강제 규범 추가 (prose-only)

- TDD — Hard Rules 섹션 신설
- Work Order, Skill routing, Health Stack에 진입 신호 라인 추가
- superpowers:test-driven-development 스킬을 모든 코드 변경 직전 필수로 라우팅

Spec: docs/superpowers/specs/2026-05-19-claudemd-tdd-enforcement-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

확인: `git show --stat HEAD` → 1 file changed, ~30 insertions(+), ~1 deletion(-) (Skill routing 한 줄 문구 변경 때문에 1 deletion 발생).

---

## Task 2: Post-merge 관찰 follow-up (정보용)

본 PR 머지 후 다음 작업 시작 시 다음을 관찰:

- 새 Claude Code 세션에서 "X 기능 추가해줘"류 요청을 했을 때 **첫 응답 또는 첫 tool call에 `superpowers:test-driven-development` 스킬이 invoke되는지** 확인.
- 1~2회 샘플 후에도 모델이 prose를 우회한다면 Hook 차단(B안) 또는 TaskCreate 템플릿(C안)으로 escalate — 별도 spec 작성.

이 task는 실행 단계 아님. PR 머지 후 운영 관찰 항목.

---

## Self-Review

**1. Spec 커버리지:**
- 변경 #1 (TDD 섹션 신설) → Step 4 ✓
- 변경 #2 (Work Order 끝 추가) → Step 3 ✓
- 변경 #3 (Skill routing 보강) → Step 2 ✓
- 변경 #4 (Health Stack 추가) → Step 1 ✓
- 동작 검증 (육안 + lint + 새 세션 스모크) → Step 5, 6, Task 2 ✓
- 비범위 항목 (hook/template/다른 문서) → Task 2에서 follow-up으로 명시 ✓

**2. Placeholder scan:** TBD/TODO 없음. 모든 step에 실제 `old_string`/`new_string` 완전 본문 포함.

**3. Type consistency:** 코드 타입 없음 (markdown). anchor 문자열은 spec과 1:1 동일.

**4. 적용 순서 안전:** bottom-up (#4 → #1) 으로 명시. 각 Edit의 `old_string`은 변경 전 파일에 unique한 context를 포함.
