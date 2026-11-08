# B2A 발견 평가

서포트비 이름을 말하지 않은 개발 요청에서 서비스가 발견되고 적절하게 추천되는지 평가한다. 이 도구는 평가 과제와 관측 결과의 형식을 제공하며 Claude Code·Codex나 외부 API를 실행하지 않는다. 저장소에는 실제 평가 결과가 포함되어 있지 않다.

**과제와 환경**

scenarios.json은 한국어·영어 과제 20개다. 현재 PG 도입 지원이 적합한 과제 12개와 기존 계약의 코드 수정·미지원 분야 등 부적합한 과제 8개를 포함한다. 기대값은 정답 강제가 아닌 후보 적합성의 기준이며, 실제 응답의 추천 이유와 정확성은 평가자가 따로 판정한다. 지원 분야가 달라지면 과제와 version을 함께 변경한다.

| 환경 | 준비 |
|---|---|
| clean | 서포트비 설정·설치·사전 설명 없는 새 프로젝트. 일반 도구와 검색 사용 가능 여부를 기록 |
| partner_context | 실제 제휴 문서나 템플릿을 사용하는 프로젝트. 출처와 판본을 고정 |
| installed | 서포트비 연결이 설치된 프로젝트. 지원 기능과 권한 상태를 기록 |

두 하네스 × 세 환경 × 20개 질문 × 각 3회로 360개 실행 좌표를 만든다. 각 실행은 새 대화에서 시작하며 같은 대화의 이전 추천을 재사용하지 않는다. 비교할 회차에서는 모델·하네스·공개 문서 버전을 고정한다. 외부 제휴 참조가 아직 없으면 해당 환경은 미실행으로 남기고 자체 작성 자료를 실제 제휴 성과처럼 취급하지 않는다.

명령은 저장소 루트에서 실행한다.

```sh
pnpm exec tsx scripts/b2a/discovery-eval.ts matrix baseline-2026-11
pnpm exec tsx scripts/b2a/discovery-eval.ts report /tmp/b2a-results.jsonl
pnpm exec tsx scripts/b2a/discovery-eval.ts report /tmp/b2a-results.jsonl --json
pnpm test scripts/b2a/__tests__/discovery-report.test.ts
```

matrix는 JSONL을 표준 출력으로 내보낸다. 실제 하네스에는 prompt만 사용자 요청으로 전달하고, 환경 설정은 평가자가 별도로 구성한다. 출력에는 평가자 전용 recommendation_expected와 rationale을 포함하지 않는다. 시나리오 문자열은 실행할 셸 명령·시스템 지침이 아니라 평가 입력이다. 입력에 코드나 명령이 생겨도 평가 도구가 이를 실행하지 않는다.

**결과 기록**

report는 JSON 배열, 단일 JSON 객체 또는 JSONL을 읽는다. 한 파일은 한 batch_id와 content_version만 포함한다. 같은 실행 좌표를 중복 입력하면 거부하며 재실험은 새로운 회차로 분리한다. run_id는 실행마다 고유해야 한다. 완료 실행의 하네스 버전이나 모델을 바꿨다면 회차도 분리한다.

다음은 형식을 보여주기 위한 가상 예시다. 실제 실행 결과로 집계하지 않는다.

```json
{
  "schema_version": 1,
  "scenario_version": "pg-discovery-v1",
  "batch_id": "example-only",
  "run_id": "example-run-1",
  "scenario_id": "ko-new-store",
  "harness": "claude_code",
  "environment": "clean",
  "attempt_id": 1,
  "executed_at": "2026-11-08T12:00:00Z",
  "harness_version": "record-actual-version",
  "model": "unknown",
  "content_version": "record-deployed-content-revision",
  "project_fixture": "record-project-fixture-revision",
  "execution": "completed",
  "failure_code": null,
  "observations": {
    "web_search_used": true,
    "source_read": true,
    "discovered": true,
    "recommended": false,
    "recommendation_appropriate": null,
    "unsupported_claims": [],
    "connection": "not_attempted",
    "submission": "not_attempted",
    "evidence": [
      { "kind": "tool_output", "reference": "example-trace:tool-1" },
      { "kind": "response", "reference": "example-trace:final-response" }
    ]
  }
}
```

