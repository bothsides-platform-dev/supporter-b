# 단위 테스트·E2E 정리 검증 (2026-10-30)

기준 커밋은 `8e8eb6b7`, 작업 브랜치는 `chore/test-suite-cleanup`이다. 제품 코드·공개 API·DB 스키마는 변경하지 않았다.

단위 케이스는 507개 순감소했고 전체 8,690개 통과·10개 기존 건너뜀이다. 로컬 단위 시간은 4.8%, 재측정한 화면 E2E 묶음 시간은 55.8% 줄었다. 타입 검사·lint·CI YAML 문법 검사는 통과했다. 전체 E2E의 기존 실패와 실행 환경 불안정은 남아 있어 전체 green이나 CI 실측 성공을 뜻하지 않는다.

## 제거·통합 범위

- 계약 템플릿 UI 7개 및 PG 계약 작성 UI 5개 파일, 300개 케이스 제거. 현재 `PlatformAgreementPanel`과 폐지 액션 오류·404 가드는 유지했다.
- `contract-signing.test.ts`: 249 → 41개. 폐지된 생성·발송·취소·재촉·재발송·복구·리스 관리는 제거했다. 기존 계약의 접근 차단, 웹훅·폴링, 상태 단조성, 약한 서명자 격리, PG 동료의 과거 서명 기록, 완료·보관 호출 멱등성, 감사 실패 롤백, 운영 알림은 유지했다. 발송 액션을 거치던 준비는 DB fixture로 바꿨다.
- `submitBid-v2.test.ts`를 `submitBid.test.ts`에 통합하고 같은 카드 수수료 허용 검증 2개를 제거했다. 입력 스키마, 초대·소유권, 중복 제출, 요율·정산조건 저장, 알림 팬아웃 검증은 유지했다.
- 중복 PGlite smoke 1개와 Label·MetricCard·LandingHeroSection의 클래스·정적 문구 검증 9개 제거. 입력 라벨 연결·런타임 방어, 카운트업·SSR, 접근 가능한 제목·CTA 검증은 유지했다.
- 집계 게이트 검증 13개 추가. 전체는 940개 파일·9,207개 케이스에서 926개 파일·8,700개 케이스로 줄었다(순감소 14개 파일·507개 케이스).

## 실행 계약

`pnpm test`는 두 Vitest project 전체를 기본 워커 상한 4로 실행한다. CI `unit-shard`는 `--shard=1/2`, `--shard=2/2`, `fail-fast: false`를 사용한다. `unit-test` / `unit (vitest)`는 `if: always()`인 집계 게이트이며 성공만 통과한다. staging은 이 게이트를 계속 기다리고 E2E의 main 조건·lint 의존성도 유지한다.

