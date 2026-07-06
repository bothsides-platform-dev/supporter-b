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

import { WORDMARK_PATHS } from '@/components/primitives/wordmark-paths.generated';
import { HeroKineticHeadline, BrandWordB } from '../HeroKineticHeadline';

describe('HeroKineticHeadline', () => {
  it('renders the buyer brand line as 서포트 B를 통해, with 서포트 B drawn as the vector wordmark', () => {
    render(<HeroKineticHeadline />);

    const heading = screen.getByRole('heading', { level: 1 });
    // sr-only 텍스트가 접근성/텍스트 검색용으로 "서포트 B" 를 그대로 노출한다
    expect(heading).toHaveTextContent('서포트 B를 통해');
    const svg = heading.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg?.querySelectorAll('path').length).toBe(WORDMARK_PATHS.glyphs.length);
  });

  it('renders the trailing particle as plain text next to the vector wordmark', () => {
    render(
      <h1>
        <BrandWordB particle="로" />
      </h1>,
    );

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('서포트 B로');
    expect(screen.getByText('로').closest('svg')).toBeNull();
  });
});
