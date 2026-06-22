import type { ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const switchWorkspaceAction = vi.fn();
const push = vi.fn();
const refresh = vi.fn();
const assign = vi.fn();
const disconnectCentrifuge = vi.fn();

vi.mock('@/lib/server/actions/workspace/switchWorkspaceAction', () => ({
  switchWorkspaceAction: (id: string) => switchWorkspaceAction(id),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));
vi.mock('@/lib/realtime/centrifuge-client', () => ({
  disconnectCentrifuge: () => disconnectCentrifuge(),
}));

import { WorkspaceSwitcher } from '../WorkspaceSwitcher';

const workspaces = [
  { id: 'ws1', name: '구매사A', type: 'buyer' as const, status: 'active' as const, role: 'admin' as const, memberApprovalStatus: 'approved' as const, unreadCount: 0, logoUpdatedAt: null, isDemo: false },
  { id: 'ws2', name: '서포터 B 페이', type: 'pg' as const, status: 'active' as const, role: 'member' as const, memberApprovalStatus: 'approved' as const, unreadCount: 0, logoUpdatedAt: null, isDemo: false },
];
const current = { id: 'ws1', name: '구매사A', type: 'buyer' as const, logoUpdatedAt: null };

function renderInSidebarGroup(
  collapsible: 'expanded' | 'icon',
  ui: ReactElement = (
    <WorkspaceSwitcher current={current} workspaces={workspaces} />
  ),
) {
  return render(
    <div
      className="group w-64"
      {...(collapsible === 'icon' ? { 'data-collapsible': 'icon' } : {})}
    >
      {ui}
    </div>,
  );
}

function triggerClassTokens() {
  return screen.getByRole('button').className.split(/\s+/);
}

beforeEach(() => {
  switchWorkspaceAction.mockReset();
  push.mockReset();
  refresh.mockReset();
  assign.mockReset();
  disconnectCentrifuge.mockReset();
  // jsdom's window.location.assign throws "not implemented"; replace location
  // with a stub so a hard navigation can be asserted. (.href= is unmockable in
  // jsdom, hence the component uses .assign().)
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { assign },
  });
});

