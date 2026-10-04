import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BidsArrivalScene } from '../BidsArrivalScene';
import { TUTORIAL_PG_IDS, tutorialPgWsById } from '@/lib/onboarding/tutorial-fixtures';
import { TUTORIAL_PG_LOGO_SRC } from '@/lib/onboarding/tutorial-pg-logos';

const pgs = TUTORIAL_PG_IDS.map((id) => tutorialPgWsById[id]!);
const pgNames = pgs.map((p) => p.name);

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
    render(<BidsArrivalScene pgs={pgs} onProceed={vi.fn()} />);
    for (const name of pgNames) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it('일반 모션에서는 0.6초 간격으로 카드가 순차 등장한다(opacity)', () => {
    vi.useFakeTimers();
    render(<BidsArrivalScene pgs={pgs} onProceed={vi.fn()} />);

    const cardOpacity = (name: string) => screen.getByText(name).closest<HTMLElement>('[data-arrival-card]')?.style.opacity;

    // 최초에는 모두 opacity 0(모션 대기)
    expect(cardOpacity(pgNames[0])).toBe('0');
    expect(cardOpacity(pgNames[1])).toBe('0');
    expect(cardOpacity(pgNames[2])).toBe('0');
    expect(cardOpacity(pgNames[3])).toBe('0');

    act(() => { vi.advanceTimersByTime(600); });
    expect(cardOpacity(pgNames[0])).toBe('1');
    expect(cardOpacity(pgNames[1])).toBe('0');

    act(() => { vi.advanceTimersByTime(600); });
    expect(cardOpacity(pgNames[1])).toBe('1');
    expect(cardOpacity(pgNames[2])).toBe('0');

    act(() => { vi.advanceTimersByTime(600); });
    expect(cardOpacity(pgNames[2])).toBe('1');
    expect(cardOpacity(pgNames[3])).toBe('0');

    act(() => { vi.advanceTimersByTime(600); });
    expect(cardOpacity(pgNames[3])).toBe('1');

    vi.useRealTimers();
  });

  it('각 카드에 실제 PG 로고를 이름과 함께 그린다', () => {
    reducedMotion = true;
    render(<BidsArrivalScene pgs={pgs} onProceed={vi.fn()} />);
    for (const pg of pgs) {
      const logo = screen.getByRole('img', { name: pg.name });
      expect(logo).toHaveAttribute('src', TUTORIAL_PG_LOGO_SRC[pg.id as keyof typeof TUTORIAL_PG_LOGO_SRC]);
      expect(screen.getByText(pg.name)).toBeInTheDocument();
    }
  });

  it('모든 카드 등장 후 CTA 클릭 시 onProceed를 호출한다', async () => {
    reducedMotion = true;
    const onProceed = vi.fn();
    const user = userEvent.setup();
    render(<BidsArrivalScene pgs={pgs} onProceed={onProceed} />);

    await user.click(screen.getByRole('button', { name: '견적 비교하기' }));
    expect(onProceed).toHaveBeenCalledTimes(1);
  });

  it('CTA 버튼에 튜토리얼 코치마크 앵커가 있다', () => {
    reducedMotion = true;
    render(<BidsArrivalScene pgs={pgs} onProceed={vi.fn()} />);
    expect(screen.getByRole('button', { name: '견적 비교하기' })).toHaveAttribute(
      'data-coachmark',
      'tutorial-arrival-cta',
    );
  });
});
