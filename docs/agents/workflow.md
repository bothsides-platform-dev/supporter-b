# 작업 흐름과 검증

로컬 수정·검증·worktree·PR·버전·문서 관리 시 해당 절을 읽는다. 설치 버전과 실행 스크립트는 [package.json](../../package.json), Node 버전은 [mise.toml](../../mise.toml)이 단일 출처다.

## 검증 선택

- **TDD**는 실패 테스트로 버그를 재현하거나 복잡한 규칙·경계 조건을 명확하게 만드는 데 실질적인 도움이 될 때 사용한다. 선택했다면 실패를 확인한 뒤 통과에 필요한 구현과 리팩터링을 진행한다.
- **테스트 선작성 생략**: 문서·문구·스타일·순수 설정·기계적인 변경과 기존 테스트로 충분히 검증되는 변경에는 테스트 선작성을 요구하지 않는다.
- **테스트 추가**: 새로운 동작이나 회귀 위험을 검증할 필요가 있을 때만 추가한다. 구현을 그대로 반복하거나 형식만 갖추는 테스트는 만들지 않는다.
- **핵심 경계**: 권한·정보 공개·계약·데이터 무결성을 바꾸면 해당 동작을 입증할 검증을 갖춘다. 테스트 작성 순서 자체를 일괄 강제하지 않는다. 신뢰 경계 변경은 [위협 모델](../THREAT_MODEL.md)의 해당 절과 AR-N도 갱신한다.
- **실행 범위**: 관련 검사를 먼저 실행하고 변경·실패·미해결 위험이 있을 때 확대한다. 관련 검사가 통과한 뒤 같은 검사를 이유 없이 반복하거나 전체 검사를 관성적으로 실행하지 않는다. 원격 CI 게이트는 아래 기준을 유지한다.
- **화면 변경**: [DESIGN.md](../../DESIGN.md)·[SCREEN_DESIGN.md](../../SCREEN_DESIGN.md)를 기준으로 브라우저에서 시각 확인한다. 상태·상호작용 변경은 관련 자동 검증도 수행한다.
- **완료**: 승인된 범위에서 필요한 수정과 관련 실패 해결까지 진행한다. 결과·실제 실행한 검사·남은 장애를 보고하고, 확인하지 않은 동작을 통과했다고 말하지 않는다.

## 명령

셸 명령은 `rtk`로 시작한다. 전용 래퍼가 없거나 원문 출력이 필요하면 `rtk proxy <command>`를 쓰고 이중으로 감싸지 않는다.

| 목적 | 명령 |
|---|---|
| 관련 단위·컴포넌트 테스트 | `rtk proxy pnpm test <path-to-test>` |
| 전체 단위·컴포넌트 테스트 | `rtk proxy pnpm test` |
| 변경 파일 lint | `rtk proxy pnpm exec eslint <path>` |
| 전체 lint | `rtk proxy pnpm lint` |
| 타입 검사 | `rtk proxy pnpm tsc --noEmit` |
| Next.js 생성 타입 준비 | `rtk proxy pnpm exec next typegen` |
| 빌드 | `rtk proxy pnpm build` |
| e2e DB 준비 | `rtk proxy docker compose --profile test up -d pg-test` |
| e2e | `rtk proxy pnpm e2e` |
| 공백·충돌 패치 검사 | `rtk git diff --check` |

