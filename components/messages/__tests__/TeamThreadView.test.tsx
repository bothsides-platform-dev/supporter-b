// TeamThreadView — RFP 팀 채팅(내부 메모) 스레드. ThreadView 와 동일한 시각
// 언어(말풍선·날짜 구분선·그룹핑)를 따르되 표면은 훨씬 작다: 메시지만 (타이핑/
// 프레즌스/읽음/첨부 없음 — v1 확정 결정). 내부 스레드이므로 타인 메시지에
// 멤버 이름+아바타 헤더를 단다.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, act, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { formatTime } from '../format';

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

// 하단 센티널 가시성 관찰자 — 읽음의 두 번째 게이트. jsdom 에 없어 스텁한다.
type IoCb = (entries: { isIntersecting: boolean }[]) => void;
const intersectionObservers: { fire: (v: boolean) => void }[] = [];
class IntersectionObserverStub {
  constructor(cb: IoCb) {
    intersectionObservers.push({ fire: (v) => cb([{ isIntersecting: v }]) });
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);

function scrollAwayFromBottom(): void {
  for (const o of intersectionObservers) o.fire(false);
}
function scrollBackToBottom(): void {
  for (const o of intersectionObservers) o.fire(true);
}

const sendTeamMessageAction = vi.fn();
vi.mock('@/lib/server/actions/chat/sendTeamMessageAction', () => ({
  sendTeamMessageAction: (...args: unknown[]) => sendTeamMessageAction(...args),
}));

vi.mock('@/lib/server/actions/chat/markTeamThreadReadAction', () => ({
  markTeamThreadReadAction: vi.fn().mockResolvedValue({ ok: true, readAt: '2026-06-14T00:00:00Z' }),
}));
import { markTeamThreadReadAction } from '@/lib/server/actions/chat/markTeamThreadReadAction';

// uploadAttachment (presigned 3-step client helper) — mock so the test controls the upload.
const uploadAttachment = vi.fn();
vi.mock('@/lib/attachments/upload-client', () => ({
  uploadAttachment: (...args: unknown[]) => uploadAttachment(...args),
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

// 알림 스토어의 로컬 배지 정리 — 서버 액션 체인을 끌고 오므로 mock 한다.
const markThreadReadLocal = vi.fn();
vi.mock('@/lib/hooks/useNotifications', () => ({
  markThreadReadLocal: (...args: unknown[]) => markThreadReadLocal(...args),
}));

const toast = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: (...args: unknown[]) => toast(...args),
}));

// Author avatars now render as UserProfileCard triggers — that pulls in (at import
// time) getUserProfileAction + MessageComposeSheet's 'use server' chain
// (next-auth/DB, jsdom-unsafe) and useUserPresence. Mock them all.
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
vi.mock('@/components/presence/WorkspacePresenceProvider', () => ({
  useUserPresence: () => false,
}));

afterEach(() => cleanup());
beforeEach(() => {
  window.localStorage.clear();
  sendTeamMessageAction.mockReset();
  sendTeamMessageAction.mockResolvedValue({
    ok: true,
    messageId: 'tm-new',
    createdAt: '2026-06-10T10:05:00.000Z',
  });
  toast.mockReset();
  uploadAttachment.mockReset();
  channelOptions = {};
  channelResult = { connected: null };
  vi.mocked(markTeamThreadReadAction).mockClear();
  vi.mocked(markTeamThreadReadAction).mockResolvedValue({
    ok: true,
    readAt: '2026-06-10T07:00:00.000Z',
  });
  intersectionObservers.length = 0;
});

import { TeamThreadView } from '../TeamThreadView';
import type { TeamThreadMessage } from '@/lib/server/actions/chat/teamThreadLoader';

describe('TeamThreadView — 복구 결과와 키보드', () => {
  // Closing only the correlated action prevents a stale dialog from duplicating an already confirmed memo.
  it.each([
    ['echo', '다시 보내기'], ['echo', '기록 지우기'],
    ['다른 화면', '다시 보내기'], ['다른 화면', '기록 지우기'],
    ['다른 탭', '다시 보내기'], ['다른 탭', '기록 지우기'],
  ] as const)('%s가 A를 확정하면 열린 %s 확인창을 닫고 오래된 A를 처리하지 않는다', async (source, action) => {
    const user = userEvent.setup();
    let resolveA!: (value: unknown) => void;
    let resolveC!: (value: unknown) => void;
    sendTeamMessageAction.mockReturnValueOnce(new Promise((resolve) => { resolveA = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveC = resolve; }));
    const first = render(base({ messages: [] }));
    const textarea = within(first.container).getByRole('textbox');
    await user.type(textarea, '미확인 A');
    await user.click(within(first.container).getByRole('button', { name: '보내기' }));
    const tempA = sendTeamMessageAction.mock.calls[0][0].tempId;
    await user.type(textarea, '미확인 C');
    await act(async () => { resolveA({ ok: false, error: 'NETWORK' }); });
    await user.click(within(first.container).getByRole('button', { name: '보내기' }));
    const tempC = sendTeamMessageAction.mock.calls[1][0].tempId;
    await user.type(textarea, '초안 B');
    await act(async () => { resolveC({ ok: false, error: 'NETWORK' }); });
    const peer = source === '다른 화면' ? render(base({ messages: [] })) : null;
    const peerChannel = channelOptions;
    const rowA = within(first.container).getByText('미확인 A').closest('[data-message-row]') as HTMLElement;
    await user.click(within(rowA).getByRole('button', { name: action }));
    const ownChannel = channelOptions;
    const dialog = await screen.findByRole('dialog');
    const confirmation = within(dialog).getByRole('button', { name: action });
    const echo = (tempId: string, body: string, id: string) => ({ type: 'message', id, tempId, body,
      authorUserId: 'u-me', createdAt: '2026-10-08T05:00:00.000Z' });

    act(() => ownChannel.onMessage?.(echo(tempC, '미확인 C', 'confirmed-c')));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    confirmation.focus();
    act(() => {
      if (source === '다른 탭') {
        const key = 'team-chat-failed:u-me:ws-1:rfp-1:message:' + tempA;
        const newValue = JSON.stringify({ confirmed: true });
        window.localStorage.setItem(key, newValue);
        window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea: window.localStorage }));
      } else (peer ? peerChannel : ownChannel).onMessage?.(echo(tempA, '미확인 A', 'confirmed-a'));
    });

    if (action === '다시 보내기') act(() => confirmation.click());
    expect(sendTeamMessageAction).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(first.container).queryByRole('button', { name: '다시 보내기' })).not.toBeInTheDocument();
    await waitFor(() => expect(textarea).toHaveFocus());
    expect(textarea).toHaveValue('초안 B');
  });

  // Without acknowledgement, an unknown committed memo can be duplicated after remount.
  it.each(['NETWORK', 'throw'] as const)('%s 결과를 재진입 후에도 미확인으로 표시하고 확인한 A만 다시 보낸다', async (failure) => {
    const user = userEvent.setup();
    let resolveSend!: (value: unknown) => void;
    let rejectSend!: (reason: Error) => void;
    sendTeamMessageAction.mockReturnValueOnce(new Promise((resolve, reject) => { resolveSend = resolve; rejectSend = reject; }));
    const first = render(base({ messages: [] }));
    await user.type(screen.getByRole('textbox'), '결과를 모르는 A');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await user.type(screen.getByRole('textbox'), '다음 초안 B');
    await act(async () => {
      if (failure === 'throw') rejectSend(new Error('response lost'));
      else resolveSend({ ok: false, error: 'NETWORK' });
    });
    expect(screen.getByText('전송 결과를 확인하지 못했어요')).toBeInTheDocument();
    first.unmount();
    render(base({ messages: [{ ...messages[1], id: 'server-a', body: '결과를 모르는 A' }] }));
    await user.type(screen.getByRole('textbox'), '다음 초안 B');
    expect(await screen.findByText('전송 결과를 확인하지 못했어요')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다시 보내기' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/이미 받았을 수 있어요/)).toBeInTheDocument();
    expect(within(dialog).getByText(/두 번/)).toBeInTheDocument();
    expect(sendTeamMessageAction).toHaveBeenCalledTimes(1);
    await user.click(within(dialog).getByRole('button', { name: '닫기' }));
    expect(sendTeamMessageAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox')).toHaveValue('다음 초안 B');
    await user.click(screen.getByRole('button', { name: '다시 보내기' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '다시 보내기' }));
    expect(sendTeamMessageAction).toHaveBeenLastCalledWith(expect.objectContaining({ body: '결과를 모르는 A' }));
    expect(screen.getByRole('textbox')).toHaveValue('다음 초안 B');
  });

  it('다음 초안이 없어도 NETWORK 메모는 컴포저로 되돌리지 않고 확인 후 재시도한다', async () => {
    const user = userEvent.setup();
    sendTeamMessageAction.mockResolvedValueOnce({ ok: false, error: 'NETWORK' });
    render(base({ messages: [] }));
    await user.type(screen.getByRole('textbox'), '미확인 A');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    expect(await screen.findByText('전송 결과를 확인하지 못했어요')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: '다시 보내기' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(sendTeamMessageAction).toHaveBeenCalledTimes(1);
  });

  // Removing retry's node or disabling it natively loses keyboard focus before a result arrives.
  it.each(['유지', '이동'] as const)('키보드 재시도 중 포커스를 유지하고 성공 후 사용자 포커스 %s를 따른다', async (focus) => {
    const user = userEvent.setup();
    let resolveFirst!: (value: unknown) => void;
    let resolveRetry!: (value: unknown) => void;
    sendTeamMessageAction.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveRetry = resolve; }));
    render(base({ messages: [] }));
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, '재시도 A');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await user.type(textarea, '초안 B');
    await act(async () => { resolveFirst({ ok: false, error: 'FORBIDDEN' }); });
    const retry = screen.getByRole('button', { name: '다시 보내기' });
    retry.focus();
    await user.keyboard('{Enter}');
    expect(retry).toHaveFocus();
    expect(retry).toHaveAttribute('aria-disabled', 'true');
    await user.keyboard('{Enter}');
    expect(sendTeamMessageAction).toHaveBeenCalledTimes(2);
    if (focus === '이동') screen.getByRole('button', { name: '파일 첨부' }).focus();
    await act(async () => { resolveRetry({ ok: true, messageId: 'retry-a' }); });
    expect(focus === '이동' ? screen.getByRole('button', { name: '파일 첨부' }) : textarea).toHaveFocus();
    expect(textarea).toHaveValue('초안 B');
  });

  // Echo confirmation must hand focus back before the pending recovery control unmounts.
  it('재시도의 성공 echo가 먼저 와도 사라지는 버튼의 포커스를 이 컴포저로 돌린다', async () => {
    const user = userEvent.setup();
    let resolveFirst!: (value: unknown) => void;
    sendTeamMessageAction.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockReturnValueOnce(new Promise(() => {}));
    render(base({ messages: [] }));
    await user.type(screen.getByRole('textbox'), '재시도 A');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await user.type(screen.getByRole('textbox'), '초안 B');
    await act(async () => { resolveFirst({ ok: false, error: 'FORBIDDEN' }); });
    const retry = screen.getByRole('button', { name: '다시 보내기' });
    retry.focus();
    await user.keyboard('{Enter}');
    const { tempId } = sendTeamMessageAction.mock.calls[0][0];
    act(() => channelOptions.onMessage?.({ type: 'message', id: 'echo-a', tempId,
      body: '재시도 A', authorUserId: 'u-me', createdAt: '2026-10-08T05:00:00.000Z' }));
    expect(screen.queryByRole('button', { name: '다시 보내기' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveFocus();
    expect(screen.getByRole('textbox')).toHaveValue('초안 B');
  });

  // Deleting all stored rows or touching the composer would lose C or B when discarding A.
  it('기록 지우기는 실패 A만 지우고 초안 B와 다른 실패 C를 유지하며 컴포저로 포커스를 돌린다', async () => {
    const user = userEvent.setup();
    let resolveA!: (value: unknown) => void;
    let resolveC!: (value: unknown) => void;
    sendTeamMessageAction.mockReturnValueOnce(new Promise((resolve) => { resolveA = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveC = resolve; }));
    const first = render(base({ messages: [] }));
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, '지울 A');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await user.type(textarea, '남길 C');
    await act(async () => { resolveA({ ok: false, error: 'FORBIDDEN' }); });
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await user.type(textarea, '초안 B');
    await act(async () => { resolveC({ ok: false, error: 'FORBIDDEN' }); });
    const row = screen.getByText('지울 A').closest('[data-message-row]') as HTMLElement;
    const status = within(row).getByRole('status');
    expect(within(status).queryByRole('button')).not.toBeInTheDocument();
    const discard = within(row).getByRole('button', { name: '기록 지우기' });
    discard.focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/이 브라우저.*복구 기록만/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '기록 지우기' }));
    expect(screen.queryByText('지울 A')).not.toBeInTheDocument();
    expect(screen.getByText('남길 C')).toBeInTheDocument();
    await waitFor(() => expect(textarea).toHaveFocus());
    expect(textarea).toHaveValue('초안 B');
    expect(sendTeamMessageAction).toHaveBeenCalledTimes(2);
    first.unmount();
    render(base({ messages: [] }));
    expect(screen.queryByText('지울 A')).not.toBeInTheDocument();
    expect(await screen.findByText('남길 C')).toBeInTheDocument();
  });
});
import { MARK_READ_DEBOUNCE_MS } from '@/lib/hooks/useMarkReadWhileVisible';

