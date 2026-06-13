import { describe, expect, it, vi } from 'vitest';
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
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

import type { DeleteSampleRfpInput } from '@/lib/server/actions/onboarding/deleteSampleRfpAction';

const deleteAction = vi.fn(async (_input: DeleteSampleRfpInput) => ({ ok: true as const }));
vi.mock('@/lib/server/actions/onboarding/deleteSampleRfpAction', () => ({
  deleteSampleRfpAction: (input: DeleteSampleRfpInput) => deleteAction(input),
}));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));

import { SampleRfpBanner } from '../SampleRfpBanner';

describe('SampleRfpBanner', () => {
  it('confirms then calls deleteSampleRfpAction and navigates to /rfp', async () => {
    const user = userEvent.setup();
    render(<SampleRfpBanner rfpCode="P-2606-0001" />);

    await user.click(screen.getByRole('button', { name: '샘플 삭제' }));
    // 확인 다이얼로그의 '삭제' 확정 버튼
    await user.click(screen.getByRole('button', { name: '삭제' }));

    expect(deleteAction).toHaveBeenCalledWith({ code: 'P-2606-0001' });
    expect(push).toHaveBeenCalledWith('/rfp');
  });
});
