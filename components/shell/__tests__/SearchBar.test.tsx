import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const openCommandPalette = vi.fn();
vi.mock('@/lib/stores/ui', () => ({
  useUIStore: (selector?: (s: { openCommandPalette: () => void }) => unknown) => {
    const state = { openCommandPalette };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/lib/hooks/usePlatform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hooks/usePlatform')>()),
  useIsMac: () => false,
}));

import { SearchBar } from '../header/SearchBar';

beforeEach(() => openCommandPalette.mockReset());
afterEach(() => cleanup());

describe('SearchBar', () => {
  it('shows a search placeholder', () => {
    render(<SearchBar />);
    expect(screen.getByText(/검색/)).toBeInTheDocument();
  });

  it('shows Ctrl and K as separate keycaps on non-Mac', () => {
    render(<SearchBar />);
    expect(screen.getByText('Ctrl')).toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
  });

  it('opens the command palette when clicked', async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.click(screen.getByRole('button', { name: /검색/ }));
    expect(openCommandPalette).toHaveBeenCalledTimes(1);
  });
});
