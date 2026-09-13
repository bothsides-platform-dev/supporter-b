/**
 * PG 딜룸 딥링크 — 알림·메일이 딜룸의 특정 탭을 열 때 쓰는 링크의 단일 출처.
 *
 * PG 딜룸은 계약이 있어도 항상 `요청 조건` 탭으로 열린다(`PgDealRoomBody`). 계약·재요청처럼
 * "지금 할 일"로 부르는 알림이 bare 링크를 쓰면 그 일이 없는 탭에 떨어지므로 `?tab=` 으로
 * 탭을 지정한다. 만드는 쪽(서비스·메일 템플릿 입력)과 읽는 쪽(`app/(app)/inbox/[rfpId]`
 * 페이지·인터셉트 모달)이 같은 키·같은 값을 써야 딥링크가 살므로 여기서만 만든다.
 *
 * 받아들이는 값은 딥링크 대상 탭 둘뿐이다 — 요청 조건은 기본 탭이라 링크가 필요 없고,
 * 모르는 값은 버려 기본 탭으로 연다. 계약 탭이 실제로 있는지(봉인 경계)는 읽는 쪽 화면이
 * 판정한다: 링크는 요청일 뿐 권한이 아니다.
 */
export const PG_DEAL_ROOM_TAB_QUERY_KEY = 'tab';

const LINK_TABS = ['contract', 'write'] as const;
export type PgDealRoomLinkTab = (typeof LINK_TABS)[number];

export function pgDealRoomLink(rfpCode: string, tab?: PgDealRoomLinkTab): string {
  const path = `/inbox/${rfpCode}`;
  return tab ? `${path}?${PG_DEAL_ROOM_TAB_QUERY_KEY}=${tab}` : path;
}

/** 쿼리 값 → 딥링크 탭. 반복 키(배열)는 첫 값만 보고, 모르는 값은 undefined. */
export function parsePgDealRoomTab(
  value: string | string[] | undefined,
): PgDealRoomLinkTab | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return LINK_TABS.find((t) => t === first);
}
