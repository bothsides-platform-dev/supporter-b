// TeamThreadView — RFP 팀 채팅(내부 메모) 스레드. ThreadView 와 동일한 시각
// 언어(말풍선·날짜 구분선·그룹핑)를 따르되 표면은 훨씬 작다: 메시지만 (타이핑/
// 프레즌스/읽음/첨부 없음 — v1 확정 결정). 내부 스레드이므로 타인 메시지에
// 멤버 이름+아바타 헤더를 단다.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const sendTeamMessageAction = vi.fn();
vi.mock('@/lib/server/actions/chat/sendTeamMessageAction', () => ({
  sendTeamMessageAction: (...args: unknown[]) => sendTeamMessageAction(...args),
}));

type TeamPayload = { type?: string; [k: string]: unknown };
let channelOptions: { onMessage?: (d: TeamPayload) => void } = {};
let channelResult: { connected: boolean | null } = { connected: null };
vi.mock('@/lib/hooks/useTeamChannel', () => ({
  useTeamChannel: (
    _rfpId: string,
    _wsId: string,
    opts: typeof channelOptions,
  ): typeof channelResult => {
    channelOptions = opts;
    return channelResult;
  },
}));

const toast = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: (...args: unknown[]) => toast(...args),
}));

afterEach(() => cleanup());
beforeEach(() => {
  sendTeamMessageAction.mockReset();
  sendTeamMessageAction.mockResolvedValue({
    ok: true,
    messageId: 'tm-new',
    createdAt: '2026-06-10T10:05:00.000Z',
  });
  toast.mockReset();
  channelOptions = {};
  channelResult = { connected: null };
});

import { TeamThreadView } from '../TeamThreadView';
import type { TeamThreadMessage } from '@/lib/server/actions/chat/teamThreadLoader';

// T03:00Z–T14:00Z 창 안의 타임스탬프 — UTC/KST 날짜가 일치(타임존 플레이크 방지).
const messages: TeamThreadMessage[] = [
  {
    id: 'tm1',
    authorUserId: 'u-mate',
    authorName: '이동료',
    body: '이 견적 수수료 괜찮은데요?',
    createdAt: '2026-06-09T05:00:00.000Z',
    isSelf: false,
  },
  {
    id: 'tm2',
    authorUserId: 'u-me',
    authorName: '김구매',
    body: '내일 회의에서 정리하시죠.',
    createdAt: '2026-06-10T05:00:00.000Z',
    isSelf: true,
  },
];

function base(overrides: Partial<React.ComponentProps<typeof TeamThreadView>> = {}) {
  return (
    <TeamThreadView
      rfpId="rfp-1"
      workspaceId="ws-1"
      viewerUserId="u-me"
      messages={messages}
      {...overrides}
    />
  );
}

describe('TeamThreadView — 렌더', () => {
  it('타인 메시지는 좌측 + 작성자 이름/아바타, 본인 메시지는 우측 + 헤더 생략', () => {
    render(base());

    const other = screen
      .getByText('이 견적 수수료 괜찮은데요?')
      .closest('[data-message-row]');
    const self = screen
      .getByText('내일 회의에서 정리하시죠.')
      .closest('[data-message-row]');

    expect(other).toHaveAttribute('data-sender', 'other');
    expect(self).toHaveAttribute('data-sender', 'self');
    expect(screen.getByText('이동료')).toBeInTheDocument();
    expect(screen.queryByText('김구매')).not.toBeInTheDocument();
  });

  it('날짜가 바뀌면 날짜 구분선을 렌더한다', () => {
    render(base());
    expect(screen.getAllByRole('separator')).toHaveLength(2);
  });

  it('메시지가 없으면 내부 전용임을 알리는 빈 상태를 보여준다', () => {
    render(base({ messages: [] }));
    expect(screen.getByText('아직 팀 메시지가 없어요')).toBeInTheDocument();
  });
});

describe('TeamThreadView — 전송', () => {
  it('보내기 클릭 시 sendTeamMessageAction({rfpId, body}) 호출 + 낙관적 말풍선 표시 후 확정 승격', async () => {
    const user = userEvent.setup();
    render(base());

    await user.type(
      screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…'),
      '새 팀 메모',
    );
    await user.click(screen.getByRole('button', { name: '보내기' }));

    await screen.findByText('새 팀 메모');
    await waitFor(() => {
      expect(sendTeamMessageAction).toHaveBeenCalledWith({
        rfpId: 'rfp-1',
        body: '새 팀 메모',
      });
    });
    // 확정 승격 — pending 표시가 사라진다.
    await waitFor(() => {
      const row = screen.getByText('새 팀 메모').closest('[data-message-row]')!;
      expect(row.querySelector('[aria-label="전송 중"]')).not.toBeInTheDocument();
    });
  });

  it('Enter 는 전송, Shift+Enter 는 줄바꿈이다', async () => {
    const user = userEvent.setup();
    render(base());
    const textarea = screen.getByPlaceholderText(
      '우리 팀에게만 보이는 메모를 남겨보세요…',
    );

    await user.type(textarea, '줄1{Shift>}{Enter}{/Shift}줄2');
    expect(sendTeamMessageAction).not.toHaveBeenCalled();

    await user.type(textarea, '{Enter}');
    await waitFor(() => {
      expect(sendTeamMessageAction).toHaveBeenCalledWith({
        rfpId: 'rfp-1',
        body: '줄1\n줄2',
      });
    });
  });

  it('빈 본문이면 보내기 버튼이 비활성화된다', () => {
    render(base());
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled();
  });

  it('전송 실패 시 말풍선을 걷어내고 입력을 복원하며 토스트를 띄운다', async () => {
    sendTeamMessageAction.mockResolvedValue({ ok: false, error: 'FORBIDDEN' });
    const user = userEvent.setup();
    render(base());

    const textarea = screen.getByPlaceholderText(
      '우리 팀에게만 보이는 메모를 남겨보세요…',
    );
    await user.type(textarea, '실패할 메모');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    await waitFor(() => {
      expect(screen.queryByText('실패할 메모', { selector: '[data-message-row] *' })).not.toBeInTheDocument();
    });
    expect(textarea).toHaveValue('실패할 메모');
    expect(toast).toHaveBeenCalled();
  });
});

describe('TeamThreadView — 라이브 수신', () => {
  it('onMessage 수신 시 메시지를 append 하고 같은 id 는 중복 append 하지 않는다', async () => {
    render(base());

    const evt = {
      type: 'message',
      id: 'tm-live',
      body: '라이브 팀 메모',
      authorUserId: 'u-mate',
      authorName: '이동료',
      createdAt: '2026-06-10T06:00:00.000Z',
    };
    act(() => channelOptions.onMessage?.(evt));
    await screen.findByText('라이브 팀 메모');

    act(() => channelOptions.onMessage?.(evt));
    expect(screen.getAllByText('라이브 팀 메모')).toHaveLength(1);
  });
});
