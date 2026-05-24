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

  it('on switch: pushes ?view=board preserving other params and writes the cookie', async () => {
    const user = userEvent.setup();
    render(<BoardViewToggle view="table" cookieName="rfpBoardView" />);
    await user.click(screen.getByRole('tab', { name: '칸반' }));
    expect(push).toHaveBeenCalledTimes(1);
    const url = push.mock.calls[0][0] as string;
    expect(url).toContain('view=board');
    expect(url).toContain('status=active');
    expect(document.cookie).toContain('rfpBoardView=board');
  });
});
