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

import { FaqList } from '../FaqList';
import { FAQ_ITEMS } from '../faq-data';

describe('FaqList', () => {
  it('shows all three questions and their answers expanded (no folding)', () => {
    render(<FaqList />);
    expect(screen.getByText(/도입 수수료가 있나요/)).toBeInTheDocument();
    expect(screen.getByText(/한분기 전에 공유드릴 예정/)).toBeInTheDocument();
    expect(screen.getByText('어떤 PG사에 견적을 요청할 수 있나요?')).toBeInTheDocument();
    expect(screen.getByText('서포트비에서 추천하는 PG사에 상담과 견적을 요청할 수 있어요. 상담 가능한 PG사는 업종에 따라 달라지며, 견적 제공 여부는 PG사 검토 결과에 따라 결정돼요.')).toBeInTheDocument();
    expect(screen.queryByText(/국내 모든 PG사/)).toBeNull();
    expect(screen.getByText(/기능 건의/)).toBeInTheDocument();
    expect(screen.getByText(/채널톡/)).toBeInTheDocument();
  });

  it('has no toggle buttons (not an accordion)', () => {
    render(<FaqList />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('items prop 으로 전달한 FAQ 를 렌더하고 기본 항목은 숨긴다 (PG 랜딩 공용)', () => {
    const custom = [{ q: 'PG 전용 질문?', a: 'PG 전용 답변' }];
    render(<FaqList items={custom} />);
    expect(screen.getByText('PG 전용 질문?')).toBeInTheDocument();
    expect(screen.getByText('PG 전용 답변')).toBeInTheDocument();
    expect(screen.queryByText(/도입 수수료가 있나요/)).toBeNull();
  });

  it('exports FAQ_ITEMS as a non-empty array with q and a strings', () => {
    expect(FAQ_ITEMS.length).toBeGreaterThan(0);
    FAQ_ITEMS.forEach((item: { q: string; a: string }) => {
      expect(typeof item.q).toBe('string');
      expect(typeof item.a).toBe('string');
    });
  });
});
