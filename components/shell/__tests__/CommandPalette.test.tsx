import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// cmdk reads ResizeObserver on mount; jsdom doesn't implement it.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
// cmdk scrolls the active item into view; jsdom doesn't implement it.
Element.prototype.scrollIntoView = vi.fn();

vi.mock('@/lib/server/actions/search/searchBidsAction', () => ({
  searchBidsAction: () => Promise.resolve([]),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { CommandPalette } from '../CommandPalette';
import { useUIStore } from '@/lib/stores/ui';

afterEach(() => {
  useUIStore.setState({ commandPaletteOpen: false });
});

describe('CommandPalette shortcut hint', () => {
  it('shows G and C keycaps for the new-RFP command (G then C chord, platform-independent)', () => {
    useUIStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette />);
    expect(screen.getByText('G')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });
});
