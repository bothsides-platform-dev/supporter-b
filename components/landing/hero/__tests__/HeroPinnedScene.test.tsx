import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const scroll = vi.hoisted(() => ({ get: () => 0 }));
const useScroll = vi.hoisted(() => vi.fn(() => ({ scrollYProgress: scroll })));
vi.mock('motion/react', () => {
  const elements = Object.fromEntries(['div', 'p', 'span'].map((tag) => [tag,
    ({ children, initial: _initial, animate: _animate, transition: _transition, style: _style, ...props }: Record<string, unknown>) =>
      React.createElement(tag, props, children as React.ReactNode),
  ]));
  return { motion: elements, useScroll, useTransform: () => 0, useMotionValueEvent: () => {} };
});
vi.mock('../HeroAsciiField', () => ({ HeroAsciiField: () => null }));
vi.mock('../HeroKineticHeadline', () => ({ HeroKineticHeadline: () => null }));
vi.mock('../HeroProductWindow', () => ({ HeroProductWindow: () => null }));
vi.mock('../useMagneticHover', () => ({ useMagneticHover: () => [null, 0, 0] }));

import { HeroPinnedScene } from '../HeroPinnedScene';

let sceneHeight = 1100;
let resizeScene: () => void;
const disconnect = vi.fn();
const observe = vi.fn();

beforeEach(() => {
  sceneHeight = 1100;
  vi.stubGlobal('innerHeight', 900);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => sceneHeight);
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resizeScene = callback; }
    observe = observe;
    disconnect = disconnect;
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('HeroPinnedScene overflow measurement', () => {
  it('updates pin position and scroll range on content resize, clamps fitting scenes, and releases observers', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<HeroPinnedScene partners={<span>Partners</span>} />);
    const track = screen.getByRole('region', { name: '서비스 소개' });
    const scene = track.firstElementChild as HTMLElement;
    expect(scene.style.top).toBe('-200px');
    expect(track.style.height).toBe('calc(200px + 240vh)');
    expect(useScroll).toHaveBeenLastCalledWith(expect.objectContaining({ offset: ['start -200px', 'end end'] }));
    expect(observe).toHaveBeenCalledWith(scene);
    sceneHeight = 700;
    act(() => resizeScene());
    expect(scene.style.top).toBe('0px');
    expect(track.style.height).toBe('calc(0px + 240vh)');
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('resize', resizeScene);
  });

  it('measures initially and responds to window resize without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { unmount } = render(<HeroPinnedScene partners={<span>Partners</span>} />);
    const scene = screen.getByRole('region', { name: '서비스 소개' }).firstElementChild as HTMLElement;
    expect(scene.style.top).toBe('-200px');
    sceneHeight = 1200;
    act(() => window.dispatchEvent(new Event('resize')));
    expect(scene.style.top).toBe('-300px');
    unmount();
  });

  it('keeps the PG scene unshifted and does not observe its content', () => {
    render(<HeroPinnedScene />);
    const track = screen.getByRole('region', { name: '서비스 소개' });
    expect((track.firstElementChild as HTMLElement).style.top).toBe('0px');
    expect(track.style.height).toBe('calc(0px + 240vh)');
    expect(observe).not.toHaveBeenCalled();
    expect(screen.getByText('Scroll')).toBeInTheDocument();
  });
});
