// RouteModalShell — 가로채기 라우트가 항상 open 으로 렌더하는 Dialog 래퍼.
// 닫힘(ESC/백드롭/X/뒤로가기) 은 모두 onOpenChange→router.back() 으로 수렴.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const back = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back }),
}));

import { RouteModalShell } from '../RouteModalShell';

afterEach(() => {
  cleanup();
  back.mockClear();
});

describe('RouteModalShell', () => {
  it('children 을 렌더한다', () => {
    render(
      <RouteModalShell title="제목">
        <div>모달 내용</div>
      </RouteModalShell>,
    );
    expect(screen.getByText('모달 내용')).toBeInTheDocument();
  });

  it('ESC 로 닫으면 router.back() 을 호출한다', async () => {
    const user = userEvent.setup();
    render(
      <RouteModalShell title="제목">
        <div>모달 내용</div>
      </RouteModalShell>,
    );
    await user.keyboard('{Escape}');
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
  });
});