새 worktree에서 타입 검사 전 Next.js 타입을 생성한다(CI도 같은 순서). e2e는 5433 포트의 `supporter_b_test` DB를 사용한다. 종료코드를 가리는 `| tail` 파이프는 쓰지 않는다. 테스트 구성·DB 주입은 [서버 문서](server.md#리포지토리-경계), push 전 비밀값 검사와 설치는 [README](../../README.md#push-전-비밀값-검사)를 따른다.

## Worktree·PR·CI

- 기능 개발·버그픽스는 `dev` 기반 worktree에서 진행하고 `dev`를 clean으로 둔다. 브랜치는 `feat/<slug>`·`fix/<slug>`·`chore/<slug>`를 쓴다. worktree 생성에 별도 동의는 필요 없다.
- 직접 만들 때는 `.worktrees/<name>`을 쓴다. Claude Code의 `EnterWorktree`가 `.claude/worktrees/<name>`에 `origin/main` 기반 `worktree-<name>`을 만들면, 작업 전 변경이 없는 새 worktree에서만 `origin/dev` 기반으로 맞추고 브랜치 이름을 위 규칙으로 바꾼다. 두 디렉터리는 gitignore 대상이다.
- 기능 PR의 대상은 `dev`, 운영 반영 컷 PR은 `dev → main`이다. PR 본문은 문제·변경된 동작·실제 검증·남은 위험을 설명한다. 버전·변경 기록은 아래 기준에 맞추고, push 전 비밀값 검사도 유지한다.
- [원격 CI](../../.github/workflows/ci.yml): lint+tsc·unit은 `main`·`dev` 대상 PR과 두 브랜치 push에서 돈다. **e2e는 `main` 대상 PR과 `main` push에서만 돌며, dev→main 컷 PR의 e2e 결과를 반드시 읽는다.** 로컬 검사 범위 선택은 이 게이트를 대체하지 않는다.
- `dev` push는 `STAGING_DEPLOY_ENABLED=true`일 때 CI 통과 후 [스테이징](../STAGING.md)에 자동 배포된다. 운영 배포·관리자 저장소 배포는 포함하지 않는다.
- 머지 후 변경·미보존 작업이 없는 해당 worktree를 `rtk git worktree remove <path>`로 정리하고, 이어서 `rtk git branch -d <name>`으로 브랜치를 삭제한다.

## 버전·문서 관리

- **버전**: [VERSION](../../VERSION)의 4자리 `MAJOR.MINOR.PATCH.MICRO`가 단일 출처다. [CHANGELOG.md](../../CHANGELOG.md) 최상단 헤더와 맞추고, npm이 4자리를 받지 않으므로 `package.json`은 3자리 번역본을 둔다(`0.5.6.1 → 0.5.6`). 버전 변경 시 `lib/__tests__/version-stamp.test.ts`로 검증한다. Node·실행 환경을 바꾸면 `lib/__tests__/node-version-source.test.ts`도 확인한다.
- **진입점**: [CLAUDE.md](../../CLAUDE.md)에 모든 작업의 공통 규칙과 조건이 붙은 링크만 둔다. 상세는 담당 문서에 통합한다. `lib/__tests__/agent-entrypoint.test.ts`가 상대 심링크·마지막 센티널·8KiB 예산·문서 링크를 지킨다.
- **교차 참조**: `CLAUDE.md`·`README.md`·`DESIGN.md`·`SCREEN_DESIGN.md`의 관련 참조를 함께 맞춘다. 문서를 옮기면 링크와 앵커를 확인한다. 오픈 게시판 공개 필드의 산문 목록은 [제품 규칙](product-rules.md#공개-필드-화이트리스트) 한 곳에만 둔다.
- **화면·라우트**: [SCREEN_DESIGN.md](../../SCREEN_DESIGN.md) §0 라우트 맵과 화면 표에 등록한다. 새 최상위 트리는 [라우팅](routing.md)의 트리에도 반영한다.
- **토큰**: 토큰 값 변경은 [DESIGN.md](../../DESIGN.md#15-토큰-파일-참조)의 코드 동기화 규칙을 따른다.
- **도메인 어휘**: 값·라벨의 단일 출처는 [제품 규칙](product-rules.md#도메인-어휘)을 따르고, 용어·설계 결정 기록은 [도메인 문서 사용법](domain.md)을 따른다.
- **부채**: [TODOS.md](../../TODOS.md)의 해결 항목은 지우지 않고 `~~취소선~~ — 해결 (vX.Y.Z.W)`로 남긴다.

## 스킬·관련 기록

사용자가 스킬을 지정하면 적용한다. 그 외에는 작업에 도움이 될 때 선택하며 모든 코드 변경·버그픽스·PR에 일괄 강제하지 않는다. `mattpocock-skills`를 쓸 때는 플러그인 설치본을 사용하고 같은 스킬의 수동 복사본은 추가하지 않는다. 설치 명령은 [README](../../README.md#개발-스킬)를 본다.

- 실패 재현·복잡한 동작 검증: `mattpocock-skills:tdd`.
- 원인 조사·모듈 경계·변경 검토: `mattpocock-skills:diagnosing-bugs`·`mattpocock-skills:codebase-design`·`mattpocock-skills:code-review`.
- PR 설명·에이전트 문서 작성: `mattpocock-skills:pr`·`mattpocock-skills:writing-for-agents`.
- 요구사항·설계 정리 시 [도메인 문서](domain.md)와 관련 ADR을 먼저 확인한다. 이슈·스펙을 게시할 때는 [GitHub Issues](issue-tracker.md), 라벨을 다룰 때는 [트리아지](triage-labels.md)를 따른다.

특정 연동을 바꿀 때만 관련 기록을 읽는다: [docs 경유 유입](../DOCS_ATTRIBUTION.md), [업종 탐색 메타데이터](../INDUSTRY_NAVIGATION.md), [국세청 대표자명 조사](../NTS_REPRESENTATIVE_NAME.md), [Dependabot 패치 계획](../DEPENDABOT_PATCH_PLAN_2026-09-15.md). 과거 조사·계획은 현재 코드로 재확인한다.
