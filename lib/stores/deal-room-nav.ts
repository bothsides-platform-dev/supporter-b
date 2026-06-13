import { create } from 'zustand';

/**
 * 딜룸 모달의 이전/다음(‹ ›) 내비게이션 컨텍스트.
 *
 * 목록 페이지(RfpListTable / InboxList)가 현재 정렬 순서의 코드 배열 + 베이스
 * 경로를 시드하고, DealRoomModal 이 현재 코드의 인덱스에서 prev/next 를 계산해
 * 같은 세그먼트로 router.replace 한다(인터셉트 → 모달 교체). 목록 컨텍스트가
 * 없으면(직접 진입) codes 가 비어 ‹ › 는 비활성된다.
 */
type DealRoomNavState = {
  /** '/rfp' | '/inbox' — prev/next 이동 시 경로 접두. */
  basePath: string;
  /** 정렬된 RFP 코드 순서. */
  codes: string[];
  setOrder: (basePath: string, codes: string[]) => void;
};

export const useDealRoomNav = create<DealRoomNavState>((set) => ({
  basePath: '',
  codes: [],
  setOrder: (basePath, codes) => set({ basePath, codes }),
}));
