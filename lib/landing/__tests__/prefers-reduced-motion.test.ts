/// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { landingMotionUnavailable, prefersReducedMotion } from '../prefers-reduced-motion';

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

describe('landingMotionUnavailable', () => {
  afterEach(() => {
    // @ts-expect-error remove the test stub
    delete window.matchMedia;
  });

  it('returns false when the OS prefers reduced motion (landing ignores the preference)', () => {
    stubMatchMedia(true);
    expect(landingMotionUnavailable()).toBe(false);
  });

  it('returns false when the OS does not prefer reduced motion', () => {
    stubMatchMedia(false);
    expect(landingMotionUnavailable()).toBe(false);
  });

  it('returns true when matchMedia is unavailable (SSR/jsdom fallback)', () => {
    // @ts-expect-error simulate an environment without matchMedia
    delete window.matchMedia;
    expect(landingMotionUnavailable()).toBe(true);
  });
});

describe('prefersReducedMotion (non-landing consumers, e.g. theme view-transition)', () => {
  afterEach(() => {
    // @ts-expect-error remove the test stub
    delete window.matchMedia;
  });

  it('returns true when the OS prefers reduced motion', () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
  });

  it('returns false when the OS does not prefer reduced motion', () => {
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('returns true when matchMedia is unavailable (SSR/jsdom fallback)', () => {
    // @ts-expect-error simulate an environment without matchMedia
    delete window.matchMedia;
    expect(prefersReducedMotion()).toBe(true);
  });
});