/** 도착 후 읽음은 트레일링 디바운스다 — "읽음 처리 안 함"을 단언하기 전에 그 창을 지나 보내야 한다.
 *  기다리지 않고 단언하면 게이트가 없어도 카운트가 아직 그대로라 테스트가 아무것도 지키지 못한다. */
async function flushReadDebounce() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, MARK_READ_DEBOUNCE_MS + 50));
  });
}

// T03:00Z–T14:00Z 창 안의 타임스탬프 — UTC/KST 날짜가 일치(타임존 플레이크 방지).
const messages: TeamThreadMessage[] = [
  {
    id: 'tm1',
    authorUserId: 'u-mate',
    authorName: '이동료',
    authorAvatarUpdatedAt: null,
    body: '이 견적 수수료 괜찮은데요?',
    createdAt: '2026-06-09T05:00:00.000Z',
    isSelf: false,
    attachments: [],
  },
  {
    id: 'tm2',
    authorUserId: 'u-me',
    authorName: '김구매',
    authorAvatarUpdatedAt: null,
    body: '내일 회의에서 정리하시죠.',
    createdAt: '2026-06-10T05:00:00.000Z',
    isSelf: true,
    attachments: [],
  },
];

const teamMembers = [
  { userId: 'u-mate', name: '이동료', joinedAt: '2026-03-14T00:00:00.000Z', avatarUpdatedAt: null },
  { userId: 'u-me', name: '김구매', joinedAt: '2026-04-01T00:00:00.000Z', avatarUpdatedAt: null },
];

