/**
 * 전자계약(e-contract) 런치 게이트.
 *
 * 마스터 계정에만 프론트 노출한다 — 오픈게시판 kill switch(`lib/features/open-board.ts`)와
 * 동일한 패턴의 "사용자 스코프" 버전. `OPEN_BOARD_ENABLED` 는 전역 boolean 이지만 이건
 * 뷰어 단위 판정이 필요해 함수로 둔다: `E_CONTRACT_ALL=1` 이면 전체 공개, 아니면 세션의
 * `isMaster` 뷰어에게만 보인다.
 *
 * 새 노출 surface 를 추가할 때 이 함수를 반드시 참조하세요. 누락은
 * `lib/features/__tests__/e-contract-flag.test.ts` 드리프트 가드가 잡습니다.
 */
export function isEContractVisible(opts: { isMaster: boolean }): boolean {
  return process.env.E_CONTRACT_ALL === '1' || opts.isMaster;
}
