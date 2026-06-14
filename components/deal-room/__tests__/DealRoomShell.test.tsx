import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

// 브레이크포인트를 테스트에서 제어 — 기본 lg 이상(aside).
const mq = vi.hoisted(() => ({ lgUp: true }));
vi.mock('@/hooks/use-lg-up', () => ({ useIsLgUp: () => mq.lgUp }));

import { DealRoomShell } from '../DealRoomShell';

afterEach(() => {
  cleanup();
  mq.lgUp = true;
});

describe('DealRoomShell', () => {
  it('상단바에 코드·제목과 본문을 표시한다', () => {
    render(
      <DealRoomShell mode="modal" code="P-2606-0042" title="카드 PG 견적 요청">
        <p>딜룸 본문</p>
      </DealRoomShell>,
    );
    expect(screen.getByText('P-2606-0042')).toBeInTheDocument();
    expect(screen.getByText('카드 PG 견적 요청')).toBeInTheDocument();
    expect(screen.getByText('딜룸 본문')).toBeInTheDocument();
  });

  it('modal 모드에서 닫기 버튼 클릭 시 onClose 를 호출한다', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <DealRoomShell mode="modal" code="P-1" title="t" onClose={onClose}>
        x
      </DealRoomShell>,
    );
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('전체화면 버튼 클릭 시 onToggleFullscreen 을 호출한다', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <DealRoomShell
        mode="modal"
        code="P-1"
        title="t"
        onToggleFullscreen={onToggle}
      >
        x
      </DealRoomShell>,
    );
    await user.click(screen.getByRole('button', { name: '전체화면' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('fullscreen=true 면 버튼 라벨이 창 모드로 바뀐다', () => {
    render(
      <DealRoomShell
        mode="modal"
        code="P-1"
        title="t"
        fullscreen
        onToggleFullscreen={() => {}}
      >
        x
      </DealRoomShell>,
    );
    expect(screen.getByRole('button', { name: '창 모드로' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '전체화면' })).not.toBeInTheDocument();
  });

  it('이전/다음 버튼은 hasPrev/hasNext 로 활성화되고 클릭 시 콜백을 호출한다', async () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const user = userEvent.setup();
    render(
      <DealRoomShell
        mode="modal"
        code="P-1"
        title="t"
        onPrev={onPrev}
        onNext={onNext}
        hasPrev={false}
        hasNext
      >
        x
      </DealRoomShell>,
    );
    expect(screen.getByRole('button', { name: '이전 견적' })).toBeDisabled();
    const next = screen.getByRole('button', { name: '다음 견적' });
    expect(next).toBeEnabled();
    await user.click(next);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('page 모드에서는 닫기·전체화면 버튼을 숨긴다', () => {
    render(
      <DealRoomShell
        mode="page"
        code="P-1"
        title="t"
        onClose={() => {}}
        onToggleFullscreen={() => {}}
      >
        x
      </DealRoomShell>,
    );
    expect(screen.queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '전체화면' })).not.toBeInTheDocument();
  });

  it('lg 이상이면 chat 슬롯을 aside 로 본문과 함께 렌더하고 FAB 는 없다', () => {
    mq.lgUp = true;
    render(
      <DealRoomShell mode="modal" code="P-1" title="t" chat={<div>채팅 패널 내용</div>}>
        <p>가운데 본문</p>
      </DealRoomShell>,
    );
    expect(screen.getByText('채팅 패널 내용')).toBeInTheDocument();
    expect(screen.getByText('가운데 본문')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '채팅 열기' })).not.toBeInTheDocument();
  });

  it('lg 미만이면 채팅 aside 대신 FAB 를 렌더한다 (채팅 단일 인스턴스 — 시트 닫힘이라 콘텐츠 미마운트)', () => {
    mq.lgUp = false;
    render(
      <DealRoomShell mode="modal" code="P-1" title="t" chat={<div>채팅 패널 내용</div>}>
        <p>가운데 본문</p>
      </DealRoomShell>,
    );
    expect(screen.getByRole('button', { name: '채팅 열기' })).toBeInTheDocument();
    expect(screen.queryByText('채팅 패널 내용')).not.toBeInTheDocument();
  });

  it('상태 칩 노드를 상단바에 렌더한다', () => {
    render(
      <DealRoomShell mode="modal" code="P-1" title="t" statusChip={<span>선정 진행중</span>}>
        x
      </DealRoomShell>,
    );
    expect(screen.getByText('선정 진행중')).toBeInTheDocument();
  });
});
