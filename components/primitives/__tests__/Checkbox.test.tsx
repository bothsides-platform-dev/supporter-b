import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Checkbox } from '../Checkbox';

afterEach(() => {
  cleanup();
});

describe('Checkbox', () => {
  it('키보드 초점이 보이는 박스로 전달되고 Space로 토글한다', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox id="terms" checked={false} onCheckedChange={onCheckedChange} aria-label="이용약관 동의" />);
    await user.tab();
    expect(screen.getByRole('checkbox')).toHaveFocus();
    // Tailwind peer variants use a following-sibling selector. The invisible input
    // must precede the visible box for keyboard focus (and hover) feedback to match.
    expect(screen.getByTestId('checkbox-box').matches('.peer:focus-visible ~ *')).toBe(true);
    await user.keyboard(' ');
    expect(onCheckedChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('비활성 체크박스는 Tab과 클릭으로 변경되지 않는다', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<><Checkbox id="terms" checked={false} disabled onCheckedChange={onCheckedChange} aria-label="이용약관 동의" /><button>다음</button></>);
    await user.tab();
    expect(screen.getByRole('button')).toHaveFocus();
    await user.click(screen.getByRole('checkbox'));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

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

  it('calls onCheckedChange when the native checkbox is clicked', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox id="terms" checked={false} onCheckedChange={onCheckedChange} aria-label="이용약관 동의" />);

    await user.click(screen.getByRole('checkbox', { name: '이용약관 동의' }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('calls onCheckedChange when the visible checkbox box is clicked inside a label', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <label htmlFor="terms">
        <Checkbox id="terms" checked={false} onCheckedChange={onCheckedChange} />
        <span>이용약관 동의</span>
      </label>,
    );

    await user.click(screen.getByTestId('checkbox-box'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

});
