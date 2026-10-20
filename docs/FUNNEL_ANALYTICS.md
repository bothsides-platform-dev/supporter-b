# 구매사 퍼널 분석

## 집계 계약

최근 28일의 **사용자**를 기준으로 계산한다. 재방문도 포함하며 단계 사이에 다른 행동을 허용한다(간접적으로 다음 단계). 별도 단계 시간 제한은 설정하지 않는다. 전환율은 다음 단계까지 순서대로 도달한 사용자 / 현재 단계 사용자, 이탈률은 1 − 전환율이다. 아직 심사 중인 사용자는 `signup / approval_pending` 도달 후 `app_entry`가 없는 별도 세그먼트로 본다. 관리자 승인 시각을 수집하지 않는다.

GA4의 사용자 연결은 로그인 이후 내부 `user_id`를 이용한다. 로그인 전 다른 기기의 익명 사용자까지 연결하지 못한다. 브라우저 저장소 삭제·추적 차단·SDK 실패에 따른 누락이 있으며, 업무 DB의 요청 건수와 동일한 감사 지표가 아니다. 기간 끝부분에 진입한 사용자는 다음 단계에 도달할 시간이 짧다는 점도 함께 해석한다.

## 구현과 이벤트

전송 경계는 `lib/analytics/funnel.ts`, 노출 중복 억제는 `use-funnel.tsx`다. `STEPS`와 실제 `components/rfp/content-questions.ts`가 단계의 기준이다. 프런트엔드에서 서버 성공 응답을 받은 직후 `sign_up`과 `quote_request_submitted`를 기록한다. 자동 로그인 실패는 가입 실패와 분리한다.

| 이벤트 | 의미 |
|---|---|
| `funnel_step_view` | 실제 단계 노출 |
| `funnel_step_complete` | 검증을 통과한 진행, 건너뛰기 또는 작성 완료 |
| `funnel_step_error` | 검증·서버·네트워크 실패(고정 코드만) |
| `funnel_cta_click` | 로그인/가입 선택 |
| `sign_up` | 구매사 계정 생성 성공. 자동 로그인 성공 여부와 독립 |
| `quote_request_submitted` | 최종 생성 액션 성공. 핵심 이벤트 |

이벤트 범위 맞춤 측정기준은 `funnel_id`, `step_id`, `entry_path`, `contract_type`, `mode`, `progression`, `error_code`다. `entry_path`는 guest/member/direct, 계약 유형은 new/renewal/unknown, 모드는 write/edit이다. `progression=skip`도 정상 완료다. **모든 최초 작성 보고서는 `mode=write`로 제한한다.** 계약 유형을 아직 묻지 않은 앞 질문은 unknown이므로 신규/갱신 비교는 계약 선택 이후 단계 또는 사용자 세그먼트로 한다.

같은 마운트의 Strict Mode·재렌더는 중복 노출시키지 않는다. 뒤로가기, 다른 단계에서 복귀, 새로고침, 실제 재마운트는 다시 기록한다. 성공 요청 키는 사용자별 localStorage 및 메모리로 중복 억제하며 GA에 보내지 않는다. 브라우저/기기 간 전역 exactly-once는 보장하지 않는다. 보고서는 이벤트 횟수 대신 사용자를 센다.

## 개인정보와 실패 처리

답변, 이메일, 전화번호, 사업자번호, 금액, 파일명, 인증 토큰, 원본 오류 문자열을 보내지 않는다. 경로는 정적 허용 목록으로 제한하며 쿼리·해시·견적 ID는 제거한다. 페이지 제목도 정적 경로만 쓴다. 기존 자동 page_view 대신 정제한 page_view를 전송한다. 허용 목록 밖 페이지는 조회 이벤트를 수집하지 않으며 상세 견적 페이지별 분석은 이 범위에 없다.

