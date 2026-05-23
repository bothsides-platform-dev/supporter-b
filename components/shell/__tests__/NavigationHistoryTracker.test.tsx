import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

const mockPathname = vi.fn(() => '/home');
const mockSearchParams = vi.fn(() => new URLSearchParams(''));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useSearchParams: () => mockSearchParams(),
}));

import { NavigationHistoryTracker } from '../NavigationHistoryTracker';
import { useNavHistoryStore } from '@/lib/stores/nav-history';

beforeEach(() => {
  useNavHistoryStore.getState().reset();
  mockPathname.mockReturnValue('/home');
  mockSearchParams.mockReturnValue(new URLSearchParams(''));
});

describe('NavigationHistoryTracker', () => {
  it('renders nothing', () => {
    const { container } = render(<NavigationHistoryTracker />);
    expect(container).toBeEmptyDOMElement();
    cleanup();
  });

  it('seeds the store with the current url (pathname + search) on mount', () => {
    mockPathname.mockReturnValue('/rfp');
    mockSearchParams.mockReturnValue(new URLSearchParams('status=active'));
    render(<NavigationHistoryTracker />);
    expect(useNavHistoryStore.getState().entries).toEqual(['/rfp?status=active']);
    expect(useNavHistoryStore.getState().index).toBe(0);
    cleanup();
  });

  it('pushes a new entry when the pathname changes', () => {
    const { rerender } = render(<NavigationHistoryTracker />); // /home
    mockPathname.mockReturnValue('/rfp');
    rerender(<NavigationHistoryTracker />);
    expect(useNavHistoryStore.getState().entries).toEqual(['/home', '/rfp']);
    expect(useNavHistoryStore.getState().index).toBe(1);
    cleanup();
  });

  it('treats a navigation after a popstate as back/forward, not a push', () => {
    const { rerender } = render(<NavigationHistoryTracker />); // /home
    mockPathname.mockReturnValue('/rfp');
    rerender(<NavigationHistoryTracker />); // push -> [/home, /rfp], index 1
    window.dispatchEvent(new PopStateEvent('popstate'));
    mockPathname.mockReturnValue('/home');
    rerender(<NavigationHistoryTracker />); // viaPop back -> index 0, no new entry
    expect(useNavHistoryStore.getState().entries).toEqual(['/home', '/rfp']);
    expect(useNavHistoryStore.getState().index).toBe(0);
    cleanup();
  });

  it('resets the store on unmount', () => {
    const { unmount } = render(<NavigationHistoryTracker />);
    expect(useNavHistoryStore.getState().entries).toEqual(['/home']);
    unmount();
    expect(useNavHistoryStore.getState().entries).toEqual([]);
  });
});