function base(overrides: Partial<React.ComponentProps<typeof TeamThreadView>> = {}) {
  return (
    <TeamThreadView
      rfpId="rfp-1"
      workspaceId="ws-1"
      viewerUserId="u-me"
      viewerAvatarUpdatedAt={null}
      messages={messages}
      teamMembers={teamMembers}
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

  it('마운트 시 팀 스레드를 읽음 처리한다', () => {
    render(base());
    expect(markTeamThreadReadAction).toHaveBeenCalledWith({
      rfpId: 'rfp-1',
      throughMessageId: 'tm2',
    });
  });

  it('열려 있는 동안 동료 메시지가 오면 다시 읽음 처리한다', async () => {
    render(base({ viewerUserId: 'u-me' }));
    await waitFor(() => expect(markTeamThreadReadAction).toHaveBeenCalledTimes(1));

    act(() =>
      channelOptions.onMessage?.({
        type: 'message',
        id: 'tm-live-read',
        body: '동료 메시지',
        authorUserId: 'u-mate',
        authorName: '이동료',
        createdAt: '2026-06-10T07:00:00.000Z',
      }),
    );

    await waitFor(() => expect(markTeamThreadReadAction).toHaveBeenCalledTimes(2));
    expect(markTeamThreadReadAction).toHaveBeenLastCalledWith({
      rfpId: 'rfp-1',
      throughMessageId: 'tm-live-read',
    });
  });

  it('위로 스크롤해 최신 메시지가 화면에 없으면 읽음 처리하지 않는다', async () => {
    render(base({ viewerUserId: 'u-me' }));
    await waitFor(() => expect(markTeamThreadReadAction).toHaveBeenCalledTimes(1));

    act(() => scrollAwayFromBottom());
    act(() =>
      channelOptions.onMessage?.({
        type: 'message',
        id: 'tm-offscreen',
        body: '화면 밖 동료 메시지',
        authorUserId: 'u-mate',
        authorName: '이동료',
        createdAt: '2026-06-10T07:03:00.000Z',
      }),
    );

    expect(await screen.findByText('화면 밖 동료 메시지')).toBeInTheDocument();
    await flushReadDebounce();
    expect(markTeamThreadReadAction).toHaveBeenCalledTimes(1);
  });

  it('아래로 다시 내려와 최신 메시지가 보이면 그때 읽음 처리한다', async () => {
    render(base({ viewerUserId: 'u-me' }));
    await waitFor(() => expect(markTeamThreadReadAction).toHaveBeenCalledTimes(1));

    act(() => scrollAwayFromBottom());
    act(() =>
      channelOptions.onMessage?.({
        type: 'message',
        id: 'tm-catchup',
        body: '나중에 볼 동료 메시지',
        authorUserId: 'u-mate',
        authorName: '이동료',
        createdAt: '2026-06-10T07:04:00.000Z',
      }),
    );
    await flushReadDebounce();
    expect(markTeamThreadReadAction).toHaveBeenCalledTimes(1);

    act(() => scrollBackToBottom());

    await waitFor(() => expect(markTeamThreadReadAction).toHaveBeenCalledTimes(2));
  });

  it('탭이 숨겨져 있으면 도착한 메시지로 읽음 처리하지 않는다', async () => {
    render(base({ viewerUserId: 'u-me' }));
    await waitFor(() => expect(markTeamThreadReadAction).toHaveBeenCalledTimes(1));

    const original = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    try {
      act(() =>
        channelOptions.onMessage?.({
          type: 'message',
          id: 'tm-live-hidden',
          body: '숨은 탭 동료 메시지',
          authorUserId: 'u-mate',
          authorName: '이동료',
          createdAt: '2026-06-10T07:01:00.000Z',
        }),
      );
      expect(await screen.findByText('숨은 탭 동료 메시지')).toBeInTheDocument();
      await flushReadDebounce();
      expect(markTeamThreadReadAction).toHaveBeenCalledTimes(1);
    } finally {
      if (original) Object.defineProperty(document, 'visibilityState', original);
      else
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => 'visible',
        });
    }
  });

  it('내 메시지 echo 로는 읽음 처리하지 않는다', async () => {
    render(base({ viewerUserId: 'u-me' }));
    await waitFor(() => expect(markTeamThreadReadAction).toHaveBeenCalledTimes(1));

    act(() =>
      channelOptions.onMessage?.({
        type: 'message',
        id: 'tm-live-self',
        body: '내가 쓴 메모',
        authorUserId: 'u-me',
        authorName: '나',
        createdAt: '2026-06-10T07:02:00.000Z',
      }),
    );

    expect(await screen.findByText('내가 쓴 메모')).toBeInTheDocument();
    await flushReadDebounce();
    expect(markTeamThreadReadAction).toHaveBeenCalledTimes(1);
  });

  it('늦게 도착한 예전 팀 메시지가 최신 읽음 경계를 뒤로 돌리지 않는다', async () => {
    render(base({ viewerUserId: 'u-me' }));
    await waitFor(() => expect(markTeamThreadReadAction).toHaveBeenCalledTimes(1));
    vi.mocked(markTeamThreadReadAction).mockClear();

    act(() => {
      channelOptions.onMessage?.({
        type: 'message',
        id: 'tm-live-newer',
        body: '최신 팀 메시지',
        authorUserId: 'u-mate',
        authorName: '동료',
        createdAt: '2026-06-10T07:02:00.000Z',
      });
      channelOptions.onMessage?.({
        type: 'message',
        id: 'tm-live-older',
        body: '늦게 도착한 예전 메시지',
        authorUserId: 'u-mate',
        authorName: '동료',
        createdAt: '2026-06-10T07:01:00.000Z',
      });
    });

    await flushReadDebounce();
    expect(markTeamThreadReadAction).toHaveBeenCalledWith({
      rfpId: 'rfp-1',
      throughMessageId: 'tm-live-newer',
    });
  });

  it('읽음 처리와 함께 그 스레드의 알림 배지를 로컬에서도 내린다', async () => {
    render(base());

    await waitFor(() =>
      expect(markThreadReadLocal).toHaveBeenCalledWith(
        '/messages?t=rfp-1',
        '2026-06-10T07:00:00.000Z',
      ),
    );
  });

  it('읽음 서버 처리가 실패하면 알림 배지를 로컬에서 먼저 내리지 않는다', async () => {
    vi.mocked(markTeamThreadReadAction).mockResolvedValue({ ok: false, error: 'FORBIDDEN' });
    markThreadReadLocal.mockClear();

    render(base());

    await waitFor(() => expect(markTeamThreadReadAction).toHaveBeenCalledTimes(1));
    expect(markThreadReadLocal).not.toHaveBeenCalled();
  });

  it('컴포저는 좁은 레일에서 placeholder 가 두 줄로 잘리지 않도록 min-w-0 슬롯과 한 줄 placeholder 를 쓴다', () => {
    render(base({ messages: [] }));
    const ta = screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…');
    expect(ta.parentElement).toHaveClass('min-w-0');
    expect(ta).toHaveClass('placeholder:truncate');
    expect(ta).toHaveClass('box-border');
  });
});

