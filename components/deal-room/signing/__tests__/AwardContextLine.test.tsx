import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('@/lib/server/actions/chat/getOrCreateConversationAction', () => ({
  getOrCreateConversationAction: vi.fn(async () => ({ ok: true, conversationId: 'conv-1' })),
}));

import { AwardContextLine } from '../AwardContextLine';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AwardContextLine', () => {
  it('선정 상대와 담당자를 한 줄로 보여준다', () => {
    render(<AwardContextLine workspaceName="나이스페이먼츠" contactName="김민수" />);
    expect(screen.getByText('나이스페이먼츠')).toBeInTheDocument();
    expect(screen.getByText(/김민수/)).toBeInTheDocument();
  });

  it('상대 워크스페이스가 있으면 메시지로 이동한다', async () => {
    const user = userEvent.setup();
    render(
      <AwardContextLine
        workspaceName="나이스페이먼츠"
        contactName="김민수"
        counterpartyWsId="11111111-1111-1111-1111-111111111111"
      />,
    );
    await user.click(screen.getByRole('button', { name: '메시지' }));
    expect(nav.push).toHaveBeenCalledWith('/messages?c=conv-1');
  });

  it('상대 워크스페이스가 없으면 메시지 버튼을 그리지 않는다', () => {
    render(<AwardContextLine workspaceName="나이스페이먼츠" />);
    expect(screen.queryByRole('button', { name: '메시지' })).not.toBeInTheDocument();
  });
});
