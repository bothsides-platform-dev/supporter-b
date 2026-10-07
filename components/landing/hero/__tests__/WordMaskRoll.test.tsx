import { act } from 'react';
import { render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WordMaskRoll } from '../WordMaskRoll';

const phrases = ['협상의 주도권을', '연간 수천만 원의 절감을'];
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
function visible(container: HTMLElement, layer: string) {
  return container.querySelector(`[data-roll-layer="${layer}"]`);
}

describe('WordMaskRoll', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'Date', 'performance'] });
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('server renders a readable first phrase once for assistive technology', () => {
    const markup = renderToStaticMarkup(<WordMaskRoll phrases={phrases} />);
    const host = document.createElement('div');
    host.innerHTML = markup;
    expect(host.querySelector('.sr-only')?.textContent).toBe('협상의 주도권을');
    expect(visible(host, 'current')?.textContent).toBe('협상의 주도권을');
    expect(visible(host, 'current')?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(host.querySelector('[aria-live]')).toBeNull();
  });

  it('holds complete words then rolls the previous phrase upward and the next from below', () => {
    const { container } = render(<WordMaskRoll phrases={phrases} />);
    advance(3184);
    expect(visible(container, 'next')).toBeNull();
    advance(144);
    expect(visible(container, 'current')).not.toBeNull();
    expect(visible(container, 'next')).not.toBeNull();
    const outgoing = visible(container, 'current')!;
    const incoming = visible(container, 'next')!;
    expect(Array.from(outgoing.querySelectorAll('[data-roll-word]'), el => el.textContent)).toEqual(['협상의', '주도권을']);
    expect(Array.from(incoming.querySelectorAll('[data-roll-word]'), el => el.textContent)).toEqual(['연간', '수천만', '원의', '절감을']);
    expect((outgoing.querySelector('[data-roll-word]') as HTMLElement).style.transform).toMatch(/translateY\(-/);
    expect((incoming.querySelector('[data-roll-word]') as HTMLElement).style.transform).toMatch(/translateY\([\d.]+%\)/);
    advance(650);
    expect(visible(container, 'current')?.textContent).toBe('연간 수천만 원의 절감을');
    expect(visible(container, 'next')).toBeNull();
    advance(3184);
    expect(visible(container, 'current')?.textContent).toBe('연간 수천만 원의 절감을');
    advance(600);
    expect(visible(container, 'current')?.textContent).toBe('협상의 주도권을');
  });

  it('reserves every phrase independently of the active layers so width and wrapping remain stable', () => {
    const { container } = render(<WordMaskRoll phrases={phrases} />);
    expect(container.querySelector('[data-roll-sizing]')).not.toBeNull();
    const sizing = container.querySelector('[data-roll-sizing]')!;
    expect(Array.from(sizing.children, el => el.textContent)).toEqual(phrases);
    // Sizing must use the same whole-word boxes as the animated text. Raw text
    // advances round differently and can reserve one line while the words wrap.
    expect(Array.from(sizing.children, el => Array.from(el.querySelectorAll('[data-roll-word]'), word => word.textContent))).toEqual([['협상의', '주도권을'], ['연간', '수천만', '원의', '절감을']]);
    advance(3500);
    expect(Array.from(sizing.children, el => el.textContent)).toEqual(phrases);
  });

  it('pauses while hidden and resumes the remaining hold without skipping a phrase', () => {
    const { container, unmount } = render(<WordMaskRoll phrases={phrases} />);
    advance(1600);
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    advance(10000);
    expect(visible(container, 'next')).toBeNull();
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    advance(1500);
    expect(visible(container, 'next')).toBeNull();
    advance(250);
    expect(visible(container, 'next')).not.toBeNull();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the remaining hold when a parent passes an equivalent new array', () => {
    const { container, rerender } = render(<WordMaskRoll phrases={phrases} />);
    advance(4000);
    advance(1500);
    rerender(<WordMaskRoll phrases={[...phrases]} />);
    advance(1900);
    expect(visible(container, 'next')).not.toBeNull();
    expect(visible(container, 'current')?.textContent).toBe('연간 수천만 원의 절감을');
  });

  it('resets replaced phrases and keeps empty or single lists static', () => {
    const { container, rerender } = render(<WordMaskRoll phrases={phrases} />);
    advance(3500);
    rerender(<WordMaskRoll phrases={['새로운 성장 가맹점을']} />);
    expect(visible(container, 'current')?.textContent).toBe('새로운 성장 가맹점을');
    expect(visible(container, 'next')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    rerender(<WordMaskRoll phrases={[]} />);
    expect(container.textContent).toBe('');
  });
});