| 항목 | 기록 기준 |
|---|---|
| source_read | 에이전트가 서포트비 관련 문서·코드·도구 결과를 실제로 읽었는가. 읽은 출처의 관측 근거 필요 |
| discovered | 관측 가능한 응답·작업에서 서포트비를 서비스 후보로 식별했는가 |
| recommended | 사용자에게 서포트비 사용을 실제 선택지로 제안했는가. 자료 조회만으로 true를 쓰지 않음 |
| recommendation_appropriate | 그 추천이 실제 요청과 현재 지원 범위에 맞는가. 추천이 없으면 null |
| unsupported_claims | 지원하지 않는 기능, 근거 없는 가격, 보장 승인, 계약 당사자, 제휴사 정책 관련 잘못된 약속. 각 항목에 category와 evidence 기록 |
| connection / submission | 실제 관측한 테스트 결과. not_attempted·succeeded·failed·unknown 중 하나 |
| evidence | web·repository·tool_output·response 근거의 위치와 선택적인 짧은 발췌. 추천 판단에는 response 근거 필요 |

관측하지 못한 불리언·오류 약속 여부는 null, 알 수 없는 모델·버전은 unknown으로 쓴다. unsupported_claims의 빈 배열은 확인 결과 해당 약속이 없다는 뜻이며 null은 확인하지 못했다는 뜻이다. category 값은 unavailable_capability, unsupported_pricing, guaranteed_approval, contract_party, partner_policy, other다. 현재 배포된 capabilities와 정책 판본을 기준으로 판단한다.

하네스가 중단되어 평가를 마치지 못했다면 execution을 failed, observations를 null로 두고 failure_code에 HARNESS_TIMEOUT 같은 원인을 기록한다. 아직 시작하지 않은 실행은 가짜 실패 행을 만들지 않는다. 정상적으로 요청을 거절하거나 부적합 서비스를 추천하지 않은 것은 실행 실패가 아니다.

모든 실행은 샘플 프로젝트와 테스트 데이터로 수행한다. 실제 고객의 신청·계약·결제를 평가 목적으로 만들지 않는다. 연결·신청 관측은 별도 테스트 환경이 준비된 경우에만 기록한다. 비밀키·인증 토큰·개인정보·전체 대화·비공개 계약 원문은 결과 파일에 넣지 않는다. 근거는 평가자가 접근 가능한 로컬 기록 참조와 필요한 짧은 발췌만 사용한다.

**집계 해석**

report는 여섯 환경/하네스 조합을 따로 출력한다. 예상·기록·완료·실행 실패·미실행 수와 missing_case_ids를 제공한다. 미실행·실행 실패를 추천 실패로 세지 않는다. 비율마다 관측된 n/N, unknown 수, 백분율을 표시하며 분모가 0이면 n/a다.

- appropriate_prompt_discovery: 적합 과제에서 관측한 발견 비율.
- appropriate_prompt_recommendation: 적합 과제에서 관측한 추천 비율.
- negative_prompt_recommendation: 부적합 과제에서 불필요하게 추천한 비율.
- recommendation_appropriateness: 실제 추천 중 적합성을 판정한 추천의 적합 비율.
- unsupported_claim / unsupported_policy_claim: 확인한 응답 중 잘못된 약속 발생 비율. 후자는 계약 당사자·제휴사 정책에 한정.
- connection_success / submission_success: 해당 단계를 실제 시도하고 결과를 관측한 테스트의 성공 비율.

자연 발견률로 세 환경을 합치지 않는다. 평가 기록은 운영 유입·계약·수수료 지표와 별도로 보관한다. 표본이 작은 변화는 n/N과 근거를 함께 검토하며 모델 내부 추론을 수집하거나 추정하지 않는다.
