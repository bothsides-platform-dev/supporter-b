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

import type { DeleteSamplePgRfpInput } from '@/lib/server/actions/onboarding/deleteSamplePgRfpAction';

const deleteAction = vi.fn(async (_input: DeleteSamplePgRfpInput) => ({ ok: true as const }));
vi.mock('@/lib/server/actions/onboarding/deleteSamplePgRfpAction', () => ({
  deleteSamplePgRfpAction: (input: DeleteSamplePgRfpInput) => deleteAction(input),
}));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));

import { SamplePgRfpBanner } from '../SamplePgRfpBanner';

describe('SamplePgRfpBanner', () => {
  it('confirms then calls deleteSamplePgRfpAction and navigates to /inbox', async () => {
    const user = userEvent.setup();
    render(<SamplePgRfpBanner rfpCode="P-2606-0001" />);

    await user.click(screen.getByRole('button', { name: '샘플 삭제' }));
    await user.click(screen.getByRole('button', { name: '삭제' }));

    expect(deleteAction).toHaveBeenCalledWith({ code: 'P-2606-0001' });
    expect(push).toHaveBeenCalledWith('/inbox');
  });
});
