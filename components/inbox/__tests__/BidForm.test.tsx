// BidForm 제출 성공 후 네비게이션 — mode 분기.
//  - mode='page'(기본): /inbox/<code>/submitted 로 router.push (기존 동작).
//  - mode='modal': router.refresh() 만 (모달 유지, RSC 재실행 → "제출 완료" 인플레이스).
// #86055: refresh + push 동시 호출 금지 — 각 모드는 정확히 하나만.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

const submitBidMock = vi.fn(async (_input: unknown) => ({ ok: true as const }));
vi.mock('@/lib/server/actions/bid', () => ({
  submitBidAction: (input: unknown) => submitBidMock(input),
}));

import { BidForm } from '../BidForm';

afterEach(() => {
  cleanup();
  push.mockClear();
  refresh.mockClear();
  submitBidMock.mockClear();
});

// grade='small' → 법정 카드수수료라 카드사 입력 불필요. 계좌이체·간편결제는
// 기본값(0.50/1.50)이 채워져 있어 즉시 제출 가능.
function renderForm(mode?: 'page' | 'modal') {
  return render(
    <BidForm rfpId="rfp-1" rfpCode="P-2605-0042" grade="small" mode={mode} />,
  );
}

describe('BidForm 제출 후 네비게이션', () => {
  it("mode='modal' 이면 router.refresh()만 호출하고 push 는 호출하지 않는다", async () => {
    const user = userEvent.setup();
    renderForm('modal');
    await user.click(screen.getByRole('button', { name: /제안 제출/ }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(push).not.toHaveBeenCalled();
  });

  it("기본(mode 미지정)이면 /submitted 로 push 하고 refresh 는 호출하지 않는다", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('button', { name: /제안 제출/ }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/inbox/P-2605-0042/submitted'),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
