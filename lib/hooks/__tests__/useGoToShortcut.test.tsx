import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, fireEvent } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

import { useGoToShortcut } from '../useGoToShortcut';

const map = { h: '/home', n: '/notifications' };

beforeEach(() => {
  push.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useGoToShortcut', () => {
  it('navigates when "g" is followed by a mapped key', () => {
    renderHook(() => useGoToShortcut(map));
    fireEvent.keyDown(document, { key: 'g' });
    fireEvent.keyDown(document, { key: 'h' });
    expect(push).toHaveBeenCalledWith('/home');
  });

  it('does nothing when the second key is unmapped', () => {
    renderHook(() => useGoToShortcut(map));
    fireEvent.keyDown(document, { key: 'g' });
    fireEvent.keyDown(document, { key: 'x' });
    expect(push).not.toHaveBeenCalled();
  });

  it('does nothing for a bare key press without the leading "g"', () => {
    renderHook(() => useGoToShortcut(map));
    fireEvent.keyDown(document, { key: 'h' });
    expect(push).not.toHaveBeenCalled();
  });

  it('ignores the chord while typing in an input', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    renderHook(() => useGoToShortcut(map));
    fireEvent.keyDown(input, { key: 'g' });
    fireEvent.keyDown(input, { key: 'h' });
    expect(push).not.toHaveBeenCalled();
    input.remove();
  });

  it('does not fire when the chord window has expired', () => {
    vi.useFakeTimers();
    renderHook(() => useGoToShortcut(map));
    fireEvent.keyDown(document, { key: 'g' });
    vi.advanceTimersByTime(2000);
    fireEvent.keyDown(document, { key: 'h' });
    expect(push).not.toHaveBeenCalled();
  });
});
