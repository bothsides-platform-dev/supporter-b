import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

const motionHoisted = vi.hoisted(() => ({ inView: true }));
vi.mock('motion/react', () => ({
  useInView: () => motionHoisted.inView,
}));

import { MetricCard } from '../MetricCard';

// 숫자와 단위는 크기가 다른 두 span 으로 나뉘므로 값 묶음의 textContent 로 찾는다.
const metricValue = (text: string) =>
  screen.queryByText((_, el) => el?.hasAttribute('data-metric-value') === true && el.textContent === text);

describe('MetricCard', () => {
  it('renders the formatted target value (reduced-motion → instant, no count-up)', () => {
    // jsdom has no matchMedia → prefersReducedMotion → final value immediately
    render(<MetricCard label="지표" to={0.89} decimals={2} unit="%" qualifier="절감" caption="평균 절감 비율" />);
    expect(metricValue('0.89%')).not.toBeNull();
  });

  it('puts the final value in server-rendered HTML instead of the count-up start', () => {
    const html = renderToString(<MetricCard label="지표" to={2300} decimals={0} unit="만원" caption="연간 절감액" />);
    expect(html).toContain('2,300');
    expect(html).not.toMatch(/>0<!-- -->|>0</);
  });

  describe('count-up animation', () => {
    beforeEach(() => {
      vi.useFakeTimers({
        toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'Date', 'performance'],
      });
      window.matchMedia = vi.fn().mockReturnValue({
        matches: false,
        media: '',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as typeof window.matchMedia;
    });
    afterEach(() => {
      vi.useRealTimers();
      // @ts-expect-error remove the test stub
      delete window.matchMedia;
    });

    it('shows the final value and qualifier before the card scrolls into view', () => {
      motionHoisted.inView = false;
      try {
        render(<MetricCard label="연간 비용" to={2300} decimals={0} unit="만원" qualifier="절감" caption="연간 절감액" />);
        expect(metricValue('2,300만원')).not.toBeNull();
        expect((document.querySelector('[data-metric-qualifier]') as HTMLElement).style.opacity).toBe('1');
      } finally {
        motionHoisted.inView = true;
      }
    });

    it('counts up to the target value over time', () => {
      render(<MetricCard label="지표" to={2300} decimals={0} unit="만원" caption="연간 절감액" />);
      act(() => {
        vi.advanceTimersByTime(2000); // past COUNT_MS (1.4s) → lands on target
      });
      expect(metricValue('2,300만원')).not.toBeNull();
    });

    it('reveals the qualifier only once the count-up finishes', () => {
      render(<MetricCard label="연간 비용" to={2300} decimals={0} unit="만원" qualifier="절감" caption="연간 절감액" />);
      const arrow = () => document.querySelector('[data-metric-qualifier]') as HTMLElement | null;
      expect(arrow()).not.toBeNull();
      // hidden while the number is still climbing
      expect(arrow()!.style.opacity).toBe('0');
      act(() => {
        vi.advanceTimersByTime(1600); // past COUNT_MS → arrow fades/slides in
      });
      expect(arrow()!.style.opacity).toBe('1');
    });

    it('still counts up (does not jump instantly) when the OS prefers reduced motion (landing ignores the preference)', () => {
      window.matchMedia = vi.fn().mockReturnValue({
        matches: true,
        media: '',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as typeof window.matchMedia;

      render(<MetricCard label="지표" to={2300} decimals={0} unit="만원" caption="연간 절감액" />);
      // still mid-flight before COUNT_MS elapses — not yet the target value
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(metricValue('2,300만원')).toBeNull();

      act(() => {
        vi.advanceTimersByTime(2000); // past COUNT_MS → lands on target
      });
      expect(metricValue('2,300만원')).not.toBeNull();
    });
  });
});
