import { createMinWidthHook } from './useMinWidth';

/** 뷰포트 폭이 xl(1280px) 이상인지. 메시지 페이지 3-컬럼 전환 기준. */
export const useIsXlUp = createMinWidthHook(1280);
