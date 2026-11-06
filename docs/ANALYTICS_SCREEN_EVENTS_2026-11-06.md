# 화면별 GA 이벤트

화면의 주황색 번호는 버튼 위치입니다. 괄호는 `funnel_id / step_id`입니다. 화면은 예시 데이터이며, 이벤트 조건은 코드 확인 기준입니다.

| 화면 | 핵심 이벤트·발생 조건 |
| --- | --- |
| **01 견적 질문**<br>![견적 질문](screenshots/analytics-events-2026-11-06/01-question.jpg) | 표시 → `funnel_step_view` (`questions / solution` 예시)<br>① 건너뛰기 → `funnel_step_complete`, `progression=skip`<br>② 다음 검증 통과 → `funnel_step_complete`, `progression=next`<br>추적이 연결된 검증 오류 → `funnel_step_error` |
| **02 계약 유형**<br>![계약 유형](screenshots/analytics-events-2026-11-06/02-contract.jpg) | 표시 → `funnel_step_view`<br>③ 다음 검증 통과 → `funnel_step_complete` (`questions / contract`)<br>`contract_type`: ① 신규 = `new`, ② 갱신 = `renewal`, 미선택·값 미전달 = `unknown`<br>선택 카드 자체의 클릭 이벤트는 없음 |
| **03 비회원 답변 수정**<br>![답변 수정](screenshots/analytics-events-2026-11-06/03-edit.jpg) | 표시 → `funnel_step_view`<br>① 수정 완료 검증 통과 → `funnel_step_complete`<br>`questions / solution`, `mode=edit`<br>명시적인 답변 수정 흐름은 `edit`. 일반 작성·이전 이동·회원 작성은 기본 `write` |
| **04 작성 마치기**<br>![작성 마치기](screenshots/analytics-events-2026-11-06/04-finish.jpg) | 표시 → `funnel_step_view` (`questions / attachments`)<br>① 작성 마치기 검증 통과 → `funnel_step_complete` (`questions / attachments`)<br>비회원 초안 저장 성공 → `funnel_step_complete` (`acquisition / draft_complete`)<br>초안 저장은 상담 요청 발송과 다름 |
| **05 가입 이메일**<br>![가입 이메일](screenshots/analytics-events-2026-11-06/05-email.jpg) | 표시 → `funnel_step_view` (`signup / email`)<br>① 다음 검증 통과 → `funnel_step_complete` (`signup / email`)<br>② 로그인: 비회원 이어쓰기 경유 시 → `funnel_cta_click` (`acquisition / choose_login`) |
| **06 회사 정보**<br>![회사 정보](screenshots/analytics-events-2026-11-06/06-company.jpg) | 표시 → `funnel_step_view`<br>① 워크스페이스 만들기 검증 통과 → `funnel_step_complete`<br>`signup / company` |
| **07 담당자·휴대전화**<br>![담당자 정보](screenshots/analytics-events-2026-11-06/07-profile.jpg) | 표시 → `funnel_step_view` (`signup / profile·phone`)<br>① 이후 휴대전화 인증 성공 → `funnel_step_complete` (`phone`)<br>② 가입 완료 검증 통과 → `funnel_step_complete` (`profile`)<br>계정 생성 성공 → `sign_up`<br>연결된 가입·인증 오류 → `funnel_step_error` |
| **08 이메일 인증**<br>![이메일 인증](screenshots/analytics-events-2026-11-06/08-verify.jpg) | 표시 → `funnel_step_view`<br>① 코드·링크 인증 완료 확인 후 진행 → `funnel_step_complete`<br>`signup / email_verification`<br>② 인증 메일 재전송 전용 이벤트 없음 |
| **09 승인 대기**<br>![승인 대기](screenshots/analytics-events-2026-11-06/09-approval.jpg) | 표시 → `funnel_step_view` (`signup / approval_pending`)<br>관리자 승인 완료 이벤트는 아님 |
| **10 회원 사업자 정보**<br>![회원 사업자 정보](screenshots/analytics-events-2026-11-06/10-business.jpg) | 표시 → `funnel_step_view`<br>① 다음 검증 통과 → `funnel_step_complete`<br>`request / business` |
| **11 최종 상담 요청**<br>![최종 상담 요청](screenshots/analytics-events-2026-11-06/11-review.jpg) | 표시 → `funnel_step_view` (`request / recommendation·review`)<br>② 상담 요청 처리 시작 → `funnel_cta_click` (`request / review`)<br>요청 성공 → `quote_request_submitted`<br>요청 오류 → `funnel_step_error`<br>① PG 선택 전용 이벤트 없음 |
| **12 비회원 추천 결과**<br>![비회원 추천 결과](screenshots/analytics-events-2026-11-06/12-guest.jpg) | ① 가입하고 이어갈게요 → `funnel_cta_click` (`acquisition / choose_signup`)<br>PG 선택·로그인 링크 전용 클릭 이벤트 없음 |
| **13 비회원 자동 요청**<br>![비회원 자동 요청](screenshots/analytics-events-2026-11-06/13-automatic.jpg) | ① 선택한 PG사에 자동 요청하기 → `funnel_cta_click` (`acquisition / choose_signup`)<br>실제 자동 발송 완료 전용 GA 이벤트 없음 |
| **14 메인 랜딩**<br>![메인 랜딩](screenshots/analytics-events-2026-11-06/14-landing.jpg) | 표시 → `page_view` + `funnel_step_view` (`acquisition / landing`)<br>견적 받기 버튼 전용 클릭 이벤트 없음 |
| **15 UTM 도구 상단**<br>![UTM 도구 상단](screenshots/analytics-events-2026-11-06/15-insights-utm.jpg) | 최적 PG찾기 → `main_site_click`<br>복사 성공 → `utm_tool_action`, `action=copy`<br>템플릿 적용 → `utm_tool_action`, `action=template_apply` |
| **16 UTM 도구 하단**<br>![UTM 도구 하단](screenshots/analytics-events-2026-11-06/16-insights-actions.jpg) | 도구 공유 성공 → `utm_tool_action`, `action=share`<br>서포트비 알아보기·서포트비 홈 → `main_site_click` |

공통 `session_start`는 새 세션 시작 시 GA가 자동 수집합니다. 특정 버튼 클릭 이벤트가 아닙니다. 공통 페이지·세션 이벤트의 반복 표기는 생략했습니다.

운영 수신 확인(2026-10-09~11-05): 정의된 10종 중 7종 관측. `quote_request_submitted`, `docs_main_arrival`, `utm_tool_action`은 해당 기간 미관측이며, 미관측만으로 오류라고 판단하지 않습니다. 상세 근거는 [전체 이벤트 목록](ANALYTICS_EVENT_INVENTORY_2026-11-06.md)을 참고하세요.