유입 소스/매체를 유지하기 위해 초기 GA 설정에는 고정 허용 목록의 UTM source/medium과 알려진 유입 도메인의 origin만 전달한다. 임의 campaign/term/content나 referrer 경로·검색어는 전송하지 않는다. 새로운 캠페인 소스는 `attribution()` 목록에 추가하고 개인정보 테스트를 갱신한다. 알 수 없는 유입처는 세부 식별을 잃을 수 있다.

세션 조회는 랜딩 헤더와 SWR `/api/auth/session` 캐시를 공유한다. 랜딩에 서버 인증 조회를 추가하지 않는다. 세션이 확인되기 전 이벤트를 최대 100개 보류하고, PG/운영계정이면 버린다. 개발·데모·튜토리얼·partner 호스트도 제외한다. 이메일 인증·심사 대기·앱 진입은 확인된 구매사 세션에서만 전송한다. 로그아웃과 워크스페이스 전환은 기존 하드 이동으로 새 세션을 읽으며, 같은 문서는 focus 및 60초 재조회로 갱신한다. 로그아웃 시 User-ID는 null로 해제한다.

SDK 로딩 전에는 표준 dataLayer 인자 큐를 쓴다. 가입/인증 후 하드 이동은 최대 300ms만 기다린다. 저장소·태그 실패가 가입·견적·인증을 막지 않는다. SDK나 세션 조회 실패로 누락된 이벤트는 서버에서 재전송하지 않는다.

## GA4 설정

2026-10-18 운영 확인:

- 속성 `540469131`, 계정 `396924123`, 웹 스트림 `15015369745`.
- 실제 support-b.com 태그와 스트림의 측정 ID가 `G-H01WBFDN4H`로 일치한다.
- 스트림 이름은 `supporter-b`, 등록 URL은 과거 `https://supporter-b.com`이며 측정 ID로 일치 여부를 확인했다. 등록 URL은 이 작업에서 변경하지 않았다.
- 최근 48시간 데이터 수신이 활성화돼 있다. 이는 기존 태그 수신이며 새 퍼널 이벤트 검증을 의미하지 않는다.
- 향상된 측정은 이미 꺼져 있었다. 그대로 유지한다. 자동 폼/검색/페이지 기록을 켜면 URL·입력 정보 정제 경계를 우회할 수 있다.
- 이벤트 범위 맞춤 측정기준 7개를 등록했다(Funnel ID, Funnel step, Funnel entry path, Contract type, Funnel mode, Funnel progression, Funnel error code).
- `quote_request_submitted`를 코드 기반 핵심 이벤트로 등록했다. 기본 금액 없음, 이벤트당 한 번. 퍼널의 집계 단위는 별도로 사용자다.

