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
    expect((outgoing.querySelector('[data-roll-character]') as HTMLElement).style.transform).toMatch(/translateY\(-/);
    expect((incoming.querySelector('[data-roll-character]') as HTMLElement).style.transform).toMatch(/translateY\([\d.]+%\)/);
    advance(900);
    expect(visible(container, 'current')?.textContent).toBe('연간 수천만 원의 절감을');
    expect(visible(container, 'next')).toBeNull();
    advance(3184);
    expect(visible(container, 'current')?.textContent).toBe('연간 수천만 원의 절감을');
    advance(950);
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

  it('accelerates gently, carries both phrases together, and settles before replacing the layer', () => {
    const { container } = render(<WordMaskRoll phrases={['첫 문구', '다음 문구']} />);
    const offsets = (name: string) => Array.from(
      visible(container, name)!.querySelectorAll<HTMLElement>('[data-roll-character]'),
      word => Number(word.style.transform.match(/translateY\(([-\d.]+)%\)/)![1]),
    );
    advance(3200);
    advance(80);
    const start = offsets('current');
    // A full-height jump in the first few frames makes the headline flicker.
    expect(Math.abs(start[0])).toBeGreaterThan(0);
    expect(Math.abs(start[0])).toBeLessThan(112 * 0.2);
    advance(240);
    const middle = offsets('current');
    const incoming = offsets('next');
    expect(Math.abs(middle[0])).toBeGreaterThan(112 * 0.4);
    expect(Math.abs(middle[0])).toBeLessThan(112 * 0.8);
    middle.forEach((y, index) => expect(incoming[index] - y).toBeCloseTo(112));
    advance(352);
    expect(offsets('next').every(y => y >= 0 && y < 1)).toBe(true);
    advance(80);
    expect(visible(container, 'next')).toBeNull();
    expect(visible(container, 'current')?.textContent).toBe('다음 문구');
    expect(offsets('current')).toEqual([0, 0, 0, 0]);
  });

  it('rolls every character in reading order without grouping the later characters together', () => {
    const { container } = render(<WordMaskRoll phrases={['가나다라마바사아자차카타파하', '하파타카차자아사바마라다나가']} />);
    const offsets = () => Array.from(
      visible(container, 'current')!.querySelectorAll<HTMLElement>('[data-roll-character]'),
      character => Number(character.style.transform.match(/translateY\(([-\d.]+)%\)/)![1]),
    );
    advance(3200);
    advance(128);
    expect(offsets()).toHaveLength(14);
    expect(offsets()[0]).toBeLessThan(offsets()[1]);
    expect(offsets()[1]).toBeLessThan(offsets()[2]);
    expect(offsets().slice(5)).toEqual(Array(9).fill(0));
    advance(272);
    const moving = offsets();
    moving.slice(1).forEach((y, index) => {
      expect(y).toBeGreaterThan(moving[index]);
      expect(y).toBeLessThan(0);
    });
    advance(592);
    expect(visible(container, 'next')).not.toBeNull();
    advance(48);
    expect(visible(container, 'next')).toBeNull();
    expect(visible(container, 'current')?.textContent).toBe('하파타카차자아사바마라다나가');
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
