import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const back = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back, replace }),
}));

import { DealRoomModal } from '../DealRoomModal';
import { useDealRoomNav } from '@/lib/stores/deal-room-nav';

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  useDealRoomNav.getState().setOrder('', []);
});

afterEach(() => {
  cleanup();
  back.mockClear();
  replace.mockClear();
});

describe('DealRoomModal', () => {
  it('제목과 본문을 모달에 렌더한다', () => {
    render(
      <DealRoomModal code="P-2606-0042" title="카드 PG 견적 요청">
        <p>딜룸 본문</p>
      </DealRoomModal>,
    );
    expect(screen.getByText('카드 PG 견적 요청')).toBeInTheDocument();
    expect(screen.getByText('딜룸 본문')).toBeInTheDocument();
  });

  it('닫기 버튼 클릭 시 router.back 으로 모달을 닫는다', async () => {
    const user = userEvent.setup();
    render(
      <DealRoomModal code="P-1" title="t">
        x
      </DealRoomModal>,
    );
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('전체화면 버튼 토글 시 모달에 data-fullscreen 이 켜진다 (CSS 확장)', async () => {
    const user = userEvent.setup();
    render(
      <DealRoomModal code="P-1" title="t">
        x
      </DealRoomModal>,
    );
    const modal = screen.getByTestId('deal-room-modal');
    expect(modal).not.toHaveAttribute('data-fullscreen', 'true');
    await user.click(screen.getByRole('button', { name: '전체화면' }));
    expect(screen.getByTestId('deal-room-modal')).toHaveAttribute('data-fullscreen', 'true');
  });

  it('목록 순서가 시드되면 ‹ › 가 prev/next 코드로 router.replace 한다', async () => {
    const user = userEvent.setup();
    useDealRoomNav.getState().setOrder('/rfp', ['P-1', 'P-2', 'P-3']);
    render(
      <DealRoomModal code="P-2" title="t">
        x
      </DealRoomModal>,
    );
    await user.click(screen.getByRole('button', { name: '다음 견적' }));
    expect(replace).toHaveBeenCalledWith('/rfp/P-3');
    await user.click(screen.getByRole('button', { name: '이전 견적' }));
    expect(replace).toHaveBeenCalledWith('/rfp/P-1');
  });

  it('목록 컨텍스트가 없으면 ‹ › 가 비활성된다', () => {
    render(
      <DealRoomModal code="P-1" title="t">
        x
      </DealRoomModal>,
    );
    expect(screen.getByRole('button', { name: '이전 견적' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음 견적' })).toBeDisabled();
  });
});
