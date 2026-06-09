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

import { FadeInView } from '../FadeInView';

describe('FadeInView', () => {
  it('renders its children', () => {
    render(<FadeInView><span>hello</span></FadeInView>);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('accepts an optional delay prop without error', () => {
    expect(() =>
      render(<FadeInView delay={0.1}><span>ok</span></FadeInView>)
    ).not.toThrow();
  });

  it('accepts an optional className prop without error', () => {
    expect(() =>
      render(<FadeInView className="test-cls"><span>ok</span></FadeInView>)
    ).not.toThrow();
  });
});
