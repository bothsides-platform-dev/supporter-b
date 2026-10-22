import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { LandingNav } from '../LandingNav';

// jsdom has no layout/observers. Keep the real navigation and simulate only
// browser geometry and observer delivery, including exits and large jumps.
const positions: Record<string, [number, number]> = {
  service: [1000, 1000], pricing: [3000, 400], calculator: [3400, 800],
  faq: [4200, 600], contact: [5200, 350],
};
let scrollY = 0;
let headerHeight = 68;
let viewportHeight = 800;
let documentHeight = 6000;
let observers: TestIntersectionObserver[] = [];
let resizeObservers: TestResizeObserver[] = [];

class TestIntersectionObserver {
  targets = new Set<Element>();
  disconnect = vi.fn(() => this.targets.clear());
  constructor(readonly callback: IntersectionObserverCallback, readonly options: IntersectionObserverInit) {
    observers.push(this);
  }
  observe = (target: Element) => { this.targets.add(target); };
  emit() {
    const top = -parseFloat(String(this.options.rootMargin).split(' ')[0]);
    const entries = [...this.targets].map(target => {
      const rect = target.getBoundingClientRect();
      const isIntersecting = rect.top <= top && rect.bottom > top;
      return { target, boundingClientRect: rect, isIntersecting, intersectionRatio: isIntersecting ? 0.01 : 0,
        intersectionRect: new DOMRect(0, top, 1200, 1), rootBounds: new DOMRect(0, top, 1200, 1), time: 0 };
    });
    this.callback(entries, this as unknown as IntersectionObserver);
  }
}
class TestResizeObserver {
  disconnect = vi.fn();
  observe = vi.fn();
  constructor(readonly callback: ResizeObserverCallback) { resizeObservers.push(this); }
}
function notify() { act(() => { observers.forEach(observer => observer.emit()); }); }
function scrollTo(y: number) {
  scrollY = y;
  fireEvent.scroll(window);
  notify();
}
function mount() {
  const result = render(<>
    <header><LandingNav authed={false} /></header>
    <main>{Object.keys(positions).map(id => <section id={id} key={id} />)}</main>
  </>);
  notify();
  return result;
}
function current() {
  return [...document.querySelectorAll('header [aria-current="location"]')].map(el => el.textContent);
}

beforeEach(() => {
  scrollY = 0; headerHeight = 68; viewportHeight = 800; documentHeight = 6000;
  observers = []; resizeObservers = [];
  vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY);
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockImplementation(() => viewportHeight);
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockImplementation(() => documentHeight);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.tagName === 'HEADER') return new DOMRect(0, 0, 1200, headerHeight);
    const [top, height] = positions[this.id] ?? [0, 0];
    return new DOMRect(0, top - scrollY, 1200, height);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('buyer landing current location', () => {
  it('selects sections at header bottom + 24px and clears gaps in both directions', () => {
    mount();
    expect(current()).toEqual([]);
    scrollTo(2907); // pricing starts one pixel below the reference line
    expect(current()).toEqual([]);
    scrollTo(2908);
    expect(current()).toEqual(['이용요금']);
    scrollTo(3308);
    expect(current()).toEqual(['비용 절감 계산기']);
    scrollTo(4108);
    expect(current()).toEqual(['자주 묻는 질문']);
    scrollTo(4800); // consultation is not in navigation
    expect(current()).toEqual([]);
    scrollTo(3200);
    expect(current()).toEqual(['이용요금']);
    scrollTo(2100); // process/metrics gap after service
    expect(current()).toEqual([]);
  });

  it('selects an edge-adjacent section when returning upward from an unlisted gap', () => {
    mount(); scrollTo(2000);
    expect(current()).toEqual([]);
    scrollTo(1908); // service bottom touches the 92px observer line
    expect(current()).toEqual(['서비스 설명']);
    scrollTo(1898);
    expect(current()).toEqual(['서비스 설명']);
  });

  it('marks the service trigger and available service link without opening the dropdown', () => {
    mount(); scrollTo(1100);
    const trigger = screen.getByRole('button', { name: '서비스 설명' });
    expect(trigger).toHaveAttribute('aria-current', 'location');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(screen.getByRole('link', { name: /맞춤 PG 견적/ })).toHaveAttribute('aria-current', 'location');
    scrollTo(2200);
    expect(trigger).not.toHaveAttribute('aria-current');
  });

  it('shows the same location when the mobile menu is opened and updated', () => {
    mount(); scrollTo(3500);
    fireEvent.click(screen.getByRole('button', { name: '메뉴 열기' }));
    const menu = within(screen.getByTestId('landing-mobile-menu'));
    expect(menu.getByRole('link', { name: '비용 절감 계산기' })).toHaveAttribute('aria-current', 'location');
    scrollTo(1200);
    expect(menu.getByRole('link', { name: '서비스 설명' })).toHaveAttribute('aria-current', 'location');
    expect(menu.getByRole('link', { name: '비용 절감 계산기' })).not.toHaveAttribute('aria-current');
  });

  it('uses restored geometry on mount and never writes history while scrolling', () => {
    window.history.replaceState(null, '', '/#faq');
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    scrollY = 4300;
    mount();
    expect(current()).toEqual(['자주 묻는 질문']);
    scrollTo(3500);
    expect(current()).toEqual(['비용 절감 계산기']);
    expect(window.location.hash).toBe('#faq');
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('selects visible short contact at the page end even when it never crosses the line', () => {
    // Tall viewport: contact starts at 200px, below the 92px reference line.
    viewportHeight = 1000;
    scrollY = 4990;
    mount();
    expect(current()).toEqual([]);
    scrollY = 5000;
    fireEvent.scroll(window); // no IO crossing at all
    expect(current()).toEqual(['도입문의']);
    scrollY = 4990;
    fireEvent.scroll(window);
    expect(current()).toEqual([]);
  });

  it('does not select contact at the page end when a tall footer hides it', () => {
    mount(); scrollTo(5300);
    expect(current()).toEqual(['도입문의']);
    documentHeight = 7000;
    scrollTo(6200);
    expect(current()).toEqual([]);
  });

  it('recalculates the reference line and observer band when header/viewport resize', () => {
    mount(); scrollTo(2900);
    expect(current()).toEqual([]);
    headerHeight = 88;
    act(() => resizeObservers.forEach(observer => observer.callback([], observer as unknown as ResizeObserver)));
    notify();
    expect(current()).toEqual(['이용요금']);
    headerHeight = 68; viewportHeight = 600;
    fireEvent.resize(window); notify();
    expect(current()).toEqual([]);
    const margins = observers.at(-1)?.options.rootMargin;
    expect(margins).toBe('-92px 0px -508px 0px');
  });

  it('disconnects observers and removes scroll/resize listeners on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = mount();
    expect(observers.some(observer => observer.targets.size === 5)).toBe(true);
    unmount();
    expect(observers.every(observer => observer.disconnect.mock.calls.length > 0)).toBe(true);
    expect(resizeObservers.every(observer => observer.disconnect.mock.calls.length > 0)).toBe(true);
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
