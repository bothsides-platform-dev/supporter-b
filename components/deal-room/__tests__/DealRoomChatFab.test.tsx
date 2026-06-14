import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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
