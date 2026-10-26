import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LandingPartnerMarquee } from '../LandingPartnerMarquee';

let resize: () => void;
let intersect: (entries: { isIntersecting: boolean }[]) => void;
let viewportWidth = 1440;
let unitWidth = 738;
const disconnectResize = vi.fn();
const disconnectIntersection = vi.fn();

beforeEach(() => {
  viewportWidth = 1440;
  unitWidth = 738;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return { width: this.hasAttribute('data-partner-unit') ? unitWidth : viewportWidth } as DOMRect;
  });
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect = disconnectResize;
  });
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: typeof intersect) { intersect = callback; }
    observe() {}
    disconnect = disconnectIntersection;
  });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('LandingPartnerMarquee', () => {
  it('announces each brand once without a visible heading or links', () => {
    render(<LandingPartnerMarquee />);
    const region = screen.getByRole('region', { name: '제휴 PG사' });
    expect(within(region).getAllByRole('img')).toHaveLength(2);
    for (const name of ['토스페이먼츠', '헥토파이낸셜']) {
      expect(within(region).getByRole('img', { name })).toBeInTheDocument();
    }
    expect(within(region).queryByRole('heading')).not.toBeInTheDocument();
    expect(within(region).queryByRole('link')).not.toBeInTheDocument();
  });

  it('covers a wide viewport with two equal groups at 28 pixels per second and resizes', () => {
    const { container } = render(<LandingPartnerMarquee />);
    const groups = () => container.querySelectorAll('[data-partner-group]');
    expect(groups()).toHaveLength(2);
    for (const group of groups()) expect(group.children).toHaveLength(2);
    const track = container.querySelector('[data-partner-track]') as HTMLElement;
    expect(parseFloat(track.style.animationDuration)).toBeCloseTo(1476 / 28);
    viewportWidth = 2560;
    act(() => resize());
    for (const group of groups()) expect(group.children).toHaveLength(4);
    expect(parseFloat(track.style.animationDuration)).toBeCloseTo(2952 / 28);
    viewportWidth = 360;
    unitWidth = 618;
    act(() => resize());
    for (const group of groups()) expect(group.children).toHaveLength(1);
    expect(parseFloat(track.style.animationDuration)).toBeCloseTo(618 / 28);
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('does not start with a zero measurement and recovers when layout becomes available', () => {
    unitWidth = 0;
    const { container } = render(<LandingPartnerMarquee />);
    const region = screen.getByRole('region');
    expect(region.style.getPropertyValue('--partner-local-play-state')).toBe('paused');
    expect(container.innerHTML).not.toContain('Infinity');
    unitWidth = 738;
    act(() => resize());
    act(() => intersect([{ isIntersecting: true }]));
    expect(region.style.getPropertyValue('--partner-local-play-state')).toBe('');
  });

  it('pauses outside the viewport and in hidden tabs, then resumes and cleans up', () => {
    const { unmount } = render(<LandingPartnerMarquee />);
    const region = screen.getByRole('region');
    act(() => intersect([{ isIntersecting: true }]));
    expect(region.style.getPropertyValue('--partner-local-play-state')).toBe('');
    act(() => intersect([{ isIntersecting: false }]));
    expect(region.style.getPropertyValue('--partner-local-play-state')).toBe('paused');
    act(() => intersect([{ isIntersecting: true }]));
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(region.style.getPropertyValue('--partner-local-play-state')).toBe('paused');
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(region.style.getPropertyValue('--partner-local-play-state')).toBe('');
    unmount();
    expect(disconnectResize).toHaveBeenCalled();
    expect(disconnectIntersection).toHaveBeenCalled();
  });
});
