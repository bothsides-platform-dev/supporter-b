import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useTutorialKeyboardLock } from '../useTutorialKeyboardLock';

function Locked() {
  useTutorialKeyboardLock();
  return <input aria-label="필드" defaultValue="프리필" />;
}

afterEach(() => {
  cleanup();
});

describe('useTutorialKeyboardLock', () => {
  it('마운트 중에는 input에 타이핑해도 값이 바뀌지 않는다', async () => {
    const user = userEvent.setup();
    render(<Locked />);
    const input = screen.getByLabelText('필드') as HTMLInputElement;

    await user.click(input);
    await user.keyboard('abc');
    expect(input.value).toBe('프리필');
  });

  it('Backspace/Delete로 프리필 값을 지울 수 없다', async () => {
    const user = userEvent.setup();
    render(<Locked />);
    const input = screen.getByLabelText('필드') as HTMLInputElement;

    await user.click(input);
    await user.keyboard('{Backspace}{Delete}');
    expect(input.value).toBe('프리필');
  });

  it('Escape 키는 window 리스너까지 전파된다 (코치마크 스킵용)', async () => {
    const user = userEvent.setup();
    const onEscape = vi.fn();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', handler);
    render(<Locked />);

    await user.keyboard('{Escape}');
    expect(onEscape).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', handler);
  });

  it('버튼에서는 Enter/Space가 통과한다 (키보드 접근성 — 편집 요소만 차단)', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(
      <>
        <Locked />
        <button type="button" onClick={onActivate}>
          진행
        </button>
      </>,
    );
    const button = screen.getByRole('button', { name: '진행' });
    button.focus();
    await user.keyboard('{Enter}');
    expect(onActivate).toHaveBeenCalled();
  });

  it('Tab은 input에서도 통과한다 (포커스 이동 가능)', () => {
    render(<Locked />);
    const input = screen.getByLabelText('필드') as HTMLInputElement;
    input.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('modifier 체인(Cmd/Ctrl+C 등)은 input에서도 통과한다', () => {
    render(<Locked />);
    const input = screen.getByLabelText('필드') as HTMLInputElement;
    input.focus();
    const event = new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('beforeinput은 차단된다 (컨텍스트메뉴 붙여넣기·IME 조합 방어)', () => {
    render(<Locked />);
    const input = screen.getByLabelText('필드') as HTMLInputElement;
    const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, data: 'x' });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('언마운트 후에는 타이핑이 정상 동작한다', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Locked />);
    unmount();

    render(<input aria-label="자유필드" defaultValue="" />);
    const input = screen.getByLabelText('자유필드') as HTMLInputElement;
    await user.click(input);
    await user.keyboard('abc');
    expect(input.value).toBe('abc');
  });
});