describe('WorkspaceSwitcher', () => {
  it('shows the current workspace name and type label in the trigger', () => {
    render(<WorkspaceSwitcher current={current} workspaces={workspaces} />);
    expect(screen.getByText('구매사A')).toBeInTheDocument();
    expect(screen.getByText('구매사')).toBeInTheDocument();
  });

  it('uses full-width row layout when the sidebar is expanded (mobile sheet or desktop open)', () => {
    renderInSidebarGroup('expanded');
    const tokens = triggerClassTokens();
    expect(tokens).toContain('w-full');
    expect(tokens).toContain('h-9');
    expect(tokens).not.toContain('size-8');
  });

  it('uses icon-only layout when the sidebar is collapsed to the icon rail', () => {
    renderInSidebarGroup('icon');
    const tokens = triggerClassTokens();
    expect(tokens).toContain('group-data-[collapsible=icon]:size-8');
    expect(tokens).toContain('group-data-[collapsible=icon]:justify-center');
    expect(tokens).not.toContain('group-data-[collapsible=icon]:w-auto');
    expect(screen.getByText('구매사A').className).toContain(
      'group-data-[collapsible=icon]:sr-only',
    );
    const chip = screen.getByText('구매사').parentElement;
    expect(chip?.className).toContain('group-data-[collapsible=icon]:hidden');
  });

  it('switches to a selected workspace and hard-navigates home', async () => {
    const user = userEvent.setup();
    switchWorkspaceAction.mockResolvedValue({ ok: true, redirectTo: '/home' });

    render(<WorkspaceSwitcher current={current} workspaces={workspaces} />);
    await user.click(screen.getByRole('button')); // only the trigger exists pre-open
    await user.click(await screen.findByText('서포터 B 페이'));

    await waitFor(() => expect(switchWorkspaceAction).toHaveBeenCalledWith('ws2'));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/home'));
  });

  it('tears down the Centrifuge connection before navigating (presence correctness)', async () => {
    const user = userEvent.setup();
    switchWorkspaceAction.mockResolvedValue({ ok: true, redirectTo: '/home' });

    render(<WorkspaceSwitcher current={current} workspaces={workspaces} />);
    await user.click(screen.getByRole('button'));
    await user.click(await screen.findByText('서포터 B 페이'));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/home'));
    expect(disconnectCentrifuge).toHaveBeenCalled();
    // The teardown must precede the hard nav so the next page builds a fresh,
    // correctly-scoped connection.
    expect(disconnectCentrifuge.mock.invocationCallOrder[0]).toBeLessThan(
      assign.mock.invocationCallOrder[0],
    );
  });

  it('optimistically swaps the trigger to the selected workspace while the switch is in flight (immediate paint, before navigation)', async () => {
    const user = userEvent.setup();
    switchWorkspaceAction.mockReturnValue(new Promise(() => {})); // in flight, never settles

    render(<WorkspaceSwitcher current={current} workspaces={workspaces} />);
    await user.click(screen.getByRole('button'));
    await user.click(await screen.findByText('서포터 B 페이'));

    // The trigger reflects the target (name + PG label) before the action settles
    // and before any navigation — the immediate feedback this change is about.
    await waitFor(() => expect(screen.getByText('서포터 B 페이')).toBeInTheDocument());
    expect(screen.queryByText('구매사A')).not.toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it('reverts the optimistic trigger to the original workspace when the switch fails', async () => {
    const user = userEvent.setup();
    let settle!: (r: { ok: false; error: string }) => void;
    switchWorkspaceAction.mockReturnValue(
      new Promise<{ ok: false; error: string }>((res) => {
        settle = res;
      }),
    );

    render(<WorkspaceSwitcher current={current} workspaces={workspaces} />);
    await user.click(screen.getByRole('button'));
    await user.click(await screen.findByText('서포터 B 페이'));

    // optimistic swap first
    await waitFor(() => expect(screen.getByText('서포터 B 페이')).toBeInTheDocument());

    // then the action fails → trigger reverts to the original workspace
    await act(async () => {
      settle({ ok: false, error: 'NOT_MEMBER' });
    });
    await waitFor(() => expect(screen.getByText('구매사A')).toBeInTheDocument());
    expect(screen.queryByText('서포터 B 페이')).not.toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it('does not switch when selecting the already-active workspace', async () => {
    const user = userEvent.setup();
    render(<WorkspaceSwitcher current={current} workspaces={workspaces} />);
    await user.click(screen.getByRole('button'));
    // '구매사A' now appears in both the trigger and the list — click the list one.
    const matches = await screen.findAllByText('구매사A');
    await user.click(matches[matches.length - 1]);
    expect(switchWorkspaceAction).not.toHaveBeenCalled();
  });

  it('successful switch hard-navigates and never uses the soft router (which preserves the shared (app) layout, leaving the workspace chrome stale)', async () => {
    const user = userEvent.setup();
    switchWorkspaceAction.mockResolvedValue({ ok: true, redirectTo: '/home' });

    render(<WorkspaceSwitcher current={current} workspaces={workspaces} />);
    await user.click(screen.getByRole('button'));
    await user.click(await screen.findByText('서포터 B 페이'));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/home'));
    expect(push).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not show "워크스페이스 만들기" in the dropdown', async () => {
    const user = userEvent.setup();
    render(<WorkspaceSwitcher current={current} workspaces={workspaces} />);
    await user.click(screen.getByRole('button'));
    await screen.findByText('내 워크스페이스'); // dropdown is open
    expect(screen.queryByText('워크스페이스 만들기')).not.toBeInTheDocument();
  });

  it('no longer offers the "초대 링크로 합류" entry point', async () => {
    const user = userEvent.setup();
    render(<WorkspaceSwitcher current={current} workspaces={workspaces} />);
    await user.click(screen.getByRole('button'));
    await screen.findByText('내 워크스페이스'); // dropdown is open
    expect(screen.queryByText('초대 링크로 합류')).not.toBeInTheDocument();
  });
});

describe('WorkspaceSwitcher — master mode (isMaster)', () => {
  const many = [
    { id: 'ws1', name: '구매사A', type: 'buyer' as const, status: 'active' as const, role: 'admin' as const, memberApprovalStatus: 'approved' as const, unreadCount: 0, logoUpdatedAt: null, isDemo: false },
    { id: 'ws2', name: 'PG사B', type: 'pg' as const, status: 'active' as const, role: 'admin' as const, memberApprovalStatus: 'approved' as const, unreadCount: 0, logoUpdatedAt: null, isDemo: false },
    { id: 'ws3', name: '구매사C', type: 'buyer' as const, status: 'active' as const, role: 'admin' as const, memberApprovalStatus: 'approved' as const, unreadCount: 0, logoUpdatedAt: null, isDemo: false },
  ];
  const masterCurrent = { id: 'ws1', name: '구매사A', type: 'buyer' as const, logoUpdatedAt: null };

  it('isMaster=false면 드롭다운을 열어도 검색 인풋이 없다', async () => {
    const user = userEvent.setup();
    render(<WorkspaceSwitcher current={masterCurrent} workspaces={many} isMaster={false} />);
    await user.click(screen.getByRole('button'));
    await screen.findByText('내 워크스페이스');
    expect(screen.queryByPlaceholderText('워크스페이스 검색')).not.toBeInTheDocument();
  });

  it('isMaster=true면 "모든 워크스페이스" 헤더 + 검색 인풋을 렌더한다', async () => {
    const user = userEvent.setup();
    render(<WorkspaceSwitcher current={masterCurrent} workspaces={many} isMaster={true} />);
    await user.click(screen.getByRole('button'));
    expect(await screen.findByText('모든 워크스페이스')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('워크스페이스 검색')).toBeInTheDocument();
  });

  it('검색어로 이름을 필터링한다 (대소문자 무관)', async () => {
    const user = userEvent.setup();
    render(<WorkspaceSwitcher current={masterCurrent} workspaces={many} isMaster={true} />);
    await user.click(screen.getByRole('button'));
    const input = await screen.findByPlaceholderText('워크스페이스 검색');
    await user.type(input, 'pg');
    expect(screen.getByText('PG사B')).toBeInTheDocument();
    expect(screen.queryByText('구매사C')).not.toBeInTheDocument();
  });
});