describe('TeamThreadView — 전송', () => {
  // Value: protects=UUID API 없는 브라우저의 팀 전송과 동기 중복 방지; fails_when=randomUUID 부재가 전송 잠금을 남김; why_new=기존 팀 전송 테스트에는 UUID API가 있음; seam=실제 팀 컴포저와 액션 경계.
  it('randomUUID가 없어도 팀 메모를 보내고 실패 뒤 재시도할 수 있다', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
    Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: undefined });
    try {
      const user = userEvent.setup();
      let resolveSend!: (value: unknown) => void;
      sendTeamMessageAction.mockReturnValueOnce(new Promise((resolve) => { resolveSend = resolve; }));
      render(base({ messages: [] }));
      const textarea = screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…');
      await user.type(textarea, '첫 메모');
      const sendButton = screen.getByRole('button', { name: '보내기' });
      act(() => { sendButton.click(); sendButton.click(); });

      expect(sendTeamMessageAction).toHaveBeenCalledTimes(1);
      const firstId = sendTeamMessageAction.mock.calls[0][0].tempId;
      expect(screen.getByLabelText('전송 중')).toBeInTheDocument();
      await act(async () => { resolveSend({ ok: false, error: 'FORBIDDEN' }); });
      expect(textarea).toHaveValue('첫 메모');
      expect(sendButton).toBeEnabled();
      await user.click(sendButton);
      await waitFor(() => expect(sendTeamMessageAction).toHaveBeenCalledTimes(2));
      expect(sendTeamMessageAction.mock.calls[1][0].tempId).not.toBe(firstId);
      expect(screen.queryByLabelText('전송 중')).not.toBeInTheDocument();
    } finally {
      if (descriptor) Object.defineProperty(globalThis.crypto, 'randomUUID', descriptor);
      else Reflect.deleteProperty(globalThis.crypto, 'randomUUID');
    }
  });

  // Value: protects=팀 실패 A의 멘션 토큰·첨부 재진입 복구와 성공 뒤 제거; fails_when=로컬 실패 메모가 수명 종료로 사라지거나 토큰/첨부를 잃음; why_new=기존 팀 경합 테스트는 unmount하지 않음; seam=실제 localStorage·멘션 컨트롤러·팀 컴포넌트 수명.
  it('재진입하면 실패한 팀 메모의 멘션과 첨부를 복구하고 재시도 성공 뒤에는 제거한다', async () => {
    const mate = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const members = [{ userId: mate, name: '이동료', joinedAt: '2026-03-14T00:00:00.000Z', avatarUpdatedAt: null }];
    const user = userEvent.setup();
    let resolveSend!: (value: unknown) => void;
    sendTeamMessageAction.mockReturnValueOnce(new Promise((resolve) => { resolveSend = resolve; }));
    uploadAttachment.mockResolvedValueOnce({ id: 'att-first', name: '첫 첨부.pdf', size: 1234, mimeType: 'application/pdf' });
    const first = render(base({ messages: [], teamMembers: members }));
    const textarea = screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…');
    await user.type(textarea, '@이');
    await user.click(await screen.findByRole('option', { name: /이동료/ }));
    await user.type(textarea, '확인해 주세요');
    await user.upload(first.container.querySelector('input[type="file"]') as HTMLInputElement, new File(['first'], '첫 첨부.pdf', { type: 'application/pdf' }));
    await screen.findByLabelText('첫 첨부.pdf 첨부 제거');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    const { tempId } = sendTeamMessageAction.mock.calls[0][0];
    await user.type(textarea, '다음 메모');
    await act(async () => { resolveSend({ ok: false, error: 'NETWORK' }); });
    first.unmount();

    const recovered = render(base({ messages: [], teamMembers: members }));

    expect(screen.getByText('@이동료')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /첫 첨부.pdf/ })).toHaveAttribute('href', '/api/files/att-first');
    await user.type(screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…'), '새 다음 메모');
    await user.click(screen.getByRole('button', { name: '다시 보내기' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '다시 보내기' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: '다시 보내기' })).not.toBeInTheDocument());
    expect(sendTeamMessageAction).toHaveBeenLastCalledWith(expect.objectContaining({ body: `<@${mate}> 확인해 주세요`, attachmentIds: ['att-first'], tempId }));
    expect(screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…')).toHaveValue('새 다음 메모');
    recovered.unmount();
    render(base({ messages: [], teamMembers: members }));
    expect(screen.queryByText('@이동료')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 보내기' })).not.toBeInTheDocument();
  });

  // Value: protects=실패한 팀 메모의 사용자·워크스페이스·견적 분리; fails_when=다른 범위에서 실패 기록을 노출하거나 원래 기록을 지움; why_new=기존 재진입 테스트는 같은 팀만 다시 엶; seam=실제 실패 전송과 localStorage·컴포넌트 수명.
  it('실패한 팀 메모는 같은 사용자·워크스페이스·견적에서만 복구한다', async () => {
    const user = userEvent.setup();
    let resolveSend!: (value: unknown) => void;
    sendTeamMessageAction.mockReturnValueOnce(new Promise((resolve) => { resolveSend = resolve; }));
    const first = render(base({ messages: [] }));
    const textarea = screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…');
    await user.type(textarea, '이 팀의 실패 메모');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await user.type(textarea, '다음 초안');
    await act(async () => { resolveSend({ ok: false, error: 'NETWORK' }); });
    first.unmount();

    for (const otherScope of [
      { viewerUserId: 'u-other' },
      { workspaceId: 'ws-other' },
      { rfpId: 'rfp-other' },
    ]) {
      const other = render(base({ messages: [], ...otherScope }));
      expect(screen.queryByText('이 팀의 실패 메모')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '다시 보내기' })).not.toBeInTheDocument();
      other.unmount();
    }

    render(base({ messages: [] }));
    expect(screen.getByText('이 팀의 실패 메모')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 보내기' })).toBeEnabled();
  });

  // Value: protects=재시도 진행 중 이탈한 실패 A의 복구; fails_when=재시도 시작이 영속 실패 기록을 지워 응답 전에 메모를 잃음; why_new=기존 재진입 테스트는 재시도 완료 뒤 이탈함; seam=보류된 팀 액션과 실제 unmount/remount.
  it('실패한 메모를 다시 보내는 중에 나갔다 돌아와도 복구해 다시 보낼 수 있다', async () => {
    const user = userEvent.setup();
    let resolveFirst!: (value: unknown) => void;
    sendTeamMessageAction
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockReturnValueOnce(new Promise(() => {}));
    const first = render(base({ messages: [] }));
    const textarea = screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…');
    await user.type(textarea, '재시도 중에도 보존할 메모');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    const { tempId } = sendTeamMessageAction.mock.calls[0][0];
    await user.type(textarea, '다음 초안');
    await act(async () => { resolveFirst({ ok: false, error: 'NETWORK' }); });
    await user.click(screen.getByRole('button', { name: '다시 보내기' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '다시 보내기' }));
    expect(sendTeamMessageAction).toHaveBeenNthCalledWith(2, expect.objectContaining({
      body: '재시도 중에도 보존할 메모', tempId,
    }));
    expect(screen.getByLabelText('전송 중')).toBeInTheDocument();
    first.unmount();

    render(base({ messages: [] }));

    expect(screen.getByText('재시도 중에도 보존할 메모')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 보내기' })).toBeEnabled();
    expect(screen.queryByLabelText('전송 중')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…')).toHaveValue('');
  });

  // Value: protects=이탈 뒤 늦은 재시도 성공이 해당 실패 A만 제거하고 다른 실패 C는 보존함; fails_when=성공 정리가 마운트된 effect에 의존하거나 저장 기록 전체를 지움; why_new=기존 재시도 재진입 테스트는 이탈 뒤 응답을 완료하지 않음; seam=실제 팀 전송·localStorage·언마운트 뒤 응답.
  it('닫힌 뒤 재시도 성공 응답이 와도 해당 실패 메모만 제거하고 다른 실패는 복구한다', async () => {
    const user = userEvent.setup();
    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;
    let resolveRetry!: (value: unknown) => void;
    sendTeamMessageAction
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveRetry = resolve; }));
    const first = render(base({ messages: [] }));
    const textarea = screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…');
    await user.type(textarea, '늦게 성공한 메모 A');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    const firstTempId = sendTeamMessageAction.mock.calls[0][0].tempId;
    await user.type(textarea, '보존할 실패 메모 C');
    await act(async () => { resolveFirst({ ok: false, error: 'NETWORK' }); });
    await user.click(screen.getByRole('button', { name: '보내기' }));
    const secondTempId = sendTeamMessageAction.mock.calls[1][0].tempId;
    await user.type(textarea, '다음 초안 B');
    await act(async () => { resolveSecond({ ok: false, error: 'NETWORK' }); });
    const firstRow = screen.getByText('늦게 성공한 메모 A').closest('[data-message-row]') as HTMLElement;
    await user.click(within(firstRow).getByRole('button', { name: '다시 보내기' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '다시 보내기' }));
    expect(sendTeamMessageAction).toHaveBeenNthCalledWith(3, expect.objectContaining({
      body: '늦게 성공한 메모 A', tempId: firstTempId,
    }));
    expect(screen.getByLabelText('전송 중')).toBeInTheDocument();
    first.unmount();

    await act(async () => {
      resolveRetry({ ok: true, messageId: 'tm-late-retry-success', createdAt: '2026-10-08T05:00:00.000Z' });
    });

    const stored = Object.keys(window.localStorage)
      .filter((key) => key.startsWith('team-chat-failed:u-me:ws-1:rfp-1:message:'))
      .map((key) => JSON.parse(window.localStorage.getItem(key) ?? 'null'))
      .filter((message) => message?.confirmed !== true);
    expect(stored.map((message: { id: string }) => message.id)).toEqual([secondTempId]);
    render(base({ messages: [] }));
    expect(screen.queryByText('늦게 성공한 메모 A')).not.toBeInTheDocument();
    const secondRow = screen.getByText('보존할 실패 메모 C').closest('[data-message-row]') as HTMLElement;
    expect(within(secondRow).getByRole('button', { name: '다시 보내기' })).toBeEnabled();
    expect(screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…')).toHaveValue('');
  });

  // Value: protects=서버 메시지가 먼저 존재하는 경우에도 성공 echo로 복구 실패 행 제거; fails_when=realId 중복 검사에서 조기 반환해 실패 snapshot이 남음; why_new=기존 echo 테스트는 서버 realId가 목록에 없음; seam=서버 목록·tempId echo·실제 재진입.
  it('서버 메시지가 이미 있어도 자기 tempId의 성공 echo를 받으면 실패 복구 기록을 제거한다', async () => {
    const user = userEvent.setup();
    let resolveSend!: (value: unknown) => void;
    sendTeamMessageAction.mockReturnValueOnce(new Promise((resolve) => { resolveSend = resolve; }));
    const first = render(base({ messages: [] }));
    const textarea = screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…');
    await user.type(textarea, '서버에 도착한 실패 메모');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    const { tempId } = sendTeamMessageAction.mock.calls[0][0];
    await user.type(textarea, '다음 초안');
    await act(async () => { resolveSend({ ok: false, error: 'NETWORK' }); });
    first.unmount();

    const confirmed: TeamThreadMessage = {
      id: 'tm-server-known', authorUserId: 'u-me', authorName: '김구매',
      authorAvatarUpdatedAt: null, body: '서버에 도착한 실패 메모',
      createdAt: '2026-10-08T05:00:00.000Z', isSelf: true, attachments: [],
    };
    const recovered = render(base({ messages: [confirmed] }));
    expect(screen.getAllByText('서버에 도착한 실패 메모')).toHaveLength(2);
    expect(screen.getByRole('button', { name: '다시 보내기' })).toBeInTheDocument();

    act(() => channelOptions.onMessage?.({
      type: 'message', id: confirmed.id, tempId, body: confirmed.body,
      authorUserId: 'u-me', createdAt: confirmed.createdAt,
    }));

    expect(screen.queryByRole('button', { name: '다시 보내기' })).not.toBeInTheDocument();
    expect(screen.getAllByText('서버에 도착한 실패 메모')).toHaveLength(1);
    recovered.unmount();
    render(base({ messages: [] }));
    expect(screen.queryByText('서버에 도착한 실패 메모')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 보내기' })).not.toBeInTheDocument();
  });

  // Value: protects=저장된 실패 첨부의 링크·이미지가 내부 파일 ACL 경로로만 복구됨; fails_when=localStorage의 url을 신뢰해 외부 링크와 이미지 요청을 만듦; why_new=기존 복구 테스트에는 정상 첨부 URL만 있음; seam=실제 저장 기록의 URL 변조와 복구 UI.
  it('저장된 실패 첨부의 URL은 무시하고 파일 id로 링크와 이미지 경로를 복구한다', async () => {
    const user = userEvent.setup();
    const attachmentId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    let resolveSend!: (value: unknown) => void;
    sendTeamMessageAction.mockReturnValueOnce(new Promise((resolve) => { resolveSend = resolve; }));
    uploadAttachment.mockResolvedValueOnce({ id: attachmentId, name: '복원 이미지.png', size: 1234, mimeType: 'image/png' });
    const first = render(base({ messages: [] }));
    const textarea = screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…');
    await user.type(textarea, '첨부가 있는 실패 메모');
    await user.upload(first.container.querySelector('input[type="file"]') as HTMLInputElement, new File(['image'], '복원 이미지.png', { type: 'image/png' }));
    await screen.findByLabelText('복원 이미지.png 첨부 제거');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await user.type(textarea, '다음 초안');
    await act(async () => { resolveSend({ ok: false, error: 'NETWORK' }); });
    first.unmount();
    const storageKey = `team-chat-failed:u-me:ws-1:rfp-1:message:${sendTeamMessageAction.mock.calls[0][0].tempId}`;
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null');
    expect(stored.id).toBe(sendTeamMessageAction.mock.calls[0][0].tempId);
    stored.attachments[0].url = 'https://attacker.example/collect';
    window.localStorage.setItem(storageKey, JSON.stringify(stored));

    render(base({ messages: [] }));

    expect(screen.getByText('첨부가 있는 실패 메모')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 보내기' })).toBeEnabled();
    expect(screen.getByRole('link', { name: /복원 이미지.png/ })).toHaveAttribute('href', `/api/files/${attachmentId}`);
    expect(screen.getByRole('img', { name: '복원 이미지.png' })).toHaveAttribute('src', `/api/files/${attachmentId}`);
  });

  // Value: protects=팀 읽음 cursor가 복구된 미전송 메모 대신 마지막 서버 메시지를 가리킴; fails_when=복구 실패 행의 tempId를 초기 읽음 경계로 전송함; why_new=기존 읽음 테스트에는 영속 실패 행이 없음; seam=실제 실패 복구와 markTeamThreadReadAction 경계.
  it('실패 메모를 복구해도 초기 읽음 경계는 마지막 서버 메시지다', async () => {
    const user = userEvent.setup();
    let resolveSend!: (value: unknown) => void;
    sendTeamMessageAction.mockReturnValueOnce(new Promise((resolve) => { resolveSend = resolve; }));
    const first = render(base());
    const textarea = screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…');
    await user.type(textarea, '읽음 경계가 아닌 실패 메모');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await user.type(textarea, '다음 초안');
    await act(async () => { resolveSend({ ok: false, error: 'NETWORK' }); });
    first.unmount();
    vi.mocked(markTeamThreadReadAction).mockClear();

    render(base());

    expect(screen.getByText('읽음 경계가 아닌 실패 메모')).toBeInTheDocument();
    expect(markTeamThreadReadAction).toHaveBeenLastCalledWith({
      rfpId: 'rfp-1', throughMessageId: 'tm2',
    });
  });

  it('실패 뒤 늦게 받은 성공 echo는 실패 표시와 재시도를 없애고 다음 초안을 유지한다', async () => {
    const user = userEvent.setup();
    let rejectSend!: (reason: Error) => void;
    sendTeamMessageAction.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectSend = reject; }));
    render(base({ messages: [] }));
    const textarea = screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…');
    await user.type(textarea, '첫 메모');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    const { tempId } = sendTeamMessageAction.mock.calls[0][0];
    await user.type(textarea, '다음 초안');
    await act(async () => { rejectSend(new Error('response lost')); });
    expect(screen.getByRole('button', { name: '다시 보내기' })).toBeInTheDocument();

    act(() => channelOptions.onMessage?.({
      type: 'message', id: 'tm-late-success', tempId, body: '첫 메모',
      authorUserId: 'u-me', createdAt: '2026-10-08T05:00:00.000Z',
    }));

    expect(screen.queryByRole('button', { name: '다시 보내기' })).not.toBeInTheDocument();
    expect(screen.queryByText('전송 결과를 확인하지 못했어요')).not.toBeInTheDocument();
    expect(screen.getAllByText('첫 메모')).toHaveLength(1);
    expect(textarea).toHaveValue('다음 초안');
    expect(sendTeamMessageAction).toHaveBeenCalledTimes(1);
  });

  it('재시도 중 중복 클릭을 막고 재시도 실패도 다음 초안을 바꾸지 않는다', async () => {
    const user = userEvent.setup();
    let resolveFirst!: (value: unknown) => void;
    let resolveRetry!: (value: unknown) => void;
    sendTeamMessageAction
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockReturnValue(new Promise((resolve) => { resolveRetry = resolve; }));
    render(base({ messages: [] }));
    const textarea = screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…');
    await user.type(textarea, '첫 메모');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await user.type(textarea, '다음 초안');
    await act(async () => { resolveFirst({ ok: false, error: 'FORBIDDEN' }); });
    const retryButton = screen.getByRole('button', { name: '다시 보내기' });

    act(() => {
      retryButton.click();
      retryButton.click();
    });

    expect(sendTeamMessageAction).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled();
    expect(screen.getByLabelText('전송 중')).toBeInTheDocument();
    await act(async () => { resolveRetry({ ok: false, error: 'NETWORK' }); });
    expect(textarea).toHaveValue('다음 초안');
    expect(screen.getByRole('button', { name: '다시 보내기' })).toBeEnabled();
    expect(screen.getAllByText('첫 메모')).toHaveLength(1);
  });

  it.each(['응답 실패', '예외'] as const)('%s여도 다음 초안·첨부를 보존하고 실패한 메모만 다시 보낸다', async (failure) => {
    const user = userEvent.setup();
    let resolveSend!: (value: unknown) => void;
    let rejectSend!: (reason: Error) => void;
    sendTeamMessageAction.mockReturnValueOnce(new Promise((resolve, reject) => {
      resolveSend = resolve;
      rejectSend = reject;
    }));
    uploadAttachment
      .mockResolvedValueOnce({ id: 'att-first', name: '첫 첨부.pdf', size: 1234, mimeType: 'application/pdf' })
      .mockResolvedValueOnce({ id: 'att-next', name: '다음 첨부.pdf', size: 5678, mimeType: 'application/pdf' });
    const { container } = render(base({ messages: [] }));
    const textarea = screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…');
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

    await user.type(textarea, '첫 메모');
    await user.upload(fileInput, new File(['first'], '첫 첨부.pdf', { type: 'application/pdf' }));
    await screen.findByLabelText('첫 첨부.pdf 첨부 제거');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await user.type(textarea, '다음 초안');
    await user.upload(fileInput, new File(['next'], '다음 첨부.pdf', { type: 'application/pdf' }));
    await screen.findByLabelText('다음 첨부.pdf 첨부 제거');

    await act(async () => {
      if (failure === '예외') rejectSend(new Error('network disconnected'));
      else resolveSend({ ok: false, error: 'NETWORK' });
    });

    expect(textarea).toHaveValue('다음 초안');
    expect(screen.getByLabelText('다음 첨부.pdf 첨부 제거')).toBeInTheDocument();
    expect(screen.queryByLabelText('첫 첨부.pdf 첨부 제거')).not.toBeInTheDocument();
    const failedRow = screen.getByText('첫 메모').closest('[data-message-row]') as HTMLElement;
    expect(within(failedRow).getByText('전송 결과를 확인하지 못했어요')).toBeInTheDocument();
    expect(within(failedRow).getByRole('link', { name: /첫 첨부.pdf/ })).toBeInTheDocument();

    sendTeamMessageAction.mockResolvedValueOnce({
      ok: true, messageId: 'tm-retried', createdAt: '2026-10-08T05:00:00.000Z',
    });
    await user.click(within(failedRow).getByRole('button', { name: '다시 보내기' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '다시 보내기' }));

    await waitFor(() => expect(within(failedRow).queryByText('전송 결과를 확인하지 못했어요')).not.toBeInTheDocument());
    expect(sendTeamMessageAction).toHaveBeenLastCalledWith(expect.objectContaining({
      body: '첫 메모', attachmentIds: ['att-first'],
    }));
    expect(textarea).toHaveValue('다음 초안');
    expect(screen.getByLabelText('다음 첨부.pdf 첨부 제거')).toBeInTheDocument();

    sendTeamMessageAction.mockResolvedValueOnce({ ok: false, error: 'FORBIDDEN' });
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await waitFor(() => expect(textarea).toHaveValue('다음 초안'));
    expect(screen.getByLabelText('다음 첨부.pdf 첨부 제거')).toBeInTheDocument();
  });

  it.each(['본문만', '업로드 중 첨부만'] as const)('다음 초안이 %s이어도 이전 실패로 덮어쓰지 않는다', async (nextDraft) => {
    const user = userEvent.setup();
    let resolveSend!: (value: unknown) => void;
    sendTeamMessageAction.mockReturnValueOnce(new Promise((resolve) => { resolveSend = resolve; }));
    let resolveUpload!: (value: unknown) => void;
    uploadAttachment.mockReturnValueOnce(new Promise((resolve) => { resolveUpload = resolve; }));
    const { container } = render(base({ messages: [] }));
    const textarea = screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…');
    await user.type(textarea, '첫 메모');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    if (nextDraft === '본문만') await user.type(textarea, '다음 초안');
    else {
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
      await user.upload(fileInput, new File(['next'], '다음 첨부.pdf', { type: 'application/pdf' }));
      expect(screen.getByLabelText('다음 첨부.pdf 업로드 중')).toBeInTheDocument();
    }

    await act(async () => { resolveSend({ ok: false, error: 'NETWORK' }); });

    expect(textarea).toHaveValue(nextDraft === '본문만' ? '다음 초안' : '');
    expect(screen.getByText('첫 메모').closest('[data-message-row]')).not.toBeNull();
    expect(screen.getByRole('button', { name: '다시 보내기' })).toBeInTheDocument();
    if (nextDraft === '업로드 중 첨부만') {
      expect(screen.getByLabelText('다음 첨부.pdf 업로드 중')).toBeInTheDocument();
      await act(async () => {
        resolveUpload({ id: 'att-next', name: '다음 첨부.pdf', size: 5678, mimeType: 'application/pdf' });
      });
      expect(screen.getByLabelText('다음 첨부.pdf 첨부 제거')).toBeInTheDocument();
    }
  });

  it('전송 중 말풍선을 morph 오버레이 없이 목록에 직접 표시한다', async () => {
    const user = userEvent.setup();
    let resolveSend!: (v: unknown) => void;
    sendTeamMessageAction.mockReturnValue(new Promise((res) => { resolveSend = res; }));
    render(base());

    await user.type(screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…'), '즉시 표시 메모');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    const bubble = await screen.findByText('즉시 표시 메모');
    expect(bubble.closest('[data-message-row]')).toHaveAttribute('data-sender', 'self');
    expect(document.querySelector('[data-morph-bounds]')).toBeNull();

    await act(async () => {
      resolveSend({ ok: true, messageId: 'tm-new', createdAt: '2026-06-10T01:23:00.000Z' });
    });
  });

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
      expect(sendTeamMessageAction).toHaveBeenCalledWith(
        expect.objectContaining({
          rfpId: 'rfp-1',
          body: '새 팀 메모',
          attachmentIds: [],
        }),
      );
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
      expect(sendTeamMessageAction).toHaveBeenCalledWith(
        expect.objectContaining({
          rfpId: 'rfp-1',
          body: '줄1\n줄2',
          attachmentIds: [],
        }),
      );
    });
  });

  it('빈 본문이면 보내기 버튼이 비활성화된다', () => {
    render(base());
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled();
  });

  it('한글 IME 조합 중 Enter 는 전송하지 않는다', async () => {
    const user = userEvent.setup();
    render(base());
    const ta = screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…');

    await user.type(ta, '한글입력');
    fireEvent.keyDown(ta, { key: 'Enter', isComposing: true, keyCode: 229 });
    expect(sendTeamMessageAction).not.toHaveBeenCalled();
  });

  it('확정 승격 시 서버 createdAt 을 채택한다 (클라이언트 시계 드리프트 방지)', async () => {
    sendTeamMessageAction.mockResolvedValue({
      ok: true,
      messageId: 'tm-new',
      createdAt: '2026-06-10T01:23:00.000Z',
    });
    const user = userEvent.setup();
    render(base());

    await user.type(
      screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…'),
      '시각 확인 메모',
    );
    await user.click(screen.getByRole('button', { name: '보내기' }));

    await waitFor(() => {
      const row = screen.getByText('시각 확인 메모').closest('[data-message-row]')!;
      expect(
        within(row as HTMLElement).getByText(formatTime('2026-06-10T01:23:00.000Z')),
      ).toBeInTheDocument();
    });
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

describe('TeamThreadView — 첨부', () => {
  it('파일 업로드 후 보내기 시 attachmentIds 를 함께 전송하고 버블에 첨부를 렌더한다', async () => {
    uploadAttachment.mockResolvedValue({ id: 'att-1', name: '제안서.pdf', size: 1234, mimeType: 'application/pdf' });
    sendTeamMessageAction.mockResolvedValue({
      ok: true,
      messageId: 'tm-att',
      createdAt: '2026-06-10T10:06:00.000Z',
      attachments: [
        { id: 'att-1', name: '제안서.pdf', size: 1234, mimeType: 'application/pdf', url: '/api/files/att-1' },
      ],
    });
    const user = userEvent.setup();
    const { container } = render(base());

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], '제안서.pdf', { type: 'application/pdf' });
    await user.upload(input, file);
    await screen.findByLabelText('제안서.pdf 첨부 제거');

    // 업로드는 team_message 소유로, ownerId 는 rfpId 로 보낸다.
    expect(uploadAttachment).toHaveBeenCalledWith(expect.any(File), {
      ownerKind: 'team_message',
      ownerId: 'rfp-1',
    });

    await user.type(
      screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…'),
      '첨부 메모',
    );
    await user.click(screen.getByRole('button', { name: '보내기' }));

    await waitFor(() => {
      expect(sendTeamMessageAction).toHaveBeenCalledWith(
        expect.objectContaining({
          rfpId: 'rfp-1',
          body: '첨부 메모',
          attachmentIds: ['att-1'],
        }),
      );
    });
    const link = await screen.findByRole('link', { name: /제안서.pdf/ });
    expect(link).toHaveAttribute('href', '/api/files/att-1');
  });

  it('본문이 비어도 첨부만 있으면 전송할 수 있다', async () => {
    uploadAttachment.mockResolvedValue({ id: 'att-2', name: '이미지.png', size: 500, mimeType: 'image/png' });
    const user = userEvent.setup();
    const { container } = render(base());
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], '이미지.png', { type: 'image/png' });
    await user.upload(input, file);
    await screen.findByLabelText('이미지.png 첨부 제거');

    const sendBtn = screen.getByRole('button', { name: '보내기' });
    expect(sendBtn).toBeEnabled();
    await user.click(sendBtn);
    await waitFor(() => {
      expect(sendTeamMessageAction).toHaveBeenCalledWith(
        expect.objectContaining({
          rfpId: 'rfp-1',
          body: '',
          attachmentIds: ['att-2'],
        }),
      );
    });
  });

  it('첨부가 있는 메시지는 버블에 첨부 링크를 렌더한다', () => {
    const withAtt: TeamThreadMessage[] = [
      {
        id: 'a1',
        authorUserId: 'u-mate',
        authorName: '이동료',
        authorAvatarUpdatedAt: null,
        body: '파일 봐주세요',
        createdAt: '2026-06-10T05:00:00.000Z',
        isSelf: false,
        attachments: [
          { id: 'att-x', name: '명세.pdf', size: 100, mimeType: 'application/pdf', url: '/api/files/att-x' },
        ],
      },
    ];
    render(base({ messages: withAtt }));
    const link = screen.getByRole('link', { name: /명세.pdf/ });
    expect(link).toHaveAttribute('href', '/api/files/att-x');
  });

  it('라이브 onMessage 의 attachments 를 버블에 렌더한다', async () => {
    render(base());
    act(() =>
      channelOptions.onMessage?.({
        type: 'message',
        id: 'tm-live-att',
        body: '라이브 첨부',
        authorUserId: 'u-mate',
        authorName: '이동료',
        createdAt: '2026-06-10T06:00:00.000Z',
        attachments: [
          { id: 'att-live', name: '회의록.pdf', size: 200, mimeType: 'application/pdf', url: '/api/files/att-live' },
        ],
      }),
    );
    await screen.findByText('라이브 첨부');
    const link = screen.getByRole('link', { name: /회의록.pdf/ });
    expect(link).toHaveAttribute('href', '/api/files/att-live');
  });
});

