import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const { mockIsMac } = vi.hoisted(() => ({ mockIsMac: { value: false } }));

vi.mock('@/lib/hooks/usePlatform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hooks/usePlatform')>()),
  useIsMac: () => mockIsMac.value,
}));

import { ShortcutHint } from '../ShortcutHint';

afterEach(() => {
  cleanup();
  mockIsMac.value = false;
});

describe('ShortcutHint — chord', () => {
  it('renders the lead "G" and the uppercased second key as two keycaps', () => {
    render(<ShortcutHint shortcut={{ kind: 'chord', lead: 'g', key: 'h' }} />);
    expect(screen.getByText('G')).toBeInTheDocument();
    expect(screen.getByText('H')).toBeInTheDocument();
  });
});

describe('ShortcutHint — modifier', () => {
  it('renders Ctrl and key as separate keycaps on non-Mac', () => {
    mockIsMac.value = false;
    render(<ShortcutHint shortcut={{ kind: 'modifier', key: 'K' }} />);
    expect(screen.getByText('Ctrl')).toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
  });

  it('renders ⌘ and key as separate keycaps on Mac', () => {
    mockIsMac.value = true;
    render(<ShortcutHint shortcut={{ kind: 'modifier', key: 'K' }} />);
    expect(screen.getByText('⌘')).toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
  });
});
