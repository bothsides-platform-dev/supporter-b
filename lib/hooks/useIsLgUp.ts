import { createMinWidthHook } from './useMinWidth';

/** 뷰포트 폭이 lg(1024px) 이상인지. 딜룸이 채팅을 aside(lg+) vs 하단 시트(<lg)로 가를 때 사용. */
export const useIsLgUp = createMinWidthHook(1024);
