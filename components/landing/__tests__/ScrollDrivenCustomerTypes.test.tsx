import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

// ScrollPinnedSection 이 쓰는 motion 훅(useScroll/useMotionValueEvent)을 평탄화한다.
// 스크롤 구동은 jsdom 에서 재현 불가 → 초기 상태(activeStep 0)로 렌더되지만, 누적 스택은
// 모든 카드를 DOM 에 렌더하므로(가시성은 opacity 로만 제어) 카드 존재 여부로 동작을 검증한다.
vi.mock('motion/react', () => {
  const makeEl = (tag: string) => {
    const El = ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(
        tag,
        Object.fromEntries(
          Object.entries(props).filter(
            ([k]) =>
              !['initial', 'animate', 'transition', 'exit', 'whileInView', 'viewport'].includes(k),
          ),
        ),
        children as React.ReactNode,
      );
    El.displayName = `motion.${tag}`;
    return El;
  };
  return {
    motion: new Proxy({}, { get: (_, tag: string) => makeEl(tag) }),
    useScroll: () => ({ scrollYProgress: { on: vi.fn() } }),
    useMotionValueEvent: vi.fn(),
    useTransform: () => 1,
  };
});

import { ScrollDrivenCustomerTypes } from '../scroll-pinned/ScrollDrivenCustomerTypes';

const ITEMS = [
  { title: '카드1 제목', desc: '카드1 설명' },
  { title: '카드2 제목', desc: '카드2 설명' },
  { title: '카드3 제목', desc: '카드3 설명' },
];

describe('ScrollDrivenCustomerTypes — 스크롤 누적 리스트', () => {
  it('헤딩과 모든 카드(제목·설명)를 한 번에 렌더한다(누적 스택, 캐러셀 아님)', () => {
    render(<ScrollDrivenCustomerTypes heading={<h2>고객사 유형</h2>} items={ITEMS} />);
    expect(screen.getByText('고객사 유형')).toBeInTheDocument();
    for (const item of ITEMS) {
      expect(screen.getByText(item.title)).toBeInTheDocument();
      expect(screen.getByText(item.desc)).toBeInTheDocument();
    }
  });

  it('캐러셀 컨트롤(이전/다음)을 렌더하지 않는다', () => {
    render(<ScrollDrivenCustomerTypes heading={<h2>고객사 유형</h2>} items={ITEMS} />);
    expect(screen.queryByRole('button', { name: '다음' })).toBeNull();
    expect(screen.queryByRole('button', { name: '이전' })).toBeNull();
  });
});
