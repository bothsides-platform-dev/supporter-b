import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SupportBWordmark } from '../Logo';

afterEach(() => cleanup());

describe('SupportBWordmark', () => {
  it('renders an aria-hidden svg with one path per glyph (서·포·트·마크)', () => {
    const { container } = render(<SupportBWordmark />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg?.querySelectorAll('path').length).toBe(4);
  });

  it('keeps "서포트 B" readable for screen readers/text search via sr-only text', () => {
    render(<SupportBWordmark />);
    expect(screen.getByText('서포트 B')).toHaveClass('sr-only');
  });

  it('applies colorVar as the svg fill color', () => {
    const { container } = render(<SupportBWordmark colorVar="--md-sys-color-inverse-on-surface" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('fill', 'var(--md-sys-color-inverse-on-surface)');
  });

  it('defaults colorVar to on-surface when not specified', () => {
    const { container } = render(<SupportBWordmark />);
    expect(container.querySelector('svg')).toHaveAttribute('fill', 'var(--md-sys-color-on-surface)');
  });

  it('renders particle as plain visible text after the wordmark, not inside the svg', () => {
    render(<SupportBWordmark particle="를" />);
    const particle = screen.getByText('를');
    expect(particle.tagName).not.toBe('svg');
    expect(particle.closest('svg')).toBeNull();
  });

  it('renders no particle text when particle is empty', () => {
    render(<SupportBWordmark />);
    expect(screen.queryByText('를')).toBeNull();
    expect(screen.queryByText('로')).toBeNull();
  });

  it('forwards className to the wrapping span', () => {
    const { container } = render(<SupportBWordmark className="text-[22px]" />);
    expect(container.querySelector('span.text-\\[22px\\]')).not.toBeNull();
  });

  it('keeps the wordmark and particle on one line (whitespace-nowrap, no line-break opportunity)', () => {
    const { container } = render(<SupportBWordmark particle="로" />);
    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveClass('whitespace-nowrap');
  });
});