describe('TeamThreadView — 첨부 검증·에러', () => {
  it('지원하지 않는 파일 형식 선택 시 에러 칩이 노출된다', async () => {
    const { container } = render(base());
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], '보고서.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    expect(await screen.findByLabelText('보고서.docx 업로드 실패')).toBeInTheDocument();
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  it('MAX_BYTES 초과 파일은 칩에 추가되지 않는다(silent skip)', async () => {
    const { container } = render(base());
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const oversized = new File([new Uint8Array(1)], '큰파일.pdf', { type: 'application/pdf' });
    Object.defineProperty(oversized, 'size', { value: 21 * 1024 * 1024 });
    Object.defineProperty(input, 'files', { value: [oversized], configurable: true });
    fireEvent.change(input);
    await waitFor(() => {
      expect(screen.queryByLabelText('큰파일.pdf 업로드 중')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('큰파일.pdf 업로드 실패')).not.toBeInTheDocument();
    });
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  it('업로드 중에는 스켈레톤 칩 + 전송 잠금, 완료되면 일반 칩으로 바뀐다', async () => {
    const user = userEvent.setup();
    let resolveUpload: ((v: unknown) => void) | null = null;
    uploadAttachment.mockReturnValue(new Promise((res) => { resolveUpload = res; }));
    const { container } = render(base());
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], '제안서.pdf', { type: 'application/pdf' });
    await user.upload(input, file);

    expect(screen.getByLabelText('제안서.pdf 업로드 중')).toBeInTheDocument();
    expect(screen.queryByLabelText('제안서.pdf 첨부 제거')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled();

    await act(async () => {
      resolveUpload?.({ id: 'att-1', name: '제안서.pdf', size: 1234, mimeType: 'application/pdf' });
    });
    await waitFor(() => {
      expect(screen.getByLabelText('제안서.pdf 첨부 제거')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('제안서.pdf 업로드 중')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '보내기' })).not.toBeDisabled();
  });

  it('업로드 실패 시 에러 칩으로 전환되고 토스트는 띄우지 않으며, 제거할 수 있다', async () => {
    const user = userEvent.setup();
    uploadAttachment.mockRejectedValue(new Error('upload failed'));
    const { container } = render(base());
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], '실패.pdf', { type: 'application/pdf' });
    await user.upload(input, file);

    await screen.findByLabelText('실패.pdf 업로드 실패');
    expect(toast).not.toHaveBeenCalled();
    await user.click(screen.getByLabelText('실패.pdf 첨부 제거'));
    await waitFor(() =>
      expect(screen.queryByLabelText('실패.pdf 업로드 실패')).not.toBeInTheDocument(),
    );
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

  it('본인 echo 가 액션 응답보다 먼저 오면 pending 말풍선을 승격한다 (중복 없음)', async () => {
    // 액션 응답을 보류해 echo-first 레이스를 강제한다.
    let resolveSend!: (v: unknown) => void;
    sendTeamMessageAction.mockImplementation(
      () => new Promise((res) => (resolveSend = res)),
    );
    const user = userEvent.setup();
    render(base());

    await user.type(
      screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…'),
      '레이스 메모',
    );
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await screen.findByText('레이스 메모'); // pending 상태

    // echo 선착 — pending 이 실제 id 로 승격돼야 한다 (append 아님).
    act(() =>
      channelOptions.onMessage?.({
        type: 'message',
        id: 'tm-echo',
        body: '레이스 메모',
        authorUserId: 'u-me',
        authorName: '김구매',
        createdAt: '2026-06-10T07:00:00.000Z',
      }),
    );
    expect(screen.getAllByText('레이스 메모')).toHaveLength(1);

    // 액션이 늦게 같은 id 로 응답 — temp 행은 이미 승격됐으므로 중복이 생기면 안 된다.
    await act(async () => {
      resolveSend({ ok: true, messageId: 'tm-echo', createdAt: '2026-06-10T07:00:00.000Z' });
    });
    expect(screen.getAllByText('레이스 메모')).toHaveLength(1);
    const row = screen.getByText('레이스 메모').closest('[data-message-row]')!;
    expect(row.querySelector('[aria-label="전송 중"]')).not.toBeInTheDocument();
  });

  it('타인 echo 는 pending 을 건드리지 않고 append 된다', async () => {
    let resolveSend!: (v: unknown) => void;
    sendTeamMessageAction.mockImplementation(
      () => new Promise((res) => (resolveSend = res)),
    );
    const user = userEvent.setup();
    render(base());

    await user.type(
      screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…'),
      '내 메모',
    );
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await screen.findByText('내 메모');

    act(() =>
      channelOptions.onMessage?.({
        type: 'message',
        id: 'tm-other',
        body: '동료 메모',
        authorUserId: 'u-mate',
        authorName: '이동료',
        createdAt: '2026-06-10T07:00:00.000Z',
      }),
    );
    // 동료 메시지가 append 됐고 내 pending 은 그대로 살아 있다.
    expect(screen.getByText('동료 메모')).toBeInTheDocument();
    const myRow = screen.getByText('내 메모').closest('[data-message-row]')!;
    expect(myRow.querySelector('[aria-label="전송 중"]')).toBeInTheDocument();

    await act(async () => {
      resolveSend({ ok: true, messageId: 'tm-mine', createdAt: '2026-06-10T07:01:00.000Z' });
    });
  });
});

describe('TeamThreadView — 스크롤', () => {
  function setScrolledUp(list: HTMLElement) {
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 300 });
    list.scrollTop = 0; // diff = 700 > 임계값 → 하단 아님
  }

  it('위로 올려둔 상태에서 팀원 라이브 메시지가 와도 하단으로 끌려가지 않는다', async () => {
    const { container } = render(base());
    const list = container.querySelector('[data-message-list]') as HTMLElement;
    setScrolledUp(list);
    const scrollSpy = vi
      .spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => {});

    act(() =>
      channelOptions.onMessage?.({
        type: 'message',
        id: 'tm-yank',
        body: '읽는 중 끼어든 메모',
        authorUserId: 'u-mate',
        authorName: '이동료',
        createdAt: '2026-06-10T06:00:00.000Z',
      }),
    );
    await screen.findByText('읽는 중 끼어든 메모');
    expect(scrollSpy).not.toHaveBeenCalled();
    scrollSpy.mockRestore();
  });

  it('본인 전송은 위로 올려둔 상태여도 하단으로 따라간다', async () => {
    const user = userEvent.setup();
    const { container } = render(base());
    const list = container.querySelector('[data-message-list]') as HTMLElement;
    setScrolledUp(list);
    const scrollSpy = vi
      .spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => {});

    await user.type(
      screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…'),
      '내가 보낸 메모',
    );
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await screen.findByText('내가 보낸 메모');
    expect(scrollSpy).toHaveBeenCalled();
    scrollSpy.mockRestore();
  });
});

