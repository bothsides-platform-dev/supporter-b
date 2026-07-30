/**
 * 사이드바 접힘 상태를 새로고침 너머로 잇는 쿠키의 단일 출처.
 *
 * 쓰는 쪽은 클라이언트(`components/ui/sidebar.tsx` 의 `SidebarProvider.setOpen`),
 * 읽는 쪽은 서버(`app/(app)/layout.tsx` → `AppSidebarLayout defaultSidebarOpen`)다.
 * 양쪽이 각자 이름을 들고 있으면 한쪽만 바뀌었을 때 "쓰기는 되는데 아무도 읽지
 * 않는" 상태로 조용히 되돌아간다 — 실제로 그 상태였고, 그래서 여기로 모았다.
 * (`lib/theme/canvas-colors.ts` 와 같은 이유·같은 패턴.)
 *
 * 서버에서 읽으므로 첫 페인트부터 접힌 폭으로 그려진다 — 펼쳤다 접히는 깜빡임이 없다.
 */
export const SIDEBAR_COOKIE_NAME = 'sidebar_state';

/** 7일. 그 뒤로는 기본값(펼침)으로 돌아간다. */
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

/**
 * 쿠키 값 → 사이드바 펼침 여부.
 *
 * 접힘(`'false'`)만 정확히 일치할 때 접는다. 쿠키가 없거나(첫 방문) 값이 손상·
 * 조작됐으면 기본값인 펼침으로 되돌린다 — 알 수 없는 값에 접힘으로 반응하면
 * 사용자가 이유 없이 좁아진 화면을 만난다.
 */
export function parseSidebarOpenCookie(value: string | undefined): boolean {
  return value !== 'false';
}
