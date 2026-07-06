import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

// FadeInView(진입 스태거)가 motion whileInView 를 쓰므로 평탄화 → 자식이 그대로 렌더된다.
vi.mock('motion/react', () => {
  const makeEl = (tag: string) => {
    const El = ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(
        tag,
        Object.fromEntries(
          Object.entries(props).filter(
            ([k]) =>
              !['initial', 'animate', 'whileInView', 'viewport', 'transition', 'exit'].includes(k),
          ),
        ),
        children as React.ReactNode,
      );
    El.displayName = `motion.${tag}`;
    return El;
  };
  return { motion: new Proxy({}, { get: (_, tag: string) => makeEl(tag) }) };
});

import { CustomerTypesGrid } from '../CustomerTypesGrid';

const ITEMS = [
  { title: '카드1 제목', desc: '카드1 설명' },
  { title: '카드2 제목', desc: '카드2 설명' },
  { title: '카드3 제목', desc: '카드3 설명' },
  { title: '카드4 제목', desc: '카드4 설명' },
];

describe('CustomerTypesGrid — 정적 2x2 그리드', () => {
  it('헤딩과 모든 카드(제목·설명)를 한 번에 렌더한다', () => {
    render(<CustomerTypesGrid heading={<h2>고객사 유형</h2>} items={ITEMS} />);
    expect(screen.getByText('고객사 유형')).toBeInTheDocument();
    for (const item of ITEMS) {
      expect(screen.getByText(item.title)).toBeInTheDocument();
      expect(screen.getByText(item.desc)).toBeInTheDocument();
    }
  });

  it('캐러셀 컨트롤(이전/다음)을 렌더하지 않는다', () => {
    render(<CustomerTypesGrid heading={<h2>고객사 유형</h2>} items={ITEMS} />);
    expect(screen.queryByRole('button', { name: '다음' })).toBeNull();
    expect(screen.queryByRole('button', { name: '이전' })).toBeNull();
  });
});
