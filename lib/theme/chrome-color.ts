import { CANVAS_COLOR } from './canvas-colors';

/** 스크립트가 소유하는 theme-color 태그의 표식 — Next/React 가 만든 태그와 구별한다. */
export const CHROME_COLOR_META_ATTR = 'data-chrome-sync';

/**
 * 실효 테마에 맞춰 브라우저 크롬 색(`<meta name="theme-color">`)을 갱신한다.
 *
 * `app/layout.tsx` 의 정적 `viewport.themeColor` 는 `prefers-color-scheme`(OS 설정)으로만
 * 분기하므로, 인앱 토글로 OS 와 다른 테마를 고르면 캔버스는 다크인데 모바일 상태바는
 * 라이트로 남는다. 이 함수가 그 간극을 닫는다.
 *
 * **방식: media 없는 태그 하나를 `<head>` 맨 앞에 만들어 소유한다.**
 * HTML 은 "tree order 상 media 가 매치되는 **첫** theme-color 태그"를 쓴다. media 가 없는
 * 태그는 항상 매치되므로, 맨 앞에 두면 뒤따르는 Next 의 media 스코프 태그 두 개를 항상 이긴다.
 * 그 둘은 손대지 않은 채 JS 이전 첫 페인트·무JS 환경의 OS 기준 폴백으로 남는다.
 *
 * 처음에는 Next 의 두 태그를 직접 덮어썼는데, **React 가 하이드레이션에서 서버 렌더 값과
 * 다른 태그를 매칭하지 못해 같은 name 의 태그를 하나 더 끼워 넣었다**(e2e 에서 3개 관측:
 * 우리가 덮은 light/dark 두 개 + React 가 되살린 light 하나). 그 잉여 태그는 우리 값보다
 * 뒤에 오긴 하지만 스테일이라, 애초에 React 가 소유한 노드를 건드리지 않는 편이 옳다.
 * 우리 태그는 React 트리 밖에서 만들어지므로 리렌더·중복 대상이 아니다.
 */
export function syncChromeColor(resolved: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return;

  let meta = document.head.querySelector<HTMLMetaElement>(`meta[${CHROME_COLOR_META_ATTR}]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute(CHROME_COLOR_META_ATTR, '');
    // 맨 앞이어야 "첫 매치" 규칙에서 이긴다.
    document.head.insertBefore(meta, document.head.firstChild);
  }
  meta.setAttribute('content', CANVAS_COLOR[resolved]);
}
