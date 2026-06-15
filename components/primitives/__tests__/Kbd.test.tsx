import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Kbd } from '../Kbd';

afterEach(() => cleanup());

describe('Kbd', () => {
  it('renders its children', () => {
    render(<Kbd>⌘K</Kbd>);
    expect(screen.getByText('⌘K')).toBeInTheDocument();
  });

  it('marks itself with data-slot="kbd" so tooltip styling can target it', () => {
    render(<Kbd>G</Kbd>);
    expect(screen.getByText('G')).toHaveAttribute('data-slot', 'kbd');
  });

  it('renders as a <kbd> element', () => {
    render(<Kbd>H</Kbd>);
    expect(screen.getByText('H').tagName).toBe('KBD');
  });
});
