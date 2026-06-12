import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
const mockPathname = vi.fn(() => '/rfp');
const mockSearchParams = vi.fn(() => new URLSearchParams('status=active'));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => mockPathname(),
  useSearchParams: () => mockSearchParams(),
}));

import { BoardViewToggle } from '../BoardViewToggle';

beforeEach(() => {
  push.mockClear();
  mockPathname.mockReturnValue('/rfp');
  mockSearchParams.mockReturnValue(new URLSearchParams('status=active'));
  document.cookie = 'rfpBoardView=; max-age=0; path=/';
});
afterEach(() => cleanup());

describe('BoardViewToggle', () => {
  it('renders 표/칸반 tabs with the active one selected', () => {
    render(<BoardViewToggle view="table" cookieName="rfpBoardView" tableCount={3} />);
    expect(screen.getByRole('tab', { name: /표/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '칸반' })).toHaveAttribute('aria-selected', 'false');
  });

  it('보드 전환: status 는 컬럼과 중복이므로 지우고, 쿠키를 쓴다', async () => {
    // 보드 뷰는 status 칩을 숨기므로 잔류 status 파라미터가 보이지 않는 필터로
    // 남는다 — 전환 시 함께 제거한다.
    const user = userEvent.setup();
    mockSearchParams.mockReturnValue(new URLSearchParams('status=active&deadline=d7'));
    render(<BoardViewToggle view="table" cookieName="rfpBoardView" />);
    await user.click(screen.getByRole('tab', { name: '칸반' }));
    expect(push).toHaveBeenCalledTimes(1);
    const url = push.mock.calls[0][0] as string;
    expect(url).toContain('view=board');
    expect(url).not.toContain('status=');
    expect(url).toContain('deadline=d7');
    expect(document.cookie).toContain('rfpBoardView=board');
  });

  it('표 전환: status 를 보존한다', async () => {
    const user = userEvent.setup();
    render(<BoardViewToggle view="board" cookieName="rfpBoardView" />);
    await user.click(screen.getByRole('tab', { name: /표/ }));
    const url = push.mock.calls[0][0] as string;
    expect(url).toContain('view=table');
    expect(url).toContain('status=active');
  });
});
