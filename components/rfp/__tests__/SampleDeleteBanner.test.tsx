// SampleDeleteBanner — buyer/PG 공용 샘플 삭제 배너(프레젠테이션). blurb·onDelete·redirectTo
// 만 주입받고, 삭제 액션의 buyer/PG ACL 차이는 호출처가 onDelete 로 책임진다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Element.prototype.scrollIntoView ??= () => {};

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
const toast = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));

import { SampleDeleteBanner } from '../SampleDeleteBanner';

beforeEach(() => {
  push.mockClear();
  toast.mockClear();
});

describe('SampleDeleteBanner', () => {
  it('주입된 blurb 안내문을 렌더한다', () => {
    render(
      <SampleDeleteBanner
        rfpCode="P-2606-0001"
        blurb="둘러보기용 샘플이에요"
        onDeleteAction={vi.fn(async () => ({ ok: true as const }))}
        redirectTo="/rfp"
      />,
    );
    expect(screen.getByText('둘러보기용 샘플이에요')).toBeInTheDocument();
  });

  it('확인 후 onDeleteAction(code) 를 호출하고 redirectTo 로 이동한다', async () => {
    const user = userEvent.setup();
    const onDeleteAction = vi.fn(async () => ({ ok: true as const }));
    render(
      <SampleDeleteBanner
        rfpCode="P-2606-0001"
        blurb="안내문"
        onDeleteAction={onDeleteAction}
        redirectTo="/inbox"
      />,
    );

    await user.click(screen.getByRole('button', { name: '샘플 삭제' }));
    await user.click(screen.getByRole('button', { name: '삭제' }));

    expect(onDeleteAction).toHaveBeenCalledWith('P-2606-0001');
    expect(push).toHaveBeenCalledWith('/inbox');
  });

  it('onDeleteAction 이 실패하면 이동하지 않고 에러 토스트를 띄운다', async () => {
    const user = userEvent.setup();
    const onDeleteAction = vi.fn(async () => ({ ok: false as const, error: 'BOOM' }));
    render(
      <SampleDeleteBanner
        rfpCode="P-2606-0001"
        blurb="안내문"
        onDeleteAction={onDeleteAction}
        redirectTo="/rfp"
      />,
    );

    await user.click(screen.getByRole('button', { name: '샘플 삭제' }));
    await user.click(screen.getByRole('button', { name: '삭제' }));

    expect(onDeleteAction).toHaveBeenCalledWith('P-2606-0001');
    expect(push).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('삭제하지 못했어요 — BOOM', { type: 'error' });
  });
});