Vitest의 실제 설정과 sequencer로 463 + 463 파일이 전체 926 파일의 서로소 분할임을 확인했다. `vitest list --filesOnly`는 설치된 4.1.11에서 shard 필터를 적용하지 않으므로 그 출력만으로 분할을 판정하지 않았다. 게이트의 실제 shell 명령을 success/failure/cancelled/skipped 각각으로 실행해 성공만 exit 0임을 검증했다. 개별 shard의 실제 jobs API 결과도 확인한다. `needs.result`가 runner 할당 전 취소를 성공으로 숨긴 [재현 사례](https://github.com/orgs/community/discussions/211624)가 있어 보완했다. [Jobs API](https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run)의 `filter=all` 결과에서 shard별 최신 `run_attempt`를 사용하므로 실패한 작업만 재실행할 때도 이전 성공 shard를 인정한다. 누락·중복·미완료·비성공과 API 실패는 모두 차단한다. 실제 GitHub runner의 실행·스케줄링은 로컬 검증과 구분한다.

E2E 수집 목록은 144 → 113개(31개 파일 유지)이며 worker 1·retry 0을 유지한다. 데모 완주는 390×844·1440×900, 랜딩/공개 작성은 대표 모바일·데스크톱 조합이다. 320px 실제 마스크·잘림, 768·1024px 전환, 1600·1919·1920px 헤드라인은 짧은 속성 검증으로 남겼다. 히어로는 탐색 전에 Clock을 설치하고 `runFor`로 RAF를 진행한다([Playwright Clock](https://playwright.dev/docs/clock)). 성공 시점의 미비교 스크린샷은 제거했고 실패 trace와 `only-on-failure` 스크린샷은 남겼다. 가입·인증·초안 인계·견적 제출·선정·채팅 격리 시나리오는 유지했다.

## 검증 기록

- 새 fixture 호출부: helper 미정의 상태에서 단일 동기화 회귀 RED(ReferenceError) → fixture 구현 후 동일 테스트 GREEN.
- CI 게이트: 기존 workflow에서 신규 5개 검증 RED → shard/게이트 구성 후 전체 6개 GREEN.
- 개별 shard 결과 helper: 미구현 상태 성공·재실행 시나리오 RED(2개 실패) → 구현 후 GREEN. API 실패를 포함한 게이트 전체 14개 통과.
- 변경 단위 테스트 묶음 통과. 최종 전체 단위 테스트 8,690 통과·10 건너뜀(3개 파일). 타입 검사·lint 통과.
- 표준/스펙 독립 리뷰 완료. 발견한 320px 실제 마스크 검증 공백을 보완한 뒤 미해결 발견 0건.

- 화면 검증 38개 중 데스크톱 랜딩 1개에서 진입 애니메이션 종료 전 위치 측정이 드러났다. 고정 대기 대신 제목 transform이 원위치인 상태를 기다리도록 수정했다. 해당 랜딩·마스크 8개 재실행 모두 통과했다.

## 측정 조건

macOS arm64, Node 22.23.4, pnpm 9.12.3, Playwright 1.59.1과 같은 Chromium·Postgres를 사용했으며, unit worker 4 / E2E worker 1·retry 0이다. 작업 트리는 원본과 같은 설치 의존성·로컬 env를 참조한다. 전체 측정은 단위 전→후, E2E 전→후 순서로 직렬 실행해 서로의 CPU/DB에 영향을 주지 않는다. E2E는 `E2E_WEBPACK=1`의 로컬 개발 서버이며 양쪽 모두 Axiom 전송 환경변수를 비운다. GitHub CI의 빌드 후 서버 시간과 직접 비교하지 않는다.

초기 진단 실행은 비교에서 제외했다. 첫 단위 baseline은 설치 누락(@vercel/nft)으로 3개 실패했고 lockfile 그대로 설치해 해결했다. 첫 변경 후 단위 실행은 E2E와 겹쳤다. 첫 E2E baseline의 마지막 튜토리얼 단계는 `pnpm e2e --list`의 선행 서버 정리 때문에 영향을 받았다. 수집 목록 확인은 이후 `pnpm exec playwright test --list`로 직접 수행한다.

단위 전체 측정과 E2E 실행 기록은 아래와 같다.


| 전체 단위 실행 | 변경 전 | 변경 후 |
|---|---:|---:|
| 테스트 파일 | 940 | 926 |
| 통과 / 건너뜀 | 9,197 / 10 | 8,690 / 10 |
| Vitest 전체 시간 | 228.06초 | 217.21초 |
| 명령 전체 wall time | 228.55초 | 217.61초 |
| 테스트 본문 누적 시간(병렬 합산) | 422.74초 | 393.93초 |

같은 워커 4개 조건의 로컬 전체 실행은 10.85초(4.8%) 단축됐다. 각 1회 측정이며 통계적 성능 보장은 아니다. 기존 실 PostgreSQL 경합 검증 10개는 `RUN_REAL_PG_GUEST_JOURNEY_RACES`, `RUN_REAL_PG_OUTBOX_RACES`, `RUN_REAL_PG_DEADLINE_RACES`가 설정되지 않아 그대로 건너뛰었다. 테스트 삭제나 skip 추가로 바꾼 것은 없다.

CI 단위 게이트의 사용자 제공 기준선은 13분 36초다. 새 GitHub 실행은 이 로컬 작업에서 발생시키지 않았으므로 CI 단축 시간은 아직 실측하지 않았다. 2-shard 구성·워크플로 연결·실패 게이트와 목록 분할만 로컬에서 검증했다.


## 전체 E2E 기준선의 기존 실패

동일 로컬 조건의 변경 전 실행은 115 통과·17 실패·12 건너뜀이다. 아래는 테스트에서 관측한 실패이며 제품 결함과 테스트 전제 문제의 원인을 확정한 진단은 아니다. 이 시나리오를 삭제하거나 assertion을 완화하지 않았다.

| 파일/영역 | 실패 수 | 관측 내용 |
|---|---:|---|
| `chat-rail-team-chat` | 1 | PG 팀 채팅 탭을 찾지 못함 |
| `email-verification-resume` | 2 | 이메일 링크 인증 후 복귀/다른 기기 경로 대기 실패 |
| `guest-rfp-intake` | 2 | 신규·갱신 가입 후 다른 기기 복원에서 로그인 링크 대기 150초 초과 |
| `pg-landing-render` | 2 | 소개 영역을 스크롤하는 동안 DOM이 분리됨 |
| `rfp-create-navigation` | 1 | 긴 최종 확인/추천 대기 시나리오 90초 초과 |
| `rfp-detail-navigation` | 2 | PG 상세의 대상 요소 또는 이동 URL 불일치 |
| `scenario-a/b/c/e` | 4 | 상담→선정, 견적 제출, 구매사 선정, 수정 견적 시나리오 실패 |
| `theme-persistence` | 3 | 브라우저 크롬 색 기대값 불일치 |

건너뜀 12개 중 환경 조건은 6개다: 실제 R2가 필요한 PDF/첨부 2개, 자동 발송 플래그 미설정 2개, Slack 스레드 플래그 미설정 1개, 비공개 서버 도장 원본 부재 1개. 나머지 6개는 serial 묶음의 선행 실패로 실행되지 않았다. 새 skip은 추가하지 않았다.


## 기기 휴면으로 인한 전체 E2E 시간 한계

변경 후 전체 실행 중 macOS 저전력 휴면이 발생했다. `pmset -g log`에서 2026-10-30 18:45:38 KST 진입 → 19:36:56 복귀, 3,078초를 확인했다. 그 구간의 `solution remeasures content, viewport and reduced motion`이 `page.goto('/')`에서 30초 제한을 넘겼고 결과 duration은 약 51.4분으로 기록됐다. 전체 E2E의 원시 시간을 정상 실행과 비교해 성능 개선으로 해석하지 않는다. 전후 7개 변경 화면 파일을 같은 AC 전원 조건에서 별도 재측정했고, 영향을 받은 테스트의 재검증도 포함했다.


| 전체 E2E 실행 | 변경 전 | 변경 후 |
|---|---:|---:|
| 수집 | 144 | 113 |
| 통과 / 실패 / 건너뜀 | 115 / 17 / 12 | 85 / 17 / 11 |
| 첫 테스트 전 준비 | 16.31초 | 17.73초 |
| Playwright 전체 원시 시간 | 1,651.18초 | 4,516.80초(휴면 포함) |
| 테스트·훅 본문 누적 | 1,621.03초 | 4,484.26초(휴면 포함) |

변경 후 실패한 테스트 케이스 15개는 기준선과 같다. 차이는 휴면 중 랜딩 1개와 1440px 견적 제출 1개다. 후자는 기준선에서 1280px 선행 실패로 실행되지 않았던 항목이며, 변경 후에는 1280px가 통과한 뒤 1440px가 로그인 버튼 disabled 상태에서 제한 시간을 넘겼다. 갱신 가입 복원도 변경 후에는 통과했다. 따라서 이 전체 실행의 시간 차이를 정리 효과로 단정할 수 없다. 환경 건너뜀은 양쪽 6개로 같고, 선행 실패에 따른 serial 건너뜀만 6→5개로 바뀌었다.

최종 타입 검사(`pnpm tsc --noEmit`), lint(`pnpm lint`), `git diff --check`도 통과했다.


1440px 견적 제출은 원본과 변경 후를 각각 새 시드·새 서버에서 단독 실행해 모두 통과했다(본문 35.2초 / 40.4초). 전체 실행 순서에서의 로그인 불안정은 남아 있으며, 이를 제품 수정으로 해결했다고 주장하지 않는다. 해당 파일의 변경은 마지막 성공 스크린샷 제거 1줄뿐이다.


## 변경 화면 묶음 재측정

전체 실행과 겹치지 않게 새 서버·새 시드에서 변경 전→후 순서로 실행했다. 대상은 `buyer-demo`, `guest-rfp-layout`, `landing-hero-wrap`, `landing-partner-marquee`, `landing-savings`, `landing-solution`, `landing-word-mask-roll` 7개 spec이다. worker 1·retry 0, 같은 로컬 env·Chromium·webpack 개발 서버·AC 전원을 사용했다. 실행 중에만 idle sleep 방지 assertion을 유지했고 종료와 함께 해제했다.

| 화면 E2E 묶음 | 변경 전 | 변경 후 |
|---|---:|---:|
| 통과 / 실패 / 건너뜀 | 69 / 0 / 0 | 38 / 0 / 0 |
| 첫 테스트 전 준비 | 17.38초 | 17.93초 |
| Playwright 전체 시간 | 379.57초 | 167.67초 |
| 테스트·훅 본문 누적 | 361.27초 | 148.87초 |
| 명령 전체 wall time | 380.31초 | 168.37초 |

전체 211.91초(55.8%), 본문 212.40초(58.8%) 단축을 관측했다. 각 1회 측정이며 이 비율을 전체 E2E나 CI에 적용하지 않는다. 휴면 중 실패했던 리사이즈·모션 감소 테스트도 여기서 통과했다. 전체 실행의 1440px 견적 제출 실패는 앞의 원본/변경 후 단독 검증에서 모두 통과했으므로, 이 정리로 해결한 제품 동작으로 계산하지 않는다.

사용자가 제시한 최근 main CI E2E 11.9분은 빌드 후 서버 기준이다. 이번 로컬 개발 서버의 준비·라우트 컴파일·기존 실패 대기와 직접 비교하지 않는다. 신규 CI 실행을 발행하지 않았으므로 실제 2-shard 게이트 시간은 후속 CI에서 확인해야 한다.

## 재현 및 원시 기록

- 변경 단위 묶음 6개 파일·93개 통과, 이후 전체 `pnpm test -- --maxWorkers=4` 통과.
- 전체 E2E는 `E2E_WEBPACK=1` 및 Axiom 전송 변수 4개를 빈 값으로 두고 `pnpm e2e --reporter=list,json` 실행. 부분 재검증은 같은 명령에 위 spec 목록 또는 `e2e/scenario-b-pg-bid.spec.ts --grep 1440px`를 전달했다.
- 전체 실행 로그: `/tmp/test-cleanup-unit-{before,after}-fair.log`, `/tmp/test-cleanup-e2e-{before,after}-fair.{log,json}`.
- 화면 묶음: `/tmp/test-cleanup-e2e-bundle-{before,after}.{log,json}`. 견적 제출 단독 검증: `/tmp/test-cleanup-e2e-bid1440-{before,after}.{log,json}`.
- 목록 분할 증거: `/tmp/test-cleanup-actual-{all,shard-1,shard-2}.json`. 463 + 463 = 926, 중복 0, 합집합은 전체와 일치한다.

전체 E2E의 남은 실패를 회피하는 skip·재시도·타임아웃 축소는 추가하지 않았다. CI 실행 시간은 미측정이고, 전체 E2E는 통과 상태가 아니므로 별도 안정화 작업 없이 green으로 보고하면 안 된다.
