import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toast = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (...args: unknown[]) => toast(...args) }));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const requestWorkspaceNameChangeAction = vi.fn();
vi.mock('@/lib/server/actions/workspace/requestWorkspaceNameChangeAction', () => ({
  requestWorkspaceNameChangeAction: (...args: unknown[]) => requestWorkspaceNameChangeAction(...args),
}));

import { WorkspaceNameForm } from '../WorkspaceNameForm';

beforeEach(() => {
  toast.mockReset();
  refresh.mockReset();
  requestWorkspaceNameChangeAction.mockReset();
});
afterEach(() => cleanup());

describe('WorkspaceNameForm', () => {
  it('이름 변경을 즉시 저장하지 않고 운영자 확인 요청으로 안내한다', async () => {
    requestWorkspaceNameChangeAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<WorkspaceNameForm currentName="테스트 회사" canEdit pendingRequest={null} />);

    await user.click(screen.getByRole('button', { name: '변경 요청' }));
    expect(screen.getByText('운영자가 확인한 뒤 이름이 바뀌어요.')).toBeDefined();
    const input = screen.getByRole('textbox', { name: '변경할 이름' });
    await user.clear(input);
    await user.type(input, '새 이름');
    await user.click(screen.getByRole('button', { name: '이름 변경 요청' }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith('이름 변경을 요청했어요.'));
    expect(requestWorkspaceNameChangeAction).toHaveBeenCalledWith({ name: '새 이름' });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('대기 요청이 있으면 추가 변경 입력을 막고 요청 이름을 보여준다', () => {
    render(<WorkspaceNameForm currentName="테스트 회사" canEdit pendingRequest={{ requestedName: '새 이름', submittedAt: '2026-09-05T00:00:00.000Z' }} />);
    expect(screen.getByText('새 이름')).toBeDefined();
    expect(screen.getByText('운영자 확인 중')).toBeDefined();
    expect(screen.queryByRole('button', { name: '변경 요청' })).toBeNull();
  });

  it('권한이 없으면 변경 요청 버튼을 표시하지 않는다', () => {
    render(<WorkspaceNameForm currentName="테스트 회사" canEdit={false} pendingRequest={null} />);
    expect(screen.queryByRole('button', { name: '변경 요청' })).toBeNull();
  });

  it('최근 요청이 거절되면 사유를 보여주고 다시 요청할 수 있다', () => {
    render(
      <WorkspaceNameForm
        currentName="테스트 회사"
        canEdit
        pendingRequest={null}
        lastRejectedRequest={{ requestedName: '새 이름', reason: '사업자 정보와 달라요.' }}
      />,
    );
    expect(screen.getByText('사업자 정보와 달라요.')).toBeDefined();
    expect(screen.getByRole('button', { name: '변경 요청' })).toBeDefined();
  });
});
