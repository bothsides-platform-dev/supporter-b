import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockReplace = vi.fn();
const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => '/rfp',
  useSearchParams: () => new URLSearchParams('peek=P-2605-0042&status=active'),
}));

import { PeekPanelHeader } from '@/components/ui/peek-panel-header';

afterEach(() => {
  cleanup();
  mockReplace.mockClear();
  mockPush.mockClear();
});

describe('PeekPanelHeader', () => {
  it('rfpCode를 monospace로 표시', () => {
    render(<PeekPanelHeader rfpCode="P-2605-0042" fullscreenHref="/rfp/P-2605-0042" />);
    expect(screen.getByText('P-2605-0042')).toBeInTheDocument();
  });

  it('닫기 버튼 클릭 시 peek 파라미터만 제거(다른 파라미터 유지)', async () => {
    const user = userEvent.setup();
    render(<PeekPanelHeader rfpCode="P-2605-0042" fullscreenHref="/rfp/P-2605-0042" />);
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(mockReplace).toHaveBeenCalledWith('/rfp?status=active');
  });

  it('전체화면 버튼 클릭 시 fullscreenHref로 push', async () => {
    const user = userEvent.setup();
    render(<PeekPanelHeader rfpCode="P-2605-0042" fullscreenHref="/rfp/P-2605-0042" />);
    await user.click(screen.getByRole('button', { name: '전체화면' }));
    expect(mockPush).toHaveBeenCalledWith('/rfp/P-2605-0042');
  });
});
