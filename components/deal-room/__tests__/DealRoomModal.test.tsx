import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const back = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back }),
}));

import { DealRoomModal } from '../DealRoomModal';

beforeEach(() => {
  // base-ui Dialog 가 jsdom 에서 마운트될 때 필요할 수 있는 스텁.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  back.mockClear();
});

describe('DealRoomModal', () => {
  it('제목과 본문을 모달에 렌더한다', () => {
    render(
      <DealRoomModal code="P-2606-0042" title="카드 PG 견적 요청" fullscreenHref="/rfp/P-2606-0042">
        <p>딜룸 본문</p>
      </DealRoomModal>,
    );
    expect(screen.getByText('카드 PG 견적 요청')).toBeInTheDocument();
    expect(screen.getByText('딜룸 본문')).toBeInTheDocument();
  });

  it('닫기 버튼 클릭 시 router.back 으로 모달을 닫는다', async () => {
    const user = userEvent.setup();
    render(
      <DealRoomModal code="P-1" title="t" fullscreenHref="/rfp/P-1">
        x
      </DealRoomModal>,
    );
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(back).toHaveBeenCalledTimes(1);
  });
});
