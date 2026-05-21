// BidForm 제출 성공 후 네비게이션 — 항상 /inbox/<code>/submitted 로 이동.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const submitBidMock = vi.fn(async (_input: unknown) => ({ ok: true as const }));
vi.mock('@/lib/server/actions/bid', () => ({
  submitBidAction: (input: unknown) => submitBidMock(input),
}));

import { BidForm } from '../BidForm';

afterEach(() => {
  cleanup();
  push.mockClear();
  submitBidMock.mockClear();
});

// grade='small' → 법정 카드수수료라 카드사 입력 불필요. 계좌이체·간편결제는
// 기본값(0.50/1.50)이 채워져 있어 즉시 제출 가능.
function renderForm() {
  return render(<BidForm rfpId="rfp-1" rfpCode="P-2605-0042" grade="small" />);
}

describe('BidForm 제출 후 네비게이션', () => {
  it('제출 성공 시 /submitted 로 push 한다', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('button', { name: /제안 제출/ }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/inbox/P-2605-0042/submitted'),
    );
  });
});
