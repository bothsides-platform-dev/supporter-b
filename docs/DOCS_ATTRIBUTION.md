# Docs 경유 전환 추적

## 계약

`naver → docs → 메인 → 가입/견적 요청`에서 기존 UTM과 최초 유입 기록을 보존하고 마지막 docs 경유를 별도로 기록한다. 관리자 화면·가입 DB·GA4 기본 기여 모델은 변경하지 않는다.

| URL 매개변수 | 이벤트 필드 | 의미 |
| --- | --- | --- |
| `sb_via=docs` | `docs_assisted` | 전환 시 30일 이내 마지막 docs 경유가 있으면 문자열 `true`, 없으면 `false` |
| `sb_docs_path` | `docs_path` | 클릭한 공개 문서 경로. 쿼리·해시 제거, 최대 100자, 허용 경로 밖은 `/other` |
| `sb_docs_placement` | `docs_placement` | 헤더·푸터·본문·CTA·404·UTM 도구의 고정 위치 |
| `sb_docs_source` | `docs_source` | docs 진입 시 허용된 source 또는 `unknown` |
| `sb_docs_medium` | `docs_medium` | docs 진입 시 허용된 medium 또는 `unknown` |

두 저장소의 `lib/attribution/docs-contract.ts`를 함께 갱신한다. 기존 분석 허용 목록에 생성기의 `meta/docs` 및 `paid/owned/earned`를 추가했다. UTM 캠페인·콘텐츠·검색어의 명명 규칙과 원래 링크의 목적지·다른 쿼리·앵커는 그대로다. main_site_click의 link_url은 목적지 origin/path만 담는다.

## Docs

`support-b:docs-entry:v1` sessionStorage에 진입 source/medium을 저장한다. 내부 SPA 이동·새로고침·이전/다음 기록 복원은 유지하고 새로운 외부 진입·UTM 진입은 갱신한다. 저장된 기록이 있으면 reload/back_forward의 원래 referrer와 UTM을 새 유입으로 재처리하지 않는다. 저장소 차단 시 현재 문서 메모리만 사용한다.

모든 공개 메인 링크는 MainSiteLink를 사용한다. href 자체에 경유 정보를 붙여 복사·키보드·새 탭 이동에서도 전달되며, 클릭과 가운데 버튼에는 기존 main_site_click에 5개 필드를 추가한다. 컨텍스트 메뉴로 연 링크는 클릭 이벤트가 없을 수 있지만 메인 도착 이벤트는 별도로 수집한다. 외부 참고 링크는 제외한다.

문서 자체를 새 탭으로 열 때 일부 브라우저는 sessionStorage를 복사하지 않는다. 수정 클릭·가운데 버튼·컨텍스트 메뉴에 한해 내부 문서 링크에 `sb_entry_source/sb_entry_medium`을 전달한다. 수신 문서는 같은 origin의 referrer와 허용 값을 확인하고 탭 저장소에 보관한 뒤 이 두 키만 주소에서 제거한다. 새 UTM은 전달값보다 우선한다. referrer까지 차단된 환경에서는 확인할 수 없는 값을 unknown으로 남긴다.

## 메인

`support-b:docs-assist:v1` localStorage에 버전·실제 메인 도착 시각·문서·위치·소스·매체를 저장한다. 기존 `bidit.firstTouch`와 독립이며 과거 메인 방문 기록이 있어도 갱신한다.

중복 매개변수·잘못된 위치·다른 호스트는 수신하지 않는다. 수신 뒤 전용 5개 키만 history.replaceState로 제거한다. Strict Mode의 같은 URL 재처리는 억제한다. 인증/가입/심사 대기/강제 로그아웃 서버 리다이렉트에도 허용된 경유·UTM 키를 전달하고 로그인 next에는 경유 키를 남기지 않아 로그인 후 재수집을 방지한다.

유효 기간은 도착부터 정확히 30×24시간 미만이다. 일반 방문·전환은 기간을 연장하지 않는다. 다시 docs에서 도착하면 최신 기록으로 바뀐다. 미래 시각·손상 데이터·만료 기록은 사용하지 않는다. 저장소 실패 시 같은 문서의 메모리만 쓰며 이동·가입·요청을 막지 않는다.

- `docs_main_arrival`: 실제 수신 시 1회. 기존 GA 초기화·사용자 유형 확인 큐를 사용한다.
- `sign_up`, `quote_request_submitted`: 기존 서버 성공 경로·중복 억제를 유지하고 해당 시점의 5개 docs 필드를 추가한다.
- PG/운영계정·개발 환경 제외 등 기존 메인 GA 정책을 유지한다. docs 필드는 내부 Slack 행동 수집에 추가하지 않는다.

## GA4와 보고서

