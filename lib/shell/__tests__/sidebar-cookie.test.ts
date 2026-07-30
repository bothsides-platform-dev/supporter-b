import { describe, it, expect } from 'vitest';
import {
  SIDEBAR_COOKIE_NAME,
  SIDEBAR_COOKIE_MAX_AGE,
  parseSidebarOpenCookie,
} from '../sidebar-cookie';

describe('parseSidebarOpenCookie', () => {
  it('접힘으로 저장된 값만 접힘으로 읽는다', () => {
    expect(parseSidebarOpenCookie('false')).toBe(false);
  });

  it('펼침으로 저장된 값은 펼침으로 읽는다', () => {
    expect(parseSidebarOpenCookie('true')).toBe(true);
  });

  // 처음 방문한 사용자는 쿠키가 없다 — 사이드바는 펼쳐진 상태로 시작한다.
  it('쿠키가 없으면 펼침이 기본이다', () => {
    expect(parseSidebarOpenCookie(undefined)).toBe(true);
  });

  // 손상·조작된 값에 접힘으로 반응하면 사용자가 이유 없이 좁은 화면을 만난다.
  // 알아볼 수 없는 값은 기본값(펼침)으로 되돌린다.
  it.each(['', 'FALSE', '0', 'nope'])('알 수 없는 값 %o 은 펼침으로 되돌린다', (value) => {
    expect(parseSidebarOpenCookie(value)).toBe(true);
  });
});

describe('sidebar cookie 상수', () => {
  // 이 값들은 클라이언트 쓰기(components/ui/sidebar.tsx SidebarProvider)와
  // 서버 읽기(app/(app)/layout.tsx)가 공유한다 — 이름이 갈리면 쓴 쿠키를
  // 아무도 못 읽는 상태로 조용히 되돌아간다(이 모듈이 생긴 이유).
  it('쿠키 이름과 보관 기간을 고정한다', () => {
    expect(SIDEBAR_COOKIE_NAME).toBe('sidebar_state');
    expect(SIDEBAR_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 7);
  });
});
