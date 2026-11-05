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

  // 충족 항목은 물러나고(회색), 미충족은 입력 중엔 진한 기본색, 제출이 막힌 뒤에만 오류색.
  it('marks rule rows met/unmet while typing and escalates unmet rows only after a blocked submit', () => {
    const rowState = (label: string) => screen.getByText(label).closest('li')?.getAttribute('data-state');
    const { rerender, onChange } = setup({ value: 'Xk7mQ2vLpR9nT4w', showStrength: true });
    expect(rowState('10자 이상')).toBe('met');
    expect(rowState('특수문자 포함')).toBe('unmet');

    rerender(
      <PasswordField label="비밀번호" value="Xk7mQ2vLpR9nT4w" onChange={onChange} showStrength showRuleErrors />,
    );
    expect(rowState('10자 이상')).toBe('met');
    expect(rowState('특수문자 포함')).toBe('error');
    expect(screen.getByText('특수문자 포함').closest('li')).toHaveTextContent('미충족');
  });

  it('links the error message to the input via aria-describedby', () => {
    setup({ error: '비밀번호를 입력해요.' });
    const input = screen.getByLabelText('비밀번호');
    expect(input).toHaveAccessibleDescription('비밀번호를 입력해요.');
  });

  it('hides the rule checklist when value is empty even with showStrength', () => {
    setup({ value: '', showStrength: true });
    expect(screen.queryByText('10자 이상')).toBeNull();
  });

  it('renders the error message when error prop is set', () => {
    setup({ error: '비밀번호가 서로 달라요. 같은 비밀번호를 입력해요.' });
    expect(screen.getByText('비밀번호가 서로 달라요. 같은 비밀번호를 입력해요.')).toBeDefined();
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
