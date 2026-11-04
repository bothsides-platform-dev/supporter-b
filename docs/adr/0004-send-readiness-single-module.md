---
status: accepted
---

# 발송 가능 판정을 한 module 로 둔다

"견적 요청을 PG에 보내려면 무엇이 더 필요한가"는 위저드 단계 상태(`components/rfp/wizard-validation.ts`), 질문 흐름의 질문별 완료(`components/rfp/content-questions.ts`), 서버 입력 스키마(`lib/rfp/intake/schema.ts`)가 각자 서술했고 문구도 세 벌이었다. 같은 predicate(`lib/rfp/required-fields.ts`)를 공유해도 조합·순서·신규/갱신 분기가 네 곳에 흩어져 필드 하나를 바꾸면 네 파일을 함께 고쳤다(PR #827). 이제 `lib/rfp/send-readiness.ts` 의 규칙표 하나가 미충족 목록(규칙·단계·질문 id·스키마 경로·문구)을 돌려주고 세 소비자는 그 목록만 읽는다. 필드 단위 predicate 는 `required-fields.ts` 에 그대로 두고 조합만 올렸다. 묶음 화면(랜딩·튜토리얼)이 받지 않는 질문 흐름 전용 입력(판매 정보·현재 PG)은 규칙표가 표시하고 단계 게이트가 걸러 낸다. 단계 3(마감·PG)은 영업일 달력과 추천 후보를 봐야 하므로 서버 스키마는 단계 2만 받고 `RfpService.createRfp` 의 파싱 게이트(판매 정보·업종·현재 PG)는 두 번째 호출 경로(게스트 자동 발송)를 위해 그대로 둔다. 서버 파싱(`lib/rfp/intake/parse.ts`)은 스키마 이슈의 `params.rule` 로 종전 서비스 오류 코드(`MATCHING_REQUIRED`·`CURRENT_PGS_REQUIRED`)를 유지한다.
