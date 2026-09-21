import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from '@/lib/types/user';
import { formatDateTime } from '@/lib/utils/format';

const toast = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));

// MemberRow avatars now render as UserProfileCard triggers — pulls in (at import)
// getUserProfileAction + MessageComposeSheet's 'use server' chain (next-auth/DB,
// jsdom-unsafe) and useUserPresence. Mock them all so the panel collects/renders.
vi.mock('@/lib/server/actions/user/getUserProfileAction', () => ({
  getUserProfileAction: vi.fn(),
}));
vi.mock('@/lib/server/actions/chat/sendChatMessageAction', () => ({
  sendChatMessageAction: vi.fn(),
}));
vi.mock('@/lib/server/actions/chat/listTemplatesAction', () => ({
  listTemplatesAction: vi.fn().mockResolvedValue({ ok: true, templates: [] }),
}));
vi.mock('@/lib/server/actions/chat/saveTemplateAction', () => ({
  saveTemplateAction: vi.fn(),
}));
vi.mock('@/lib/http', () => ({ http: { post: vi.fn() } }));
vi.mock('@/components/presence/WorkspacePresenceProvider', () => ({
  useUserPresence: () => false,
}));

const inviteWorkspaceMemberAction = vi.fn();
vi.mock('@/lib/server/actions/workspace/inviteWorkspaceMemberAction', () => ({
  inviteWorkspaceMemberAction: (...a: unknown[]) =>
    inviteWorkspaceMemberAction(...a),
}));

const removeWorkspaceMemberAction = vi.fn();
vi.mock('@/lib/server/actions/workspace/removeWorkspaceMemberAction', () => ({
  removeWorkspaceMemberAction: (...a: unknown[]) =>
    removeWorkspaceMemberAction(...a),
}));

const changeWorkspaceMemberRoleAction = vi.fn();
vi.mock(
  '@/lib/server/actions/workspace/changeWorkspaceMemberRoleAction',
  () => ({
    changeWorkspaceMemberRoleAction: (...a: unknown[]) =>
      changeWorkspaceMemberRoleAction(...a),
  }),
);

const cancelWorkspaceInviteAction = vi.fn();
vi.mock('@/lib/server/actions/workspace/cancelWorkspaceInviteAction', () => ({
  cancelWorkspaceInviteAction: (...a: unknown[]) =>
    cancelWorkspaceInviteAction(...a),
}));

const resendWorkspaceInviteAction = vi.fn();
vi.mock('@/lib/server/actions/workspace/resendWorkspaceInviteAction', () => ({
  resendWorkspaceInviteAction: (...a: unknown[]) =>
    resendWorkspaceInviteAction(...a),
}));

import { MembersPanel } from '../MembersPanel';

const ADMIN: User = {
  id: 'u-admin',
  name: '관리자',
  email: 'admin@example.com',
  avatarColor: 'ink',
  avatarUpdatedAt: null,
  role: 'admin',
  status: 'active',
  emailVerified: true,
  joinedAt: '2026-01-01T00:00:00.000Z',
};
const MEMBER: User = {
  id: 'u-member',
  name: '멤버',
  email: 'member@example.com',
  avatarColor: 'ink',
  avatarUpdatedAt: null,
  role: 'member',
  status: 'active',
  emailVerified: true,
  joinedAt: '2026-01-01T00:00:00.000Z',
};

const baseProps = {
  workspaceId: 'workspace-1',
  workspaceName: '서포터 B 페이',
  initialMembers: [ADMIN, MEMBER],
  initialPendingInvites: [],
  currentUserId: ADMIN.id,
};

beforeEach(() => {
  toast.mockReset();
  inviteWorkspaceMemberAction.mockReset();
  removeWorkspaceMemberAction.mockReset();
  changeWorkspaceMemberRoleAction.mockReset();
  cancelWorkspaceInviteAction.mockReset();
  resendWorkspaceInviteAction.mockReset();
});

