import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('motion/react', () => {
  const makeEl = (tag: string) => {
    const El = ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(tag, props, children as React.ReactNode);
    El.displayName = `motion.${tag}`;
    return El;
  };
  return {
    motion: new Proxy({}, { get: (_, tag: string) => makeEl(tag) }),
    useInView: () => true,
  };
});

import { ProcessSection } from '../ProcessSection';

const STEP_TITLES = [
  '사업자 정보 확인',
  '견적 내용 입력',
  'PG 선택',
  '최종 견적 요청 정보 확인',
  'PG사 비교 견적',
  '최종 PG사 선정',
];

describe('ProcessSection', () => {
  it('renders all six process steps in the stepper', () => {
    render(<ProcessSection />);
    for (const title of STEP_TITLES) {
      expect(screen.getByRole('button', { name: new RegExp(title) })).toBeInTheDocument();
    }
  });

  it('shows the first step detail by default', () => {
    render(<ProcessSection />);
    expect(screen.getByText(/기본적인 사업자 정보를 입력/)).toBeInTheDocument();
  });

  it('renders the first step example view as a filled business-info form', () => {
    render(<ProcessSection />);
    expect(screen.getByText('(주)서포터비')).toBeInTheDocument();
    expect(screen.getByText('일반과세자')).toBeInTheDocument();
  });

  it('switches the detail and example view when another step is selected', () => {
    render(<ProcessSection />);
    fireEvent.click(screen.getByRole('button', { name: /PG 선택/ }));
    expect(screen.getByText(/견적을 받고 싶은 PG사를 선택/)).toBeInTheDocument();
    expect(screen.getByText('2개 선택됨')).toBeInTheDocument();
  });

  it('marks the active step with aria-current', () => {
    render(<ProcessSection />);
    const first = screen.getByRole('button', { name: /사업자 정보 확인/ });
    expect(first).toHaveAttribute('aria-current', 'step');
  });
});

describe('ProcessSection — animated example-view typing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Non-reduced-motion so the typing loop actually runs (the other suites rely
    // on jsdom's missing matchMedia → reduced-motion → instant fill).
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

  it('types the business-info form to completion without crashing', () => {
    render(<ProcessSection />);
    // Advance less than the 5s auto-advance so we stay on step 1; the form
    // finishes typing (~3.5s) — the final field must not throw.
    act(() => {
      vi.advanceTimersByTime(4500);
    });
    expect(screen.getByText('계속사업자')).toBeInTheDocument();
  });
});
