import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

vi.mock('motion/react', () => {
  const makeEl = (tag: string) => {
    const El = ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(tag, props, children as React.ReactNode);
    El.displayName = `motion.${tag}`;
    return El;
  };
  return { motion: new Proxy({}, { get: (_, tag: string) => makeEl(tag) }) };
});

import { FaqList, FAQ_ITEMS } from '../FaqList';

describe('FaqList', () => {
  it('shows all three questions and their answers expanded (no folding)', () => {
    render(<FaqList />);
    expect(screen.getByText(/도입 수수료가 있나요/)).toBeInTheDocument();
    expect(screen.getByText(/2달 전 사전 공유 예정/)).toBeInTheDocument();
    expect(screen.getByText(/어떤 PG사 이용이 가능한가요/)).toBeInTheDocument();
    expect(screen.getByText(/국내 모든 PG사 수수료 견적/)).toBeInTheDocument();
    expect(screen.getByText(/기능 건의/)).toBeInTheDocument();
    expect(screen.getByText(/채널톡/)).toBeInTheDocument();
  });

  it('has no toggle buttons (not an accordion)', () => {
    render(<FaqList />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('exports FAQ_ITEMS as a non-empty array with q and a strings', () => {
    expect(FAQ_ITEMS.length).toBeGreaterThan(0);
    FAQ_ITEMS.forEach((item: { q: string; a: string }) => {
      expect(typeof item.q).toBe('string');
      expect(typeof item.a).toBe('string');
    });
  });
});
