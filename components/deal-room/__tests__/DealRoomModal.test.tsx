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
  useDealRoomNav.setState({ basePath: '', codes: [], fullscreen: false });
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

  it('첫 항목에서는 이전이, 마지막 항목에서는 다음이 비활성된다 (경계)', () => {
    useDealRoomNav.getState().setOrder('/rfp', ['P-1', 'P-2', 'P-3']);
    const { rerender } = render(
      <DealRoomModal code="P-1" title="t">
        x
      </DealRoomModal>,
    );
    expect(screen.getByRole('button', { name: '이전 견적' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음 견적' })).not.toBeDisabled();

    rerender(
      <DealRoomModal code="P-3" title="t">
        x
      </DealRoomModal>,
    );
    expect(screen.getByRole('button', { name: '다음 견적' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '이전 견적' })).not.toBeDisabled();
  });

  it('현재 코드가 목록에 없으면 ‹ › 가 모두 비활성된다', () => {
    useDealRoomNav.getState().setOrder('/rfp', ['P-1', 'P-2', 'P-3']);
    render(
      <DealRoomModal code="P-9" title="t">
        x
      </DealRoomModal>,
    );
    expect(screen.getByRole('button', { name: '이전 견적' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음 견적' })).toBeDisabled();
  });

  it('전체화면 토글 후 리마운트(이전/다음)에도 전체화면이 보존된다', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <DealRoomModal key="P-1" code="P-1" title="t">
        x
      </DealRoomModal>,
    );
    await user.click(screen.getByRole('button', { name: '전체화면' }));
    expect(screen.getByTestId('deal-room-modal')).toHaveAttribute('data-fullscreen', 'true');
    // key 변경 → 리마운트(로컬 useState 라면 리셋될 상황). 스토어 보유라 보존된다.
    rerender(
      <DealRoomModal key="P-2" code="P-2" title="t">
        x
      </DealRoomModal>,
    );
    expect(screen.getByTestId('deal-room-modal')).toHaveAttribute('data-fullscreen', 'true');
  });

  it('닫기 시 전체화면을 해제한다 (다음 오픈은 윈도우드) — 이전/다음은 close 를 거치지 않아 보존', async () => {
    const user = userEvent.setup();
    render(
      <DealRoomModal code="P-1" title="t">
        x
      </DealRoomModal>,
    );
    await user.click(screen.getByRole('button', { name: '전체화면' }));
    expect(useDealRoomNav.getState().fullscreen).toBe(true);
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(useDealRoomNav.getState().fullscreen).toBe(false);
    expect(back).toHaveBeenCalled();
  });
});
