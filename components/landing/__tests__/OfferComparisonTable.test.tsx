import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

vi.mock('motion/react', () => {
  const makeEl = (tag: string) => {
    const El = ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(tag, props, children as React.ReactNode);
    El.displayName = `motion.${tag}`;
    return El;
  };
  return {
    motion: new Proxy({}, { get: (_, tag: string) => makeEl(tag) }),
    useInView: () => false,
  };
});

import { OfferComparisonTable } from '../OfferComparisonTable';

describe('OfferComparisonTable', () => {
  it('renders the seven comparison columns', () => {
    render(<OfferComparisonTable />);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    for (const col of [
      'PG사',
      '수수료',
      '정산주기',
      '보증보험',
      '가입비',
      '승인 상태',
      '협의 가능 여부',
    ]) {
      expect(headers.some((h) => h?.includes(col))).toBe(true);
    }
  });

  it('renders at least three PG offer rows in the body', () => {
    render(<OfferComparisonTable />);
    const bodyRows = screen.getAllByRole('row').filter((r) => within(r).queryAllByRole('cell').length > 0);
    expect(bodyRows.length).toBeGreaterThanOrEqual(3);
  });

  it('marks one offer as the recommended (lowest) one', () => {
    render(<OfferComparisonTable />);
    expect(screen.getByText('추천')).toBeInTheDocument();
  });

  it('does not present itself as an AI chat/result surface', () => {
    render(<OfferComparisonTable />);
    expect(screen.queryByText(/AI|챗봇|대화/i)).toBeNull();
  });

  it('highlights the 수수료 column when the fee-quote step is active', () => {
    render(<OfferComparisonTable activeStep={0} />);
    const headers = screen.getAllByRole('columnheader');
    const fee = headers.find((h) => h.textContent === '수수료');
    const pg = headers.find((h) => h.textContent === 'PG사');
    expect(fee).toHaveAttribute('data-active', 'true');
    expect(pg).not.toHaveAttribute('data-active');
  });

  it('highlights the 협의 가능 여부 column on the negotiation step', () => {
    render(<OfferComparisonTable activeStep={2} />);
    const headers = screen.getAllByRole('columnheader');
    const negotiate = headers.find((h) => h.textContent === '협의 가능 여부');
    const fee = headers.find((h) => h.textContent === '수수료');
    expect(negotiate).toHaveAttribute('data-active', 'true');
    expect(fee).not.toHaveAttribute('data-active');
  });
});

