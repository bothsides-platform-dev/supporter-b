import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BidsArrivalScene } from '../BidsArrivalScene';

const pgNames = ['튜토리얼페이 A', '튜토리얼페이 B', '튜토리얼페이 C'];

let reducedMotion = false;
vi.mock('@/lib/landing/prefers-reduced-motion', () => ({
  prefersReducedMotion: () => reducedMotion,
}));

afterEach(cleanup);

describe('BidsArrivalScene', () => {
  beforeEach(() => {
    reducedMotion = false;
    vi.useRealTimers();
  });

  it('reduced-motion이면 모든 카드를 즉시 전부 표시한다', () => {
    reducedMotion = true;
    render(<BidsArrivalScene pgNames={pgNames} onProceed={vi.fn()} />);
    for (const name of pgNames) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it('일반 모션에서는 0.6초 간격으로 카드가 순차 등장한다(opacity)', () => {
    vi.useFakeTimers();
    render(<BidsArrivalScene pgNames={pgNames} onProceed={vi.fn()} />);

    const cardOpacity = (name: string) => screen.getByText(name).closest('div')?.style.opacity;

    // 최초에는 모두 opacity 0(모션 대기)
    expect(cardOpacity(pgNames[0])).toBe('0');
    expect(cardOpacity(pgNames[1])).toBe('0');
    expect(cardOpacity(pgNames[2])).toBe('0');

    act(() => { vi.advanceTimersByTime(600); });
    expect(cardOpacity(pgNames[0])).toBe('1');
    expect(cardOpacity(pgNames[1])).toBe('0');

    act(() => { vi.advanceTimersByTime(600); });
    expect(cardOpacity(pgNames[1])).toBe('1');
    expect(cardOpacity(pgNames[2])).toBe('0');

    act(() => { vi.advanceTimersByTime(600); });
    expect(cardOpacity(pgNames[2])).toBe('1');

    vi.useRealTimers();
  });

  it('모든 카드 등장 후 CTA 클릭 시 onProceed를 호출한다', async () => {
    reducedMotion = true;
    const onProceed = vi.fn();
    const user = userEvent.setup();
    render(<BidsArrivalScene pgNames={pgNames} onProceed={onProceed} />);

    await user.click(screen.getByRole('button', { name: '견적 비교하기' }));
    expect(onProceed).toHaveBeenCalledTimes(1);
  });
});
