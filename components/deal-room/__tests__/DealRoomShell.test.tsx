import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DealRoomShell } from '../DealRoomShell';

afterEach(cleanup);

describe('DealRoomShell', () => {
  it('상단바에 코드·제목과 본문을 표시한다', () => {
    render(
      <DealRoomShell
        mode="modal"
        code="P-2606-0042"
        title="카드 PG 견적 요청"
        fullscreenHref="/rfp/P-2606-0042"
      >
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
      <DealRoomShell
        mode="modal"
        code="P-1"
        title="t"
        fullscreenHref="/rfp/P-1"
        onClose={onClose}
      >
        x
      </DealRoomShell>,
    );
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('modal 모드에서 전체화면 링크가 canonical 경로를 가리킨다', () => {
    render(
      <DealRoomShell
        mode="modal"
        code="P-2606-0042"
        title="t"
        fullscreenHref="/rfp/P-2606-0042"
      >
        x
      </DealRoomShell>,
    );
    expect(screen.getByRole('link', { name: '전체화면' })).toHaveAttribute(
      'href',
      '/rfp/P-2606-0042',
    );
  });

  it('page 모드에서는 닫기 버튼과 전체화면 링크를 숨긴다', () => {
    render(
      <DealRoomShell mode="page" code="P-1" title="t" fullscreenHref="/rfp/P-1">
        x
      </DealRoomShell>,
    );
    expect(
      screen.queryByRole('button', { name: '닫기' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: '전체화면' }),
    ).not.toBeInTheDocument();
  });

  it('상태 칩 노드를 상단바에 렌더한다', () => {
    render(
      <DealRoomShell
        mode="modal"
        code="P-1"
        title="t"
        fullscreenHref="/rfp/P-1"
        statusChip={<span>선정 진행중</span>}
      >
        x
      </DealRoomShell>,
    );
    expect(screen.getByText('선정 진행중')).toBeInTheDocument();
  });
});
