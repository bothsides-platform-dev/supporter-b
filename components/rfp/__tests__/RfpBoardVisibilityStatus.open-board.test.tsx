import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

import { RfpBoardVisibilityStatus } from '../RfpBoardVisibilityStatus';

describe('RfpBoardVisibilityStatus — open board disabled (flag off)', () => {
  it('boardVisible=true 여도 칩을 렌더하지 않는다 (null)', () => {
    render(<RfpBoardVisibilityStatus boardVisible />);
    expect(screen.queryByText('게시판 노출 중')).not.toBeInTheDocument();
  });

  it('boardVisible=false 여도 칩을 렌더하지 않는다 (null)', () => {
    render(<RfpBoardVisibilityStatus boardVisible={false} />);
    expect(screen.queryByText('게시판 비노출')).not.toBeInTheDocument();
  });
});