2026-10-22 속성 `540469131`, 스트림 `15015369745`, 측정 ID `G-H01WBFDN4H`를 확인했다. 두 사이트는 같은 속성을 유지한다. Docs assisted/path/placement/source/medium 5개 이벤트 범위 맞춤 측정기준을 실제 등록했다. [맞춤 정의](https://analytics.google.com/analytics/web/#/a396924123p540469131/admin/customdefinitions/hub)

[Docs 경유 기여 · 최근 30일](https://analytics.google.com/analytics/web/#/analysis/a396924123p540469131/edit/noiS-sxbTEeFsg35qQyGnQ)에 아래 3개 탭을 저장했다. 개인 탐색으로 저장했으며 추가 공유 권한은 바꾸지 않았다. 지표는 이벤트 횟수가 아닌 총 사용자다.

| 탭 | 행 | 열·조건 |
| --- | --- | --- |
| Docs 유입 | 방문 페이지, 세션 소스/매체 | 호스트 이름 = docs.support-b.com |
| 메인 이동 · 클릭과 도착 | Docs path, Docs placement | 이벤트 이름 = main_site_click 또는 docs_main_arrival |
| Docs 기여 전환 | Docs path, Docs source, Docs medium | Docs assisted = true, 이벤트 이름 = sign_up 또는 quote_request_submitted |

가입과 견적 요청은 서로 다른 열로 집계한다. 같은 사용자가 두 이벤트에 나타날 수 있으므로 합계를 단순 합산하지 않는다. 방문 페이지는 GA4의 세션 최초 페이지이며, 이미 메인에서 시작한 세션이 docs로 이동한 경우 첫 docs 문서와 다를 수 있다. 클릭/도착/전환의 Docs path는 마지막 클릭 문서다. 30일 보고 기간과 개별 전환의 30일 경유 보존 기간은 별도 기준이다.

[Google 설정 기준](https://support.google.com/analytics/answer/14239696?hl=en)에 따라 신규 맞춤 필드는 보고서 반영까지 24–48시간이 걸릴 수 있다. 과거 이벤트에 소급 적용하지 않으며 다른 브라우저·기기의 익명 사용자를 연결하지 않는다.

## 적용과 검증

적용 순서: 맞춤 측정기준 준비 → 메인 수신부 배포 → docs 전달부 배포. 현재 코드의 운영 배포와 운영 DebugView 확인은 아직 수행하지 않았다.

배포 뒤 운영 DebugView에서 다음을 확인한다. 테스트는 허용된 익명/구매사로 수행하며 가짜 성공 이벤트를 주입하지 않는다.

1. docs에 `?utm_source=naver&utm_medium=paid`로 진입해 여러 문서와 새 탭을 거쳐 메인으로 이동한다. click과 arrival의 docs 필드가 일치하는지 본다.
2. 기존 메인 방문자도 arrival이 생기고 새로고침에는 반복되지 않는지 확인한다. 원래 UTM과 다른 쿼리/앵커는 유지돼야 한다.
3. 실제 승인된 가입/견적 테스트의 성공 이벤트에 docs 필드가 붙는지 확인한다. 가입과 기존 회원의 견적 요청은 각각 집계한다.
4. 다시 docs에서 이동한 문서로 교체되는지 확인한다. 30일 경계는 단위 테스트의 고정 시계로 검증하며 운영 저장 시각을 조작하지 않는다.
5. 자동 측정 설정이 기존 메인의 정제된 page_view 정책과 일치하는지 운영자가 함께 확인한다. 10월 22일 UI의 향상된 측정은 켜짐으로 표시돼 10월 18일 퍼널 문서의 꺼짐 기록과 달랐다. 이번 작업에서는 변경하지 않았다.

로컬 검증: docs 단위 테스트 120개, lint/typecheck, 정적 build와 verify:export(41페이지·3,343개 내부 링크), Chromium 새로고침·네이티브 문서/메인 새 탭·공개 링크·차단 저장소·키보드 이동 5개 시나리오와 기존 푸터 회귀 3개 통과. 메인 전체 테스트는 초기 구현에서 8,942개 통과·10개 기존 skip이었다. 이후 관련 70개 파일·758개 테스트를 통과했고, 마지막 강제 로그아웃 경유 보존 수정 후 관련 테스트 15개를 통과했다. 메인 typecheck/lint와 build도 통과했다. 운영 실수신 검증은 이 결과에 포함하지 않는다.


재현 명령(docs 저장소):

```sh
rtk proxy pnpm test
rtk proxy pnpm lint
rtk proxy pnpm typecheck
rtk proxy pnpm build
rtk proxy pnpm verify:export
rtk proxy pnpm exec playwright test --config playwright.attribution.config.ts
rtk proxy pnpm exec playwright test --config playwright.glossary.config.ts footer.spec.ts
```

메인 저장소에서는 `rtk proxy pnpm test`, `rtk proxy pnpm typecheck`, `rtk proxy pnpm lint`를 사용한다. 테스트는 실제 운영 가입·견적을 생성하지 않는다.