[속성 관리](https://analytics.google.com/analytics/web/#/a396924123p540469131/admin)에서 측정기준·핵심 이벤트를 확인한다. User-ID를 맞춤 측정기준으로 등록하지 않는다. 보고 ID는 관찰됨 또는 혼합을 사용한다.

## 저장된 탐색

[구매사 퍼널 · 최근 28일](https://analytics.google.com/analytics/web/?authuser=3#/analysis/a396924123p540469131/edit/uXnfFdnnSIq0po1ja5qMAg)에 10개 탭을 저장했다:

- 유입 · 비회원 시작 / 유입 · 기존 회원: 폐쇄형
- 구매사 가입 / 최종 요청: 개방형
- 질문 · 홈페이지 / 판매 정보 / 신규 조건 / 갱신 조건 / 마무리: 개방형
- 심사 대기 → 앱 복귀: 폐쇄형. 미복귀는 아직 대기 중이거나 복귀하지 않은 사용자이며, 관리자 승인 상태 자체를 증명하지 않는다.

모든 탭은 경과 시간 표시와 기기 카테고리 세분화를 사용한다. 첫 사용자 소스·매체와 세션 소스·매체를 변수에 추가했다. 소스/매체 결합 필드 대신 개별 필드로 세분화를 교체한다. 새 이벤트 배포 전이므로 데이터 없음이 정상이다. 개인 탐색으로 저장했으며 속성 전체 공유 권한은 변경하지 않았다.

## 탐색 보고서 작성 절차

탐색 → 유입경로 탐색 분석에서 다음 조건으로 저장한다. 기본 기간 최근 28일, 경과 시간 표시 켜기, 단계 연결은 간접적, 시간 제한 없음. 기기 카테고리와 첫 사용자 소스/매체(유입), 세션 소스/매체(재방문)를 측정기준에 추가하고 분류를 바꿔 비교한다. 자동 기본 템플릿의 first_visit/purchase 단계는 반드시 제거한다.

각 단계는 아래 **이벤트 이름 AND funnel_id AND step_id** 조건을 쓴다. 마지막 요청 성공은 항상 `quote_request_submitted AND request AND submitted`다. 횟수 지표로 이탈률을 계산하지 않는다.

### 구매사 유입 — 로그인 전 시작 (폐쇄형)

1. view / acquisition / landing
2. view / acquisition / quote_start
3. complete / acquisition / draft_complete
4. cta_click / acquisition / choose_login **OR** choose_signup
5. view / acquisition / member_return
6. quote_request_submitted / request / submitted

위 약칭 view/complete/cta_click은 각각 `funnel_step_view`/`funnel_step_complete`/`funnel_cta_click`이다. 첫 단계부터 시작하는 폐쇄형이며 작성 전 기존 회원의 직접 진입을 이 이탈률에 혼합하지 않는다.

### 기존 회원 (별도 폐쇄형)

landing → request/entry(entry_path=member) → request/business 완료 → request/recommendation 노출 → request/review 노출 → 요청 성공. 신규 가입 없는 경로다.

### 구매사 가입 (개방형)

signup/email 노출 → company 노출 → profile 노출 → phone 완료 → sign_up(account_created) → email_verification 완료 → app_entry 노출.

`approval_pending`은 별도 비교/세그먼트에 추가한다. 모든 계정에서 반드시 거치는 선형 필수 단계로 넣지 않는다. phone 입력은 profile과 한 화면이므로 노출 시각이 같다. 자동 로그인 실패는 signup/auto_login 오류로 확인한다.

### 최종 요청 (개방형)

request/entry → business → recommendation → review → quote_request_submitted. 앞 4단계는 노출 이벤트다. 사업자 확인을 마친 사용자만 비교하려면 business를 완료 이벤트로 교체한다. PC에서는 PG 추천과 최종 확인이 동시에 노출되고 모바일에서는 두 화면으로 나뉜다. PC의 두 단계 간 경과 시간 0과 전환율 100%는 정상이다. 추천 API 대기 중에는 도달로 세지 않는다.

### 질문 상세 (개방형, 구간별)

funnel_id=questions, mode=write. 단계 도달은 view 이벤트를 쓴다. 개별 질문의 완료율은 같은 step_id의 complete 이벤트로 비교하고 progression=skip을 포함한다. 순서는 실제 contentQuestions를 따른다.

- 홈페이지: website → solution → industry (다음 구간 진입 포함)
- 판매 정보: industry → products → sellers → cash → price → sales → delivery → contract
- 신규 계약 조건: contract 완료 → payment → title (각 단계 contract_type=new)
- 갱신 계약 조건: contract 완료 → current-pgs → payment → annual → fee → limit → insurance → cycle → title (각 단계 contract_type=renewal)
- 마무리: title → memo → attachments 노출 → attachments 완료. 실제 저장 완료는 유입 퍼널의 acquisition/draft_complete(공개), 회원의 request/questions 완료로 별도 확인한다.

모든 구간이 GA4의 10단계 제한 안에 있다. 계약 분기 이후를 신규/갱신으로 비교하고 선택 질문 건너뛰기를 이탈로 분류하지 않는다. 직접 진입은 개방형의 중간 진입자로 보인다.

## 배포 후 검증

신규 이벤트는 배포 이후부터 쌓인다. 과거 데이터 백필은 없다. 로컬 dev는 제외되므로 운영 DebugView 검증을 로컬 단위 테스트로 대체하지 않는다.

1. 일반 구매사 테스트 계정과 익명 브라우저에서 Google Analytics Debugger 등 공식 디버그 방식으로 접속한다. 운영계정은 제외된다.
2. 신규/갱신·선택 건너뛰기·수정·뒤로가기·새로고침·가입/로그인·코드/링크 이메일 인증·심사 대기·승인 후 앱 진입·최종 성공의 이벤트 순서와 mode를 확인한다.
3. 요청 실패/재시도에는 성공 1회, 자동 로그인 실패에는 sign_up 이후 auto_login 오류가 표시되는지 본다.
4. 네트워크 수집 요청에서 URL/제목/오류에 개인정보가 없고, 로그인 후 User-ID 및 로그아웃 null 전환이 맞는지 확인한다.
5. 저장된 탐색의 최근 28일·사용자 수·경과 시간·기기/유입 분류를 확인한다. 측정기준은 등록 후 보고서에 반영되기까지 지연될 수 있다.

현재 미완료: 변경 코드의 운영 배포, 새 이벤트 DebugView 실수신과 저장된 보고서의 실제 사용자 집계 검증. 가짜 업무 성공 이벤트를 운영 속성에 주입하지 않는다.

공식 근거: [User-ID](https://developers.google.com/analytics/devguides/collection/ga4/user-id), [gtag 매개변수](https://developers.google.com/tag-platform/gtagjs/reference/parameters), [퍼널 탐색](https://support.google.com/analytics/answer/9327974?hl=en).

## 구현 검증 기록 (2026-10-18)

- 단위 테스트: 863개 파일, 8,769개 통과 / 1개 파일·3개 테스트 기존 skip.
- `pnpm tsc --noEmit`, `pnpm lint` 통과.
- 핵심 E2E: `guest-rfp-intake.spec.ts`, `rfp-create-navigation.spec.ts` 실행. 처음 7/9 통과, 가입 경로 2건 단독 재실행에서 갱신 경로 통과. 최종적으로 고유 시나리오 8/9 통과.
- 신규 가입 교차 기기 복구 시나리오는 미통과: 변경본에서는 복원 후 다음 진행 시 초안 선택 화면이 다시 나타났고, 별도 변경 전 HEAD worktree에서도 같은 시나리오가 로그인 후 `/home`에 머물러 실패했다. 이번 변경의 회귀로 확정하지 않았으며 기존 복구 흐름의 안정성 조사가 필요하다.
- E2E는 기존 3001 포트의 다른 앱을 피하기 위해 3019에서 Webpack 개발 서버로 실행했다. 임시 설정과 기준 코드 worktree는 제거했다.
- 테스트 DB만 재설정했고 운영 가입·견적·승인 데이터를 만들거나 배포하지 않았다.

## 로그인 전 견적의 Slack 연결 (2026-10-20)

[Slack 행동 스레드](GUEST_RFP_SLACK_THREADS.md)는 같은 이벤트·단계 정의를 재사용하지만 수집과 전송은 GA와 독립이다. 익명 증명·서버 소유권으로 초안을 연결하고, GA/Clarity 미로딩에도 허용된 행동을 수집한다. 가입·최종 요청 성공은 서버 결과를 쓰며 화면의 심사 대기·복귀를 실제 승인 시각으로 해석하지 않는다. 개발 환경에서는 GA 전송 없이 내부 수집만 검증할 수 있다.

속성 `540469131`의 [로그인 전 견적 · Slack 사용자 탐색](https://analytics.google.com/analytics/web/#/analysis/a396924123p540469131/edit/cd9F5C6iTDSVJEFjjEWsWw)에서 댓글의 관측 날짜와 client_id·User-ID를 조회한다. 식별자는 공식 gtag get으로 취득하며 개별 사용자 딥링크를 추측하지 않는다. 보고서는 생성 계정 소유이고 추가 공유 여부는 GA 설정에 따른다.