describe('TeamThreadView — 그룹핑', () => {
  it('같은 작성자의 5분 이내 연속 메시지는 작성자 헤더를 생략한다', () => {
    const grouped: TeamThreadMessage[] = [
      {
        id: 'g1',
        authorUserId: 'u-mate',
        authorName: '이동료',
        authorAvatarUpdatedAt: null,
        body: '첫 메시지',
        createdAt: '2026-06-10T05:00:00.000Z',
        isSelf: false,
        attachments: [],
      },
      {
        id: 'g2',
        authorUserId: 'u-mate',
        authorName: '이동료',
        authorAvatarUpdatedAt: null,
        body: '바로 이어진 메시지',
        createdAt: '2026-06-10T05:02:00.000Z', // 2분 뒤 — 그룹핑
        isSelf: false,
        attachments: [],
      },
      {
        id: 'g3',
        authorUserId: 'u-mate',
        authorName: '이동료',
        authorAvatarUpdatedAt: null,
        body: '한참 뒤 메시지',
        createdAt: '2026-06-10T05:30:00.000Z', // 28분 뒤 — 새 그룹
        isSelf: false,
        attachments: [],
      },
    ];
    render(base({ messages: grouped }));

    // 헤더(이름)는 그룹 시작에만 — 1·3번째 메시지에서 두 번.
    expect(screen.getAllByText('이동료')).toHaveLength(2);
  });
});

