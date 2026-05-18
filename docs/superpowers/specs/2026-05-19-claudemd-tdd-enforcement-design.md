# CLAUDE.md TDD 강제 (prose-only)

작성일: 2026-05-19
대상: `CLAUDE.md` (단일 파일)
스코프: 문서 변경만. 코드·hook·CI·테스트 인프라 무변경.

## 문제

현 `CLAUDE.md`에는 TDD 언급이 전무하다. `pnpm test` 한 줄만 Health Stack에 등재되어 있을 뿐, **모델이 새 기능·버그픽스를 시작할 때 테스트 우선으로 가야 한다는 규범이 없다**. `superpowers:test-driven-development` 스킬은 이미 설치되어 있고 매우 strict("Iron Law", red-flag 목록, RED-GREEN-REFACTOR cycle 완비)이지만 — 자동 발동 트리거가 없으면 모델은 "이건 사소해서…"로 우회한다.

실제로 프로젝트엔 이미 20+ `__tests__` 폴더가 있어 테스트 문화는 존재하지만, 작성 시점이 구현 전/후 어느 쪽인지에 대한 규범은 부재. CLAUDE.md 최상위 권한을 활용해 prose로 못박는 것이 가장 가벼우면서 효과적인 레버.

## 해결 전략 (prose-only, A안)

CLAUDE.md에 다음 3가지 변경을 가한다.

1. **신설**: "TDD — Hard Rules" 섹션. 기존 "Material Design 3 — Hard Rules" 섹션의 톤·구조(비결정 사항 + bullet rules + escape hatch)를 그대로 따른다.
2. **연결 라인 박기**: "Work Order", "Skill routing", "Health Stack" 세 곳에 짧은 진입 신호를 추가해 모델이 작업 시작 시 TDD 섹션을 반드시 거치도록 한다.
3. **자동 발동 트리거 명시**: `superpowers:test-driven-development` 스킬을 Skill routing에 박아 "모든 신규 코드/버그픽스/리팩터링 직전 필수"로 표기.

Hook을 통한 강제 차단(B안)은 의도적으로 보류. 위양성 튜닝 비용·hook 작성 부담이 크고, 우선 prose 규칙의 효과를 관찰한 뒤 필요 시 도입.

## 변경 상세

아래 line 번호는 모두 **변경 전 CLAUDE.md 기준**. 구현 시에는 위치를 어긋나게 만들지 않기 위해 **아래(4)부터 위(1)로 역순 적용**하거나, 각 변경의 diff context를 기준으로 적용한다.

### 1) 신설 "TDD — Hard Rules" 섹션

CLAUDE.md L86("If frontend code looks 'generic SaaS'...") 아래, "Work Order" 섹션 위에 새 섹션 삽입.

```markdown
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
```

### 2) "Work Order" 섹션 끝에 한 줄 추가 (L94 다음)

```diff
 Per-PR verification checklist lives in IMPLEMENTATION.md §4. Copy it into PR body. Three end-to-end scenarios (A/B/C in PG_RFP_SPEC.md §6) are the ultimate clickthrough acceptance tests.
+
+**모든 구현·버그픽스 작업은 "TDD — Hard Rules" 섹션에 따라 failing test부터 시작한다.** 코드 작성 전 `superpowers:test-driven-development` 스킬을 발동했는지 먼저 확인.
```

### 3) "Skill routing" 섹션 보강 (L104~L111)

```diff
 ## Skill routing (project-specific only)

-대부분의 스킬은 description 자동 매칭에 의존한다. 아래 4개만 프로젝트 특수 라우팅:
+대부분의 스킬은 description 자동 매칭에 의존한다. 아래는 프로젝트 특수 라우팅:

+- `superpowers:test-driven-development` — **모든 신규 코드/버그픽스/리팩터링 직전 필수**. 면제 범위는 "TDD — Hard Rules" 참조.
 - `/plan-eng-review` — M2 이후 새 기능 코딩 시작 전 (아키텍처 락인)
 - `/design-review` — 화면 시각 폴리시 (MD3 디자인 시스템 정합 검증)
 - `/investigate` — 버그·에러·예상치 못한 동작
 - `/ship` — PR 생성·배포 단계
```

### 4) "Health Stack" 섹션 끝에 한 줄 추가 (L119 다음)

```diff
 - typecheck: `pnpm tsc --noEmit`
 - lint: `pnpm lint`
 - test: `pnpm test`
+
+TDD 사이클 중 단일 파일만 실행: `pnpm test <path-to-test>` — RED/GREEN 확인은 항상 단일 파일로 빠르게, 전체 그린 확인은 `pnpm test`.
```

## 동작 검증

- CLAUDE.md를 다시 열어 4개 변경이 정확한 위치에 있는지 육안 확인.
- `pnpm lint` 통과 (마크다운은 lint 대상 아니지만 hook이 다른 검사 하는지 체크).
- 새 세션을 시작해 "X 기능 추가해줘"류 요청 시 모델이 `superpowers:test-driven-development` 스킬을 먼저 invoke 하는지 관찰 (수동, 1-2회 샘플).

## 비범위

- `.claude/hooks/` PreToolUse 차단 hook (B안) — 본 spec 효과 관찰 후 별도 이니셔티브로.
- TaskCreate 템플릿 자동 박기 (C안) — 동상.
- 다른 문서(IMPLEMENTATION.md, BACKEND_MIGRATION.md)로의 TDD 규범 전파 — 본 spec은 CLAUDE.md만.
- 기존 `__tests__/*.test.ts(x)` 파일에 대한 audit·정비.
- vitest/Playwright 설정 변경.

## 위험

매우 낮음. 단일 문서 변경, 런타임 영향 0. 모델이 prose를 우회할 수는 있으나 그건 본 spec이 해결하려는 문제가 아니라 효과 관찰 후 다음 단계(hook)에서 다룬다.
