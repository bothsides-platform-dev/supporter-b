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
 *
 * 이 배선(쓰는 쪽이 정말 이 상수들을 쓰는지)은 `__tests__/sidebar-cookie-wiring.test.ts`
 * 가 소스를 읽어 못박는다. 값만 비교하는 테스트로는 vendored 원본이 되살아나
 * 로컬 상수로 되돌아간 걸 못 잡는다.
 */
export const SIDEBAR_COOKIE_NAME = 'sidebar_state';

/**
 * 1년.
 *
 * 갱신이 토글할 때만 일어나는 슬라이딩 윈도우라, 짧게 잡으면 **한 번 접어두고
 * 그대로 잘 쓰는 사용자** — 즉 이 기능이 가장 잘 맞은 사용자 — 의 설정이 조용히
 * 풀린다. 원래 shadcn 기본값인 7일이었는데 그 실패 모드가 그대로였다.
 */
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * 사이드바 토글 단축키(⌘/Ctrl + 이 키). 소문자 = KeyboardEvent.key 비교값이고,
 * 화면 표기는 호출부가 대문자로 올린다.
 *
 * 세 곳이 이 값을 공유한다 — 실제로 토글하는 핸들러(`components/ui/sidebar.tsx`),
 * 단축키를 광고하는 헤더 툴팁(`components/shell/ShellSidebarTrigger.tsx`), 랜딩
 * 데모에서 이걸 삼키는 차단막(`components/landing/demo-app/use-block-sidebar-shortcut.ts`).
 * 따로 들고 있으면 키를 바꿨을 때 툴팁이 죽은 키를 안내하거나 데모가 엉뚱한 키를
 * 막는데, 셋 다 조용하다.
 */
export const SIDEBAR_TOGGLE_KEY = 'b';

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