describe('scroll fade hint', () => {
  function stubScrollMetrics(
    el: HTMLElement,
    { scrollWidth, clientWidth, scrollLeft }: { scrollWidth: number; clientWidth: number; scrollLeft: number },
  ) {
    Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true });
    Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true });
    Object.defineProperty(el, 'scrollLeft', { value: scrollLeft, configurable: true });
  }

  it('hides the fade when content does not overflow', () => {
    render(<OfferComparisonTable />);
    const fade = screen.getByTestId('offer-table-scroll-fade');
    expect(fade).toHaveStyle({ opacity: '0' });
  });

  it('shows the fade when content overflows and scrollLeft is 0', () => {
    render(<OfferComparisonTable />);
    const container = screen.getByTestId('offer-table-scroll-container');
    stubScrollMetrics(container, { scrollWidth: 1000, clientWidth: 680, scrollLeft: 0 });
    fireEvent.scroll(container);
    expect(screen.getByTestId('offer-table-scroll-fade')).toHaveStyle({ opacity: '1' });
  });

  it('hides the fade once scrolled to the true end', () => {
    render(<OfferComparisonTable />);
    const container = screen.getByTestId('offer-table-scroll-container');
    stubScrollMetrics(container, { scrollWidth: 1000, clientWidth: 680, scrollLeft: 320 });
    fireEvent.scroll(container);
    expect(screen.getByTestId('offer-table-scroll-fade')).toHaveStyle({ opacity: '0' });
  });

  it('keeps the fade hidden when within the 4px threshold of the end', () => {
    render(<OfferComparisonTable />);
    const container = screen.getByTestId('offer-table-scroll-container');
    stubScrollMetrics(container, { scrollWidth: 1000, clientWidth: 680, scrollLeft: 318 });
    fireEvent.scroll(container);
    expect(screen.getByTestId('offer-table-scroll-fade')).toHaveStyle({ opacity: '0' });
  });

  it('re-shows the fade if the user scrolls back away from the end', () => {
    render(<OfferComparisonTable />);
    const container = screen.getByTestId('offer-table-scroll-container');
    stubScrollMetrics(container, { scrollWidth: 1000, clientWidth: 680, scrollLeft: 320 });
    fireEvent.scroll(container);
    expect(screen.getByTestId('offer-table-scroll-fade')).toHaveStyle({ opacity: '0' });

    stubScrollMetrics(container, { scrollWidth: 1000, clientWidth: 680, scrollLeft: 100 });
    fireEvent.scroll(container);
    expect(screen.getByTestId('offer-table-scroll-fade')).toHaveStyle({ opacity: '1' });
  });

  it('stays hidden exactly at the 4px threshold boundary', () => {
    render(<OfferComparisonTable />);
    const container = screen.getByTestId('offer-table-scroll-container');
    stubScrollMetrics(container, { scrollWidth: 1000, clientWidth: 680, scrollLeft: 316 });
    fireEvent.scroll(container);
    expect(screen.getByTestId('offer-table-scroll-fade')).toHaveStyle({ opacity: '0' });
  });

  it('shows the fade just past the threshold boundary', () => {
    render(<OfferComparisonTable />);
    const container = screen.getByTestId('offer-table-scroll-container');
    stubScrollMetrics(container, { scrollWidth: 1000, clientWidth: 680, scrollLeft: 315 });
    fireEvent.scroll(container);
    expect(screen.getByTestId('offer-table-scroll-fade')).toHaveStyle({ opacity: '1' });
  });

  it('updates the fade on window resize', () => {
    render(<OfferComparisonTable />);
    const container = screen.getByTestId('offer-table-scroll-container');
    stubScrollMetrics(container, { scrollWidth: 1000, clientWidth: 680, scrollLeft: 0 });
    fireEvent(window, new Event('resize'));
    expect(screen.getByTestId('offer-table-scroll-fade')).toHaveStyle({ opacity: '1' });
  });

  it('removes the scroll and resize listeners on unmount', () => {
    const { unmount } = render(<OfferComparisonTable />);
    const container = screen.getByTestId('offer-table-scroll-container');
    const containerRemoveSpy = vi.spyOn(container, 'removeEventListener');
    const windowRemoveSpy = vi.spyOn(window, 'removeEventListener');
    unmount();
    expect(containerRemoveSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(windowRemoveSpy).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('disconnects the ResizeObserver on unmount', () => {
    const disconnectSpy = vi.spyOn(ResizeObserverStub.prototype, 'disconnect');
    const { unmount } = render(<OfferComparisonTable />);
    unmount();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    disconnectSpy.mockRestore();
  });

  it('does not render the fade hint when showScrollFade is false, even when the wrapper never scrolls', () => {
    const { container: root } = render(<OfferComparisonTable showScrollFade={false} />);
    // showScrollFade=false also omits the testid (it would otherwise collide with
    // the real table's instance on an assembled page), so select via the scroll
    // container's structural class instead.
    const container = root.querySelector('.overflow-x-auto') as HTMLElement;
    expect(container).toBeInTheDocument();
    expect(container).not.toHaveAttribute('data-testid');
    // Mirrors the decorative hero mockup: overflow-x-clip pins scrollLeft at 0
    // forever while scrollWidth keeps overflowing clientWidth — canScrollRight
    // would otherwise get stuck true with no scroll event to ever flip it back.
    stubScrollMetrics(container, { scrollWidth: 680, clientWidth: 320, scrollLeft: 0 });
    fireEvent.scroll(container);
    expect(screen.queryByTestId('offer-table-scroll-fade')).not.toBeInTheDocument();
  });
});
