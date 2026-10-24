import { afterEach, describe, it, expect, vi } from 'vitest';
import React, { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
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
  // 태그마다 같은 컴포넌트를 돌려준다 — 매번 새로 만들면 리렌더마다 하위 트리가 통째로 다시 마운트된다.
  const cache = new Map<string, ReturnType<typeof makeEl>>();
  return {
    motion: new Proxy(
      {},
      { get: (_, tag: string) => cache.get(tag) ?? cache.set(tag, makeEl(tag)).get(tag) },
    ),
    useInView: () => false,
  };
});

import { OfferComparisonTable } from '../OfferComparisonTable';
import { PG_BRANDS, __resetPgBrandOrderForTest, shuffle } from '../offer-comparison-data';

afterEach(() => {
  __resetPgBrandOrderForTest();
  vi.restoreAllMocks();
});

function bodyRows() {
  return screen.getAllByRole('row').filter((r) => within(r).queryAllByRole('cell').length > 0);
}

// 기대 순서는 셔플 알고리즘 자체에서 얻는다 — 알고리즘의 구체적 결과는 offer-comparison-data 테스트가 고정한다.
const containingPgs = (brands: readonly { pg: string }[]) => brands.map((b) => expect.stringContaining(b.pg));

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
    expect(bodyRows().length).toBeGreaterThanOrEqual(3);
  });

  it('shuffles which PG sits on which row so no company is always the recommended one', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const expected = shuffle(PG_BRANDS, () => 0);
    expect(expected[0].pg).not.toBe(PG_BRANDS[0].pg);
    const { container } = render(<OfferComparisonTable />);
    expect(bodyRows().map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(containingPgs(expected));
    // 조건(수수료·추천)은 행에 고정 — 최저 수수료 행이 추천이고, 그 행의 PG 만 바뀐다.
    const first = within(bodyRows()[0]);
    expect(first.getByText('추천')).toBeInTheDocument();
    expect(first.getByText('1.85%')).toBeInTheDocument();
    // 장식 아이콘은 이름을 따라간다. 이름이 바로 옆이라 alt 는 비운다.
    const marks = Array.from(container.querySelectorAll('tbody img')).map((img) => [
      img.getAttribute('src'),
      img.getAttribute('alt'),
    ]);
    expect(marks).toEqual(expected.map((b) => [b.logo, '']));
  });

  it('uses one order per page load so the hero and showcase tables agree', () => {
    // 두 번째 표를 그리기 전에 난수를 바꾼다 — 표마다 다시 섞는다면 두 표의 순서가 달라진다.
    const first = shuffle(PG_BRANDS, () => 0);
    const reshuffled = shuffle(PG_BRANDS, () => 0.999);
    expect(reshuffled.map((b) => b.pg)).not.toEqual(first.map((b) => b.pg));
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    function Page({ showcase }: { showcase: boolean }) {
      return (
        <>
          <OfferComparisonTable />
          {showcase && <OfferComparisonTable presentation="solution" />}
        </>
      );
    }
    const { rerender } = render(<Page showcase={false} />);
    random.mockReturnValue(0.999);
    rerender(<Page showcase />);
    const names = bodyRows().map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(names.slice(0, 3)).toEqual(containingPgs(first));
    expect(names.slice(3)).toEqual(containingPgs(first));
  });

  it('bakes the fixed order into server HTML and swaps to the shuffled order after hydration', async () => {
    // 랜딩은 force-static — 서버 HTML 은 빌드마다 같아야 하고, 섞기는 브라우저에서만 일어난다.
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const host = document.createElement('div');
    host.innerHTML = renderToString(<OfferComparisonTable />);
    const firstCells = () =>
      Array.from(host.querySelectorAll('tbody tr')).map((r) => r.querySelector('td')?.textContent);
    expect(firstCells()).toEqual(containingPgs(PG_BRANDS));
    expect(random).not.toHaveBeenCalled();

    // 추천 행은 자리에 그대로 있고 이름·로고만 바뀌어야 한다 — 행이 옮겨지면 배경 틴트가 다른 행으로 번진다.
    const recommendedRow = host.querySelector('tbody tr');
    document.body.appendChild(host);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot> | undefined;
    const recoverable: string[] = [];
    try {
      await act(async () => {
        root = hydrateRoot(host, <OfferComparisonTable />, {
          onRecoverableError: (e) => recoverable.push(String(e)),
        });
      });
      expect(firstCells()).toEqual(containingPgs(shuffle(PG_BRANDS, () => 0)));
      expect(recoverable).toEqual([]);
      expect(host.querySelector('tbody tr')).toBe(recommendedRow);
      expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/hydrat|did not match/i);
    } finally {
      act(() => root?.unmount());
      host.remove();
    }
  });

  it('highlights the recommended terms row on the final step, whichever PG landed there', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const expected = shuffle(PG_BRANDS, () => 0);
    render(<OfferComparisonTable activeStep={3} />);
    const highlighted = bodyRows().filter((r) => r.className.includes('tertiary-container)]/50'));
    expect(highlighted).toHaveLength(1);
    expect(within(highlighted[0]).getByText('추천')).toBeInTheDocument();
    expect(highlighted[0].textContent).toContain(expected[0].pg);
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
