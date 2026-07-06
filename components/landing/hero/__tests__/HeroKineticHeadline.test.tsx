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

vi.mock('../ScrambleText', () => ({
  ScrambleText: ({ phrases, className }: { phrases: string[]; className?: string }) => (
    <span className={className}>{phrases[0]}</span>
  ),
}));

import { HeroKineticHeadline, BrandWordB } from '../HeroKineticHeadline';

describe('HeroKineticHeadline', () => {
  it('renders the buyer brand line as text-only 서포트 B를 통해 without an inline svg mark', () => {
    render(<HeroKineticHeadline />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('서포트 B를 통해');
    expect(heading.querySelector('svg')).toBeNull();
  });

  it('renders only 서포트 B in bold while leaving the trailing particle unbolded', () => {
    render(
      <h1>
        <BrandWordB particle="로" />
      </h1>,
    );

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('서포트 B로');
    expect(screen.getByText('서포트 B')).toHaveClass('font-black');
    expect(screen.getByText('로')).not.toHaveClass('font-black');
  });
});
