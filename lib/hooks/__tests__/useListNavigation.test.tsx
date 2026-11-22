import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { useListNavigation, type ListKeyHandlers } from '../useListNavigation';

afterEach(cleanup);

function Harness({
  length = 3,
  handlers = {},
  enabled,
}: {
  length?: number;
  handlers?: ListKeyHandlers;
  enabled?: boolean;
}) {
  const { active } = useListNavigation(length, handlers, { enabled });
  return (
    <div>
      <output data-testid="active">{active}</output>
      <button type="button">필터 칩</button>
      <div role="tablist" aria-label="탭">
        <div role="tab" tabIndex={0}>
          탭 하나
        </div>
      </div>
      <div role="dialog" aria-label="확인창">
        <div data-testid="in-dialog" tabIndex={-1}>
          확인창 본문
        </div>
        <button type="button">확인창 버튼</button>
      </div>
    </div>
  );
}

const active = () => screen.getByTestId('active').textContent;

/** 키 이벤트를 보내고 기본 동작이 막혔는지 돌려준다. */
function press(target: Element | Document, init: KeyboardEventInit) {
  const event = createEvent.keyDown(target, init);
  fireEvent(target, event);
  return event.defaultPrevented;
}

describe('useListNavigation', () => {
  it('한글 자판에서도 물리 키(J/K)로 행을 옮긴다', () => {
    render(<Harness />);
    expect(active()).toBe('-1');
    press(document, { key: 'ㅓ', code: 'KeyJ' });
    expect(active()).toBe('0');
    press(document, { key: 'ㅓ', code: 'KeyJ' });
    expect(active()).toBe('1');
    press(document, { key: 'ㅏ', code: 'KeyK' });
    expect(active()).toBe('0');
  });

  it('Shift 를 누른 물리 키는 이동으로 보지 않는다', () => {
    render(<Harness />);
    press(document, { key: 'J', code: 'KeyJ', shiftKey: true });
    expect(active()).toBe('-1');
  });

  it('행이 강조된 채 버튼에서 누른 Enter 는 버튼의 것이다', () => {
    const onEnter = vi.fn();
    render(<Harness handlers={{ onEnter }} />);
    press(document, { key: 'j' });
    expect(active()).toBe('0');
    const prevented = press(screen.getByRole('button', { name: '필터 칩' }), { key: 'Enter' });
    expect(prevented).toBe(false);
    expect(onEnter).not.toHaveBeenCalled();
    // 포커스가 버튼 밖이면 강조된 행을 연다.
    press(document, { key: 'Enter' });
    expect(onEnter).toHaveBeenCalledWith(0);
  });

  it('E 는 버튼에 포커스가 있어도 강조된 행의 단축키로 동작한다', () => {
    const onEdit = vi.fn();
    render(<Harness handlers={{ onEdit }} />);
    press(document, { key: 'j' });
    press(screen.getByRole('button', { name: '필터 칩' }), { key: 'ㄷ', code: 'KeyE' });
    expect(onEdit).toHaveBeenCalledWith(0);
  });

  it('확인창 안의 키는 뒤에 깔린 목록이 반응하지 않는다', () => {
    const onEnter = vi.fn();
    render(<Harness handlers={{ onEnter }} />);
    press(document, { key: 'j' });
    expect(press(screen.getByTestId('in-dialog'), { key: 'j' })).toBe(false);
    expect(active()).toBe('0');
    press(screen.getByTestId('in-dialog'), { key: 'Enter' });
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('방향키를 스스로 쓰는 위젯 안에서는 방향키를 빼앗지 않는다', () => {
    render(<Harness />);
    expect(press(screen.getByRole('tab'), { key: 'ArrowDown' })).toBe(false);
    expect(active()).toBe('-1');
    // J 는 탭 위젯의 키가 아니므로 그대로 이동한다.
    press(screen.getByRole('tab'), { key: 'j' });
    expect(active()).toBe('0');
  });

  it('enabled=false 면 키를 듣지 않는다', () => {
    const onEnter = vi.fn();
    render(<Harness handlers={{ onEnter }} enabled={false} />);
    expect(press(document, { key: 'j' })).toBe(false);
    expect(active()).toBe('-1');
  });
});
