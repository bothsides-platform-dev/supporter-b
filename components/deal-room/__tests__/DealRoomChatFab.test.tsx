import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

import { DealRoomChatFab } from '../DealRoomChatFab';

afterEach(cleanup);

describe('DealRoomChatFab', () => {
  it('짧은 드래그와 취소는 복귀하고 충분히 아래로 끌면 닫힌다', async () => {
    const user = userEvent.setup();
    render(<DealRoomChatFab><div>채팅내용</div></DealRoomChatFab>);
    await user.click(screen.getByRole('button', { name: '채팅 열기' }));
    const dialog = await screen.findByRole('dialog');
    const handle = dialog.querySelector('[aria-hidden="true"]') as HTMLElement;
    handle.setPointerCapture = vi.fn();
    function pointer(type: string, y: number, time: number) {
      const event = new Event(type, { bubbles: true });
      Object.defineProperties(event, {
        pointerId: { value: 1 }, isPrimary: { value: true }, button: { value: 0 },
        clientY: { value: y }, timeStamp: { value: time },
      });
      fireEvent(handle, event);
    }
    pointer('pointerdown', 0, 0);
    pointer('pointermove', 20, 200);
    pointer('pointerup', 20, 400);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    pointer('pointerdown', 0, 500);
    pointer('pointermove', 400, 700);
    pointer('pointercancel', 400, 900);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    pointer('pointerdown', 0, 1000);
    pointer('pointermove', 400, 1200);
    pointer('pointerup', 400, 1400);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Escape로 닫고 열기 버튼에 초점을 복원하며 다시 열 수 있다', async () => {
    const user = userEvent.setup();
    render(<DealRoomChatFab><div>채팅내용</div></DealRoomChatFab>);
    const trigger = screen.getByRole('button', { name: '채팅 열기' });
    await user.click(trigger);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);
    expect(await screen.findByText('채팅내용')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('FAB 클릭 시 하단 시트에 채팅 노드를 연다 (기본 닫힘)', async () => {
    const user = userEvent.setup();
    render(
      <DealRoomChatFab>
        <div>채팅내용</div>
      </DealRoomChatFab>,
    );
    // 기본 닫힘 — 시트(포털)는 열기 전 미마운트라 채팅 노드도 없다.
    expect(screen.queryByText('채팅내용')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '채팅 열기' }));
    expect(await screen.findByText('채팅내용')).toBeInTheDocument();
  });
});
