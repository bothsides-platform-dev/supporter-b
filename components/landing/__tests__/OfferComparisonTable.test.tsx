import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';

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
});
