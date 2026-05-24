import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Checkbox } from '../Checkbox';

afterEach(() => {
  cleanup();
});

describe('Checkbox', () => {
  it('renders unchecked with on-surface-variant border', () => {
    render(<Checkbox id="terms" checked={false} onCheckedChange={() => {}} aria-label="이용약관 동의" />);

    const box = screen.getByTestId('checkbox-box');
    expect(box).toHaveAttribute('data-state', 'unchecked');
    expect(box.className).toContain('border-[var(--md-sys-color-on-surface-variant)]');
    expect(box.className).not.toContain('bg-[var(--md-sys-color-primary)]');
  });

  it('renders checked with primary fill and on-primary check stroke', () => {
    render(<Checkbox id="terms" checked onCheckedChange={() => {}} aria-label="이용약관 동의" />);

    const box = screen.getByTestId('checkbox-box');
    expect(box).toHaveAttribute('data-state', 'checked');
    expect(box.className).toContain('border-[var(--md-sys-color-primary)]');
    expect(box.className).toContain('bg-[var(--md-sys-color-primary)]');

    const check = screen.getByTestId('checkbox-check').querySelector('path');
    expect(check?.getAttribute('stroke')).toBe('var(--md-sys-color-on-primary)');
  });

  it('calls onCheckedChange when clicked', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox id="terms" checked={false} onCheckedChange={onCheckedChange} aria-label="이용약관 동의" />);

    await user.click(screen.getByRole('checkbox', { name: '이용약관 동의' }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
