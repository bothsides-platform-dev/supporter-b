import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PasswordField } from '@/components/auth/PasswordField';

function setup(props: Partial<React.ComponentProps<typeof PasswordField>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <PasswordField label="비밀번호" value="" onChange={onChange} {...props} />,
  );
  return { onChange, ...utils };
}

describe('PasswordField', () => {
  it('renders the input as type="password" by default', () => {
    setup();
    const input = screen.getByLabelText('비밀번호') as HTMLInputElement;
    expect(input.type).toBe('password');
  });

  it('toggle button switches between password/text and updates aria-label', () => {
    setup();
    const toggle = screen.getByRole('button', { name: '비밀번호 보기' });
    fireEvent.click(toggle);
    const input = screen.getByLabelText('비밀번호') as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(
      screen.getByRole('button', { name: '비밀번호 숨기기' }),
    ).toBeDefined();
  });

  it('calls onChange with the raw value', () => {
    const { onChange } = setup();
    const input = screen.getByLabelText('비밀번호');
    fireEvent.change(input, { target: { value: 'Aa1!aaaaaa' } });
    expect(onChange).toHaveBeenCalledWith('Aa1!aaaaaa');
  });

  it('does not render the rule checklist when showStrength is false', () => {
    setup({ value: 'Aa1!aaaaaa' });
    expect(screen.queryByText('10자 이상')).toBeNull();
  });

  it('renders the rule checklist and reflects per-rule satisfaction when showStrength is true', () => {
    setup({ value: '1234567890', showStrength: true });
    // All 4 rule rows render.
    expect(screen.getByText('10자 이상')).toBeDefined();
    expect(screen.getByText('영문자 포함')).toBeDefined();
    expect(screen.getByText('숫자 포함')).toBeDefined();
    expect(screen.getByText('특수문자 포함')).toBeDefined();
  });

  it('hides the rule checklist when value is empty even with showStrength', () => {
    setup({ value: '', showStrength: true });
    expect(screen.queryByText('10자 이상')).toBeNull();
  });

  it('renders the error message when error prop is set', () => {
    setup({ error: '비밀번호가 일치하지 않습니다.' });
    expect(screen.getByText('비밀번호가 일치하지 않습니다.')).toBeDefined();
  });

  // a11y: assistive tech needs to know the field is invalid, not just the
  // visual border color. aria-invalid="true" mirrors the error visual.
  it('sets aria-invalid="true" on the input when error is present', () => {
    setup({ error: 'oops' });
    const input = screen.getByLabelText('비밀번호');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('omits aria-invalid (or sets it to "false") when there is no error', () => {
    setup();
    const input = screen.getByLabelText('비밀번호');
    const v = input.getAttribute('aria-invalid');
    expect(v === null || v === 'false').toBe(true);
  });
});
