import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/rfp',
  useSearchParams: () => new URLSearchParams('peek=P-2605-0042&status=active'),
}));

import { PeekBackdrop } from '@/components/ui/peek-backdrop';

afterEach(() => {
  cleanup();
  mockReplace.mockClear();
});

describe('PeekBackdrop', () => {
  it('클릭 시 peek 파라미터를 제거하고 나머지 쿼리는 유지한 채 replace', async () => {
    const user = userEvent.setup();
    const { container } = render(<PeekBackdrop />);
    const scrim = container.firstChild as HTMLElement;
    await user.click(scrim);
    expect(mockReplace).toHaveBeenCalledWith('/rfp?status=active');
  });

  it('스크림은 절대 위치 오버레이로 렌더', () => {
    const { container } = render(<PeekBackdrop />);
    const scrim = container.firstChild as HTMLElement;
    expect(scrim.className).toContain('absolute');
    expect(scrim).toHaveAttribute('aria-hidden');
  });
});