describe('TeamThreadView — 멘션', () => {
  // parseMentions 는 UUID 형식 토큰만 인식한다(team-mentions.ts MENTION_SOURCE).
  // 멘션 시나리오는 실제로 토큰화/파싱이 동작하는 UUID id 를 써야 한다.
  const MATE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ME = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const mentionMembers = [
    { userId: MATE, name: '이동료', joinedAt: '2026-03-14T00:00:00.000Z', avatarUpdatedAt: null },
    { userId: ME, name: '김구매', joinedAt: '2026-04-01T00:00:00.000Z', avatarUpdatedAt: null },
  ];

  it('@ 입력 시 멤버 드롭다운이 뜨고, 선택하면 @이름 이 삽입된다', async () => {
    const user = userEvent.setup();
    render(base({ teamMembers: mentionMembers, viewerUserId: ME }));
    const ta = screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…');
    await user.type(ta, '@이');
    // 드롭다운 옵션에 '이동료'.
    const option = await screen.findByRole('option', { name: /이동료/ });
    await user.click(option);
    expect((ta as HTMLTextAreaElement).value).toContain('@이동료');
  });

  it('멘션 선택 후 전송하면 body 에 토큰이 들어간다', async () => {
    const user = userEvent.setup();
    render(base({ teamMembers: mentionMembers, viewerUserId: ME }));
    const ta = screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…');
    await user.type(ta, '@이');
    await user.click(await screen.findByRole('option', { name: /이동료/ }));
    await user.type(ta, '확인');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await waitFor(() => {
      expect(sendTeamMessageAction).toHaveBeenCalledWith(
        expect.objectContaining({
          rfpId: 'rfp-1',
          body: `<@${MATE}> 확인`,
          attachmentIds: [],
        }),
      );
    });
  });

  // Value: 실패한 메모를 다시 보내도 다음 초안의 표시 멘션과 실제 수신 대상이 함께 유지된다.
  it('이전 메모를 재시도해도 다음 초안의 다른 멘션을 보존해 각자의 토큰으로 보낸다', async () => {
    const user = userEvent.setup();
    const NEXT_MATE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    let resolveFirst!: (value: unknown) => void;
    let resolveRetry!: (value: unknown) => void;
    sendTeamMessageAction
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveRetry = resolve; }))
      .mockResolvedValueOnce({
        ok: true, messageId: 'tm-next-mention', createdAt: '2026-10-08T05:01:00.000Z',
      });
    render(base({
      messages: [],
      viewerUserId: ME,
      teamMembers: [
        ...mentionMembers,
        { userId: NEXT_MATE, name: '박동료', joinedAt: '2026-04-02T00:00:00.000Z', avatarUpdatedAt: null },
      ],
    }));
    const textarea = screen.getByPlaceholderText('우리 팀에게만 보이는 메모를 남겨보세요…');

    await user.type(textarea, '@이');
    await user.click(await screen.findByRole('option', { name: /이동료/ }));
    await user.type(textarea, '첫 메모');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    expect(sendTeamMessageAction).toHaveBeenNthCalledWith(1, expect.objectContaining({
      body: `<@${MATE}> 첫 메모`,
    }));
    const { tempId } = sendTeamMessageAction.mock.calls[0][0];

    await user.type(textarea, '@박');
    await user.click(await screen.findByRole('option', { name: /박동료/ }));
    await user.type(textarea, '다음 초안');
    expect(textarea).toHaveValue('@박동료 다음 초안');
    await act(async () => { resolveFirst({ ok: false, error: 'NETWORK' }); });
    expect(textarea).toHaveValue('@박동료 다음 초안');
    const failedRow = screen.getByText('@이동료').closest('[data-message-row]') as HTMLElement;

    await user.click(within(failedRow).getByRole('button', { name: '다시 보내기' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '다시 보내기' }));
    expect(sendTeamMessageAction).toHaveBeenNthCalledWith(2, expect.objectContaining({
      body: `<@${MATE}> 첫 메모`, tempId,
    }));
    expect(textarea).toHaveValue('@박동료 다음 초안');
    await act(async () => {
      resolveRetry({ ok: true, messageId: 'tm-retried-mention', createdAt: '2026-10-08T05:00:00.000Z' });
    });
    expect(within(failedRow).queryByRole('button', { name: '다시 보내기' })).not.toBeInTheDocument();
    expect(textarea).toHaveValue('@박동료 다음 초안');

    await user.click(screen.getByRole('button', { name: '보내기' }));
    expect(sendTeamMessageAction).toHaveBeenNthCalledWith(3, expect.objectContaining({
      body: `<@${NEXT_MATE}> 다음 초안`,
    }));
  });

  it('수신된 멘션 메시지를 @이름 으로 강조 렌더한다', () => {
    render(
      base({
        teamMembers: mentionMembers,
        viewerUserId: ME,
        messages: [
          {
            id: 'tmM', authorUserId: MATE, authorName: '이동료',
            authorAvatarUpdatedAt: null,
            body: `<@${ME}> 봐주세요`, createdAt: '2026-06-10T05:00:00.000Z',
            isSelf: false, attachments: [],
          },
        ],
      }),
    );
    // 본인(ME) 멘션 → 강조 span.
    const el = screen.getByText('@김구매');
    expect(el).toHaveAttribute('data-self-mention', 'true');
  });
});
