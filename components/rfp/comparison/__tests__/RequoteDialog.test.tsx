import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const requestRequoteAction = vi.fn();
vi.mock('@/lib/server/actions/rfp', () => ({
  requestRequoteAction: (input: unknown) => requestRequoteAction(input),
}));

import { RequoteDialog } from '../RequoteDialog';

const CANDIDATES = [
  { pgWsId: 'pg-1', name: 'OO페이' },
  { pgWsId: 'pg-2', name: '△△페이' },
];

afterEach(() => cleanup());
beforeEach(() => requestRequoteAction.mockReset());

describe('RequoteDialog', () => {
  it('blocks submit with empty message', async () => {
    const user = userEvent.setup();
    render(<RequoteDialog open onOpenChange={vi.fn()} rfpId="11111111-1111-1111-1111-111111111111" candidates={CANDIDATES} />);
    await user.click(screen.getByLabelText('OO페이'));
    await user.click(screen.getByRole('button', { name: '재요청 보내기' }));
    expect(requestRequoteAction).not.toHaveBeenCalled();
    expect(screen.getByText(/개선 요청/)).toBeInTheDocument();
  });

  it('submits selected PGs + message + deadline', async () => {
    const user = userEvent.setup();
    requestRequoteAction.mockResolvedValue({ ok: true });
    const onOpenChange = vi.fn();
    render(<RequoteDialog open onOpenChange={onOpenChange} rfpId="11111111-1111-1111-1111-111111111111" candidates={CANDIDATES} />);
    await user.click(screen.getByLabelText('OO페이'));
    await user.type(screen.getByPlaceholderText(/개선/), '카드 수수료를 낮춰주세요');
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    await user.clear(screen.getByLabelText('새 마감일'));
    await user.type(screen.getByLabelText('새 마감일'), future);
    await user.click(screen.getByRole('button', { name: '재요청 보내기' }));
    await waitFor(() => expect(requestRequoteAction).toHaveBeenCalledTimes(1));
    const arg = requestRequoteAction.mock.calls[0]![0] as { pgWsIds: string[]; message: string };
    expect(arg.pgWsIds).toEqual(['pg-1']);
    expect(arg.message).toBe('카드 수수료를 낮춰주세요');
  });
});
