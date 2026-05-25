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

function stubUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: ua,
  });
}

afterEach(() => {
  delete (window.navigator as unknown as Record<string, unknown>).userAgent;
  useUIStore.setState({ commandPaletteOpen: false });
});

describe('CommandPalette shortcut hint', () => {
  it('shows Ctrl and N as separate keycaps for the new-RFP command on non-Mac', () => {
    stubUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    useUIStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette />);
    expect(screen.getByText('Ctrl')).toBeInTheDocument();
    expect(screen.getByText('N')).toBeInTheDocument();
  });

  it('shows ⌘ and N as separate keycaps for the new-RFP command on Mac', () => {
    stubUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    useUIStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette />);
    expect(screen.getByText('⌘')).toBeInTheDocument();
    expect(screen.getByText('N')).toBeInTheDocument();
  });
});
