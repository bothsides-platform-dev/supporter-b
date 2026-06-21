import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// base-ui tooltip positioner reads ResizeObserver; jsdom lacks it.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

import { RfpBoardVisibilityStatus } from '../RfpBoardVisibilityStatus';

afterEach(cleanup);

describe('RfpBoardVisibilityStatus', () => {
  it('shows "게시판 노출 중" chip when boardVisible is true', () => {
    render(<RfpBoardVisibilityStatus boardVisible />);
    expect(screen.getByText('게시판 노출 중')).toBeInTheDocument();
  });

  it('shows "게시판 비노출" chip when boardVisible is false', () => {
    render(<RfpBoardVisibilityStatus boardVisible={false} />);
    expect(screen.getByText('게시판 비노출')).toBeInTheDocument();
  });

  it('has no toggle button for board visibility', () => {
    render(<RfpBoardVisibilityStatus boardVisible />);
    expect(screen.queryByRole('button', { name: '숨기기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '노출하기' })).not.toBeInTheDocument();
  });

  it('exposes visible-state description via title attribute for accessibility', () => {
    render(<RfpBoardVisibilityStatus boardVisible />);
    expect(
      screen.getByTitle('다른 PG사가 이 견적 요청을 발견하고 참여를 요청할 수 있어요.'),
    ).toBeInTheDocument();
  });

  it('exposes hidden-state description via title attribute for accessibility', () => {
    render(<RfpBoardVisibilityStatus boardVisible={false} />);
    expect(
      screen.getByTitle('게시판에서 숨겨져 초대한 PG사만 볼 수 있어요.'),
    ).toBeInTheDocument();
  });
});
