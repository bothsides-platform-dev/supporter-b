import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { RefreshButton } from '../RefreshButton';

afterEach(() => {
  cleanup();
  mockRefresh.mockClear();
});

describe('RefreshButton', () => {
  it('클릭하면 router.refresh()를 호출한다', async () => {
    const user = userEvent.setup();
    render(<RefreshButton />);
    await user.click(screen.getByRole('button', { name: /새로고침/ }));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