describe('MembersPanel', () => {
  it('never renders the public share link section', () => {
    render(<MembersPanel {...baseProps} userRole="admin" />);
    expect(
      screen.queryByRole('button', { name: '재발급' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '복사' })).not.toBeInTheDocument();
  });

  it('admin: invite sends the selected role', async () => {
    inviteWorkspaceMemberAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<MembersPanel {...baseProps} userRole="admin" />);

    await user.click(screen.getByRole('button', { name: '멤버 초대' }));

    await user.type(
      screen.getByPlaceholderText('member@company.com'),
      'new@example.com',
    );
    // 역할 select — Label이 span으로 렌더되므로 role=combobox 로 찾는다
    await user.selectOptions(screen.getByRole('combobox'), 'admin');
    await user.click(screen.getByRole('button', { name: '초대 보내기' }));

    await waitFor(() =>
      expect(inviteWorkspaceMemberAction).toHaveBeenCalledWith({
        workspaceId: 'workspace-1',
        email: 'new@example.com',
        role: 'admin',
      }),
    );
  });

  it('초대 이메일의 대문자를 정규화해서 서버에 보낸다', async () => {
    inviteWorkspaceMemberAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<MembersPanel {...baseProps} userRole="admin" />);

    await user.click(screen.getByRole('button', { name: '멤버 초대' }));
    await user.type(screen.getByRole('textbox', { name: '이메일' }), 'NEW@EXAMPLE.COM');
    await user.click(screen.getByRole('button', { name: '초대 보내기' }));

    await waitFor(() => expect(inviteWorkspaceMemberAction).toHaveBeenCalledWith({
      workspaceId: 'workspace-1', email: 'new@example.com', role: 'member',
    }));
  });

  it('워크스페이스가 전환된 뒤 초대하면 새로고침 안내를 보여준다', async () => {
    inviteWorkspaceMemberAction.mockResolvedValue({
      ok: false,
      error: 'WORKSPACE_CHANGED',
    });
    const user = userEvent.setup();
    render(<MembersPanel {...baseProps} userRole="admin" />);

    await user.click(screen.getByRole('button', { name: '멤버 초대' }));

    await user.type(screen.getByPlaceholderText('member@company.com'), 'new@example.com');
    await user.click(screen.getByRole('button', { name: '초대 보내기' }));

    expect(
      await screen.findByText('다른 워크스페이스로 전환됐어요. 새로고침 후 다시 시도해 주세요.'),
    ).toBeInTheDocument();
  });

  it('admin: kicks a member via dropdown and drops the row', async () => {
    removeWorkspaceMemberAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<MembersPanel {...baseProps} userRole="admin" />);

    expect(screen.getByText('member@example.com')).toBeInTheDocument();
    // 멤버 관리 드롭다운 트리거
    await user.click(screen.getByRole('button', { name: '멤버 관리' }));
    // 메뉴 항목 '내보내기' 클릭 → ConfirmDialog 열림
    await user.click(await screen.findByRole('menuitem', { name: '내보내기' }));
    // ConfirmDialog 확인 버튼
    await user.click(await screen.findByRole('button', { name: '내보내기' }));

    await waitFor(() =>
      expect(removeWorkspaceMemberAction).toHaveBeenCalledWith({
        workspaceId: 'workspace-1',
        userId: MEMBER.id,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText('member@example.com')).not.toBeInTheDocument(),
    );
  });

  it('admin: 자신에 대한 내보내기/역할변경 메뉴 항목은 disabled', async () => {
    const user = userEvent.setup();
    render(<MembersPanel {...baseProps} userRole="admin" />);
    // 트리거 자체는 enabled (isMutating=false), 항목만 disabled
    await user.click(screen.getByRole('button', { name: '관리자 관리' }));
    const kickItem = await screen.findByRole('menuitem', { name: '내보내기' });
    expect(kickItem).toHaveAttribute('aria-disabled', 'true');
  });

  it('admin: changing a role via dropdown calls the action', async () => {
    changeWorkspaceMemberRoleAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<MembersPanel {...baseProps} userRole="admin" />);

    // 멤버 관리 드롭다운 트리거 클릭 → 역할 변경 메뉴 항목 클릭
    await user.click(screen.getByRole('button', { name: '멤버 관리' }));
    await user.click(await screen.findByRole('menuitem', { name: /관리자.*변경/ }));

    await waitFor(() =>
      expect(changeWorkspaceMemberRoleAction).toHaveBeenCalledWith({
        workspaceId: 'workspace-1',
        userId: MEMBER.id,
        role: 'admin',
      }),
    );
  });

  it('member: shows no kick buttons or role controls', () => {
    render(<MembersPanel {...baseProps} userRole="member" />);
    expect(screen.queryByRole('button', { name: /강퇴/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('멤버 역할 변경')).not.toBeInTheDocument();
  });

  it('admin: 역할 변경 드롭다운 메뉴 항목에 괄호 없는 조사가 표시된다', async () => {
    const user = userEvent.setup();
    render(<MembersPanel {...baseProps} userRole="admin" />);

    await user.click(screen.getByRole('button', { name: '멤버 관리' }));
    const menuItem = await screen.findByRole('menuitem', { name: '관리자로 변경' });
    expect(menuItem).toBeInTheDocument();
    // 괄호 표기 미사용 검증
    expect(screen.queryByText(/관리자\(으로\)/)).not.toBeInTheDocument();
  });

  it('admin: 역할 변경 성공 시 toast에 괄호 없는 조사가 사용된다', async () => {
    changeWorkspaceMemberRoleAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<MembersPanel {...baseProps} userRole="admin" />);

    await user.click(screen.getByRole('button', { name: '멤버 관리' }));
    await user.click(await screen.findByRole('menuitem', { name: /관리자.*변경/ }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.stringContaining('관리자로 변경했어요'),
      ),
    );
  });

  it('초대 폼을 제목 아래에서 열고, 성공하면 결과를 알린다', async () => {
    inviteWorkspaceMemberAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<MembersPanel {...baseProps} userRole="admin" />);

    const trigger = screen.getByRole('button', { name: '멤버 초대' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByPlaceholderText('member@company.com')).not.toBeInTheDocument();

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const input = screen.getByRole('textbox', { name: '이메일' });
    await user.type(input, 'new@example.com');
    await user.click(screen.getByRole('button', { name: '초대 보내기' }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith('초대 메일을 보냈어요.'));
    expect(screen.getByText('new@example.com')).toBeInTheDocument();
    expect(screen.getByText('초대 완료')).toBeInTheDocument();
    expect(screen.queryByText('초대한 날', { exact: false })).not.toBeInTheDocument();
  });

  it('관리자가 아니면 초대 버튼과 폼을 보여주지 않는다', () => {
    render(<MembersPanel {...baseProps} userRole="member" />);
    expect(screen.queryByRole('button', { name: '멤버 초대' })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('member@company.com')).not.toBeInTheDocument();
  });

  it('초대 실패 시 내부 코드를 숨기고 입력칸 옆에서 다시 시도할 수 있게 한다', async () => {
    inviteWorkspaceMemberAction.mockResolvedValue({ ok: false, error: 'INTERNAL_ENUM' });
    const user = userEvent.setup();
    render(<MembersPanel {...baseProps} userRole="admin" />);

    await user.click(screen.getByRole('button', { name: '멤버 초대' }));
    const input = screen.getByRole('textbox', { name: '이메일' });
    await user.type(input, 'new@example.com');
    await user.click(screen.getByRole('button', { name: '초대 보내기' }));

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('초대하지 못했어요. 잠시 후 다시 시도해 주세요.');
    expect(error).not.toHaveTextContent('INTERNAL_ENUM');
    expect(input).toHaveAttribute('aria-describedby', error.id);
  });

  it('초대 요청이 예외로 실패해도 입력을 유지하고 재시도할 수 있다', async () => {
    inviteWorkspaceMemberAction.mockRejectedValueOnce(new Error('network down'));
    inviteWorkspaceMemberAction.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(<MembersPanel {...baseProps} userRole="admin" />);

    await user.click(screen.getByRole('button', { name: '멤버 초대' }));
    const input = screen.getByRole('textbox', { name: '이메일' });
    await user.type(input, 'new@example.com');
    await user.click(screen.getByRole('button', { name: '초대 보내기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('초대하지 못했어요. 잠시 후 다시 시도해 주세요.');
    expect(input).toHaveValue('new@example.com');

    await user.click(screen.getByRole('button', { name: '초대 보내기' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('초대 메일을 보냈어요.'));
  });

  it.each([
    ['ALREADY_INVITED', '이미 초대 대기 중인 이메일이에요. 아래 목록에서 확인해 주세요.'],
    ['FORBIDDEN_NOT_ADMIN', '초대 권한이 없어요. 워크스페이스 관리자에게 요청해 주세요.'],
  ])('초대의 %s 오류를 입력 옆에 안내한다', async (error, message) => {
    inviteWorkspaceMemberAction.mockResolvedValue({ ok: false, error });
    const user = userEvent.setup();
    render(<MembersPanel {...baseProps} userRole="admin" />);

    await user.click(screen.getByRole('button', { name: '멤버 초대' }));
    const input = screen.getByRole('textbox', { name: '이메일' });
    await user.type(input, 'new@example.com');
    await user.click(screen.getByRole('button', { name: '초대 보내기' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveValue('new@example.com');
    expect(screen.queryByText('new@example.com', { selector: 'span' })).not.toBeInTheDocument();
  });

  it('초대 폼을 닫고 다시 열면 입력이 초기화된다', async () => {
    const user = userEvent.setup();
    render(<MembersPanel {...baseProps} userRole="admin" />);

    const trigger = screen.getByRole('button', { name: '멤버 초대' });
    await user.click(trigger);
    await user.type(screen.getByRole('textbox', { name: '이메일' }), 'draft@example.com');
    await user.selectOptions(screen.getByRole('combobox', { name: '역할' }), 'admin');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('textbox', { name: '이메일' })).not.toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByRole('textbox', { name: '이메일' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: '역할' })).toHaveValue('member');
  });

  it('초대 요청 중에는 다시 제출할 수 없다', async () => {
    let finishInvite!: (result: { ok: true }) => void;
    inviteWorkspaceMemberAction.mockReturnValue(new Promise((resolve) => {
      finishInvite = resolve;
    }));
    const user = userEvent.setup();
    render(<MembersPanel {...baseProps} userRole="admin" />);

    await user.click(screen.getByRole('button', { name: '멤버 초대' }));
    await user.type(screen.getByRole('textbox', { name: '이메일' }), 'new@example.com');
    await user.click(screen.getByRole('button', { name: '초대 보내기' }));

    expect(screen.getByRole('button', { name: '보내는 중…' })).toBeDisabled();
    expect(inviteWorkspaceMemberAction).toHaveBeenCalledTimes(1);
    finishInvite({ ok: true });
    await waitFor(() => expect(toast).toHaveBeenCalledWith('초대 메일을 보냈어요.'));
  });

  it('초대 요청 중에는 폼을 닫지 않아 실패 안내와 입력을 보존한다', async () => {
    let finishInvite!: (result: { ok: false; error: string }) => void;
    inviteWorkspaceMemberAction.mockReturnValue(new Promise((resolve) => {
      finishInvite = resolve;
    }));
    const user = userEvent.setup();
    render(<MembersPanel {...baseProps} userRole="admin" />);

    const trigger = screen.getByRole('button', { name: '멤버 초대' });
    await user.click(trigger);
    const input = screen.getByRole('textbox', { name: '이메일' });
    await user.type(input, 'new@example.com');
    await user.click(screen.getByRole('button', { name: '초대 보내기' }));

    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    finishInvite({ ok: false, error: 'UNKNOWN' });
    expect(await screen.findByRole('alert')).toHaveTextContent('초대하지 못했어요.');
    expect(input).toHaveValue('new@example.com');
  });

  it('초대 대기 행은 역할·상태·초대한 날을 보여주고 일반 멤버에게 동작을 숨긴다', () => {
    render(
      <MembersPanel
        {...baseProps}
        userRole="member"
        initialPendingInvites={[{ email: 'pending@example.com', role: 'admin', createdAt: '2026-09-21T00:00:00.000Z' }]}
      />,
    );

    expect(screen.getByText('pending@example.com')).toBeInTheDocument();
    expect(screen.getByText('초대한 날', { exact: false })).toBeInTheDocument();
    const localDate = formatDateTime(
      '2026-09-21T00:00:00.000Z',
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      'yyyy. MM. dd.',
    );
    expect(screen.getByText(localDate)).toBeInTheDocument();
    expect(screen.getByText('대기 중')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '재발송' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument();
  });

  it('관리자는 초대 대기 행에서 재발송하고 확인 후 취소할 수 있다', async () => {
    resendWorkspaceInviteAction.mockResolvedValue({ ok: true });
    cancelWorkspaceInviteAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(
      <MembersPanel
        {...baseProps}
        userRole="admin"
        initialPendingInvites={[{ email: 'pending@example.com', role: 'member', createdAt: '2026-09-21T00:00:00.000Z' }]}
      />,
    );

    await user.click(screen.getByRole('button', { name: '재발송' }));
    await waitFor(() => expect(resendWorkspaceInviteAction).toHaveBeenCalledWith({
      workspaceId: 'workspace-1', email: 'pending@example.com',
    }));
    expect(toast).toHaveBeenCalledWith('초대 메일을 다시 보냈어요.');

    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.getByText('초대를 취소할까요?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '초대 취소' }));
    await waitFor(() => expect(cancelWorkspaceInviteAction).toHaveBeenCalledWith({
      workspaceId: 'workspace-1', email: 'pending@example.com',
    }));
    expect(screen.queryByText('pending@example.com')).not.toBeInTheDocument();
  });
});
