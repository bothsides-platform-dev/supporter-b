/**
 * 계약서 템플릿(PG 재사용 서식) 임시 kill switch.
 *
 * 다시 켜려면 이 값만 `true` 로 바꿔 배포하세요 — 다른 파일은 손대지 않습니다.
 * UI-only 차단이라 서버 액션·레포·스키마는 그대로 → 켜는 즉시 그동안 저장한
 * 템플릿과 견적에 걸어 둔 연결(`bids.signing_template_id`)이 그대로 돌아옵니다.
 *
 * 끄면 사라지는 표면: 사이드바·⌘K 팔레트·`G`→`C` 단축키, `/contract-templates`
 * 페이지(준비중 안내로 대체), 견적 작성 4단계 템플릿 피커, 딜룸 계약 탭의
 * '연결된 템플릿으로 보내기' 지름길.
 *
 * 새 노출 surface 를 추가하면 이 플래그를 참조하고 드리프트 가드
 * (`lib/features/__tests__/contract-templates-flag.test.ts`)의 SURFACES 에도 넣으세요.
 * 그 가드는 **등록된 게이트가 사라지는 것**만 잡습니다 — 목록에 없는 새 표면은
 * 못 잡으니, 표면을 늘릴 때 SURFACES 갱신은 사람이 해야 합니다.
 *
 * 타입을 `boolean` 으로 명시한 건 의도적입니다 — `false` 리터럴로 좁혀지면
 * `if (CONTRACT_TEMPLATES_ENABLED)` 분기가 dead-code 로 취급돼 lint 에 걸립니다.
 *
 * re-enable 시 주의: `*.contract-templates.test.*` 파일(off-branch 회귀 테스트)이 빨개집니다.
 * `true` 로 바꿀 때는 해당 파일들을 삭제하고, 기존 테스트의 `vi.mock('.../contract-templates', …true)` 행도 제거하세요.
 */
export const CONTRACT_TEMPLATES_ENABLED: boolean = false;
