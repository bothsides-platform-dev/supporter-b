import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

vi.mock('motion/react', () => {
  const makeEl = (tag: string) => {
    const El = ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(tag, props, children as React.ReactNode);
    El.displayName = `motion.${tag}`;
    return El;
  };

  return {
    motion: new Proxy({}, { get: (_, tag: string) => makeEl(tag) }),
  };
});

import { HeroKineticHeadline, BrandWordB } from '../HeroKineticHeadline';

describe('HeroKineticHeadline', () => {
  it('includes the buyer benefit in the accessible heading, after the complete fixed sentence', () => {
    render(<HeroKineticHeadline />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveAccessibleName('서포트비가 만듭니다. PG 수수료를 낮출 기회를');
    expect(heading.querySelector('svg')).toBeNull();
  });

  it('includes custom PG content in the heading with the fixed verb before the rolling phrase', () => {
    render(
      <HeroKineticHeadline
        line1Words={[<BrandWordB key="brand" particle="로" />]}
        phrases={['조건이 정리된 리드를']}
        suffix="만나세요."
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName(
      '서포트비로 만나세요. 조건이 정리된 리드를',
    );
  });

  it('renders only 서포트비 in bold while leaving the trailing particle unbolded', () => {
    render(
      <h1>
        <BrandWordB particle="로" />
      </h1>,
    );

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('서포트비로');
    expect(screen.getByText('서포트비')).toHaveClass('font-black');
    expect(screen.getByText('로')).not.toHaveClass('font-black');
  });
});
