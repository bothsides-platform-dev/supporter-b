import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SWRConfig } from 'swr';
import { PgChatPanel } from '../PgChatPanel';
const inbox = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/actions/chat/inboxLoader', () => ({ listInboxForViewer: inbox }));
vi.mock('../../DealRoomChat', () => ({ DealRoomChat: () => <p>구매사 대화와 팀 내부 메모</p> }));
afterEach(cleanup);
it('해당 구매사의 안 읽음을 표시하고 질문 패널을 닫으면 버튼으로 초점을 돌린다', async () => {
  inbox.mockResolvedValue([{ kind: 'counterparty', counterparty: { workspaceId: 'buyer' }, unread: true }]);
  const user = userEvent.setup();
  render(<SWRConfig value={{ provider: () => new Map() }}><PgChatPanel workspaceId="pg" rfpId="r1" rfpCode="P-1" rfpTitle="견적" buyer={{ workspaceId: 'buyer', name: '구매사', type: 'buyer', logoUpdatedAt: null }} /></SWRConfig>);
  expect(await screen.findByText('안 읽음')).toBeInTheDocument();
  const trigger = screen.getByRole('button', { name: /구매사에게 질문하기/ });
  await user.click(trigger);
  expect(screen.getByRole('dialog')).toHaveTextContent('구매사 대화와 팀 내부 메모');
  await user.keyboard('{Escape}');
  await waitFor(() => expect(trigger).toHaveFocus());
});
it('다른 구매사의 안 읽음은 표시하지 않는다', async () => {
  inbox.mockResolvedValue([{ kind: 'counterparty', counterparty: { workspaceId: 'other' }, unread: true }]);
  render(<SWRConfig value={{ provider: () => new Map() }}><PgChatPanel workspaceId="pg" rfpId="r1" rfpCode="P-1" rfpTitle="견적" buyer={{ workspaceId: 'buyer', name: '구매사', type: 'buyer', logoUpdatedAt: null }} /></SWRConfig>);
  await waitFor(() => expect(inbox).toHaveBeenCalled());
  expect(screen.queryByText('안 읽음')).not.toBeInTheDocument();
});
