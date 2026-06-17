// ChatComposerTextarea — 채팅 컴포저 공용 입력(자동 높이 + IME 안전 Enter 전송).
// 핵심 계약: 한글 IME 조합 확정 Enter(isComposing)·Shift+Enter 는 전송하지 않는다.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ChatComposerTextarea } from '../ChatComposerTextarea';

function setup(extra: Record<string, unknown> = {}) {
  const onChange = vi.fn();
  const onSubmit = vi.fn();
  render(
    <ChatComposerTextarea
      value=""
      onChange={onChange}
      onSubmit={onSubmit}
      placeholder="msg"
      {...extra}
    />,
  );
  return { onChange, onSubmit, ta: screen.getByPlaceholderText('msg') };
}

describe('ChatComposerTextarea', () => {
  it('Enter (no shift, not composing) submits and prevents default newline', () => {
    const { onSubmit, ta } = setup();
    const notPrevented = fireEvent.keyDown(ta, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(false); // preventDefault was called
  });

  it('Shift+Enter does not submit (newline)', () => {
    const { onSubmit, ta } = setup();
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Enter during IME composition does not submit', () => {
    const { onSubmit, ta } = setup();
    fireEvent.keyDown(ta, { key: 'Enter', isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('typing reports the new value via onChange', () => {
    const { onChange, ta } = setup();
    fireEvent.change(ta, { target: { value: '안녕' } });
    expect(onChange).toHaveBeenCalledWith('안녕');
  });

  it('forwards disabled, maxLength and className', () => {
    const { ta } = setup({ disabled: true, maxLength: 4000, className: 'x-cls' });
    expect(ta).toBeDisabled();
    expect(ta).toHaveAttribute('maxlength', '4000');
    expect(ta).toHaveClass('x-cls');
  });
});
