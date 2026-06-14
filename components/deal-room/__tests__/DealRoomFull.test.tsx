import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

import { DealRoomFull } from '../DealRoomFull';

afterEach(cleanup);

describe('DealRoomFull', () => {
  it('page 모드 셸을 전체높이 호스트에 렌더한다 (닫기/전체화면 버튼 없음)', () => {
    const { container } = render(
      <DealRoomFull code="P-1" title="카드 PG 견적" chat={<div>chat</div>}>
        <p>본문</p>
      </DealRoomFull>,
    );
    expect(screen.getByText('본문')).toBeInTheDocument();
    expect(screen.getByText('카드 PG 견적')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '전체화면' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '이전 견적' })).not.toBeInTheDocument();
    // 내부 패널이 스크롤을 소유하도록 호스트 루트가 전체높이 + overflow-hidden
    expect(container.firstChild).toHaveClass('h-full');
    expect(container.firstChild).toHaveClass('overflow-hidden');
  });
});
