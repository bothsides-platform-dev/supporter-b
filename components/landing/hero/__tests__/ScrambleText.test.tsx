import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { render } from '@testing-library/react';

import { ScrambleText } from '../ScrambleText';

function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: '',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

describe('ScrambleText', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'Date', 'performance'],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    // @ts-expect-error remove the test stub
    delete window.matchMedia;
  });

  it('renders the first phrase settled as a single text node on mount', () => {
    const { container } = render(<ScrambleText phrases={['첫 번째', '두 번째']} />);
    expect(container.textContent).toBe('첫 번째');
  });

  it('enters the scramble transition (not a hard swap) once the hold time elapses', () => {
    const { container } = render(
      <ScrambleText phrases={['첫 번째', '두 번째']} holdMs={500} scrambleMs={300} />,
    );
    act(() => {
      // Past holdMs (scramble starts ~500ms in) but well short of holdMs + scrambleMs
      // (~800ms, when it would settle again) — lands mid-transition.
      vi.advanceTimersByTime(550);
    });
    // Mid-scramble render is per-character spans, not the single settled text node.
    expect(container.querySelectorAll('span > span').length).toBeGreaterThan(0);
  });

  it('still scrambles into the next phrase when the OS prefers reduced motion (landing ignores the preference)', () => {
    stubMatchMedia(true);
    const { container } = render(
      <ScrambleText phrases={['첫 번째', '두 번째']} holdMs={500} scrambleMs={300} />,
    );

    act(() => {
      vi.advanceTimersByTime(550); // past holdMs → scramble should start, not hard-swap
    });
    expect(container.querySelectorAll('span > span').length).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(500); // past scrambleMs → settles on the next phrase
    });
    expect(container.textContent).toBe('두 번째');
  });
});
