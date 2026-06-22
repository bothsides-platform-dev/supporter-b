import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// base-ui Popover needs these jsdom shims (mirrors CounterpartyProfileCard.test).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const getUserProfileAction = vi.fn();
vi.mock('@/lib/server/actions/user/getUserProfileAction', () => ({
  getUserProfileAction: (...args: unknown[]) => getUserProfileAction(...args),
}));

const presenceRef = { value: false };
vi.mock('@/components/presence/WorkspacePresenceProvider', () => ({
  useUserPresence: () => presenceRef.value,
}));

// MessageComposeSheet action deps (so the drawer can mount on click).
const sendChatMessageAction = vi.fn();
const listTemplatesAction = vi.fn();
const saveTemplateAction = vi.fn();
vi.mock('@/lib/server/actions/chat/sendChatMessageAction', () => ({
  sendChatMessageAction: (...a: unknown[]) => sendChatMessageAction(...a),
}));
vi.mock('@/lib/server/actions/chat/listTemplatesAction', () => ({
  listTemplatesAction: (...a: unknown[]) => listTemplatesAction(...a),
}));
vi.mock('@/lib/server/actions/chat/saveTemplateAction', () => ({
  saveTemplateAction: (...a: unknown[]) => saveTemplateAction(...a),
}));
vi.mock('@/lib/http', () => ({ http: { post: vi.fn() } }));

import { UserProfileCard } from '../UserProfileCard';

const TEAMMATE = {
  ok: true as const,
  profile: {
    userId: 'u-mate',
    name: '구매 동료',
    email: 'mate@buy.com',
    avatarUpdatedAt: null,
    relationship: 'teammate' as const,
    presenceWorkspaceId: 'ws-buyer',
  },
};

const COUNTERPARTY = {
  ok: true as const,
  profile: {
    userId: 'u-pg',
    name: '토스 영업',
    email: 'sales@toss.im',
    avatarUpdatedAt: null,
    relationship: 'counterparty' as const,
    presenceWorkspaceId: 'ws-pg',
    workspace: { id: 'ws-pg', name: '토스페이먼츠', type: 'pg' as const, logoUpdatedAt: null },
  },
};

afterEach(() => cleanup());
beforeEach(() => {
  presenceRef.value = false;
  getUserProfileAction.mockReset();
  sendChatMessageAction.mockReset().mockResolvedValue({ ok: true, conversationId: 'c1', messageId: 'm1' });
  listTemplatesAction.mockReset().mockResolvedValue({ ok: true, templates: [] });
  saveTemplateAction.mockReset().mockResolvedValue({ ok: true, templateId: 't1' });
});

describe('UserProfileCard', () => {
  it('아바타 클릭 시 액션을 호출하고 이름·이메일을 보여준다 (teammate: 메시지 버튼 없음)', async () => {
    getUserProfileAction.mockResolvedValue(TEAMMATE);
    const user = userEvent.setup();
    render(<UserProfileCard userId="u-mate" name="구매 동료" />);

    await user.click(screen.getByRole('button', { name: '구매 동료 프로필' }));

    expect(await screen.findByText('mate@buy.com')).toBeInTheDocument();
    expect(getUserProfileAction).toHaveBeenCalledWith('u-mate');
    expect(screen.queryByRole('button', { name: '메시지 보내기' })).not.toBeInTheDocument();
  });

  it('counterparty 면 메시지 보내기 버튼이 뜨고, 클릭 시 작성 드로어가 열린다', async () => {
    getUserProfileAction.mockResolvedValue(COUNTERPARTY);
    const user = userEvent.setup();
    render(<UserProfileCard userId="u-pg" name="토스 영업" />);

    await user.click(screen.getByRole('button', { name: '토스 영업 프로필' }));
    await user.click(await screen.findByRole('button', { name: '메시지 보내기' }));

    expect(
      await screen.findByPlaceholderText('상대에게 보낼 메시지를 입력하세요'),
    ).toBeInTheDocument();
  });

  it('관계가 없으면(ok:false) 이메일·메시지 없이 안내만 보여준다', async () => {
    getUserProfileAction.mockResolvedValue({ ok: false, error: 'NOT_AVAILABLE' });
    const user = userEvent.setup();
    render(<UserProfileCard userId="u-x" name="알 수 없음" />);

    await user.click(screen.getByRole('button', { name: '알 수 없음 프로필' }));

    expect(await screen.findByText('정보를 볼 수 없어요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '메시지 보내기' })).not.toBeInTheDocument();
  });

  it('로딩 중에는 LOADING… 자리표시를 보여준다 (응답 전 높이 점프 방지)', async () => {
    let resolve!: (v: unknown) => void;
    getUserProfileAction.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const user = userEvent.setup();
    render(<UserProfileCard userId="u-mate" name="구매 동료" />);

    await user.click(screen.getByRole('button', { name: '구매 동료 프로필' }));
    expect(await screen.findByText('LOADING…')).toBeInTheDocument();

    resolve(TEAMMATE);
    expect(await screen.findByText('mate@buy.com')).toBeInTheDocument();
  });

  it('성공 로드 후 닫았다 다시 열어도 재요청하지 않는다 (1회 캐시)', async () => {
    getUserProfileAction.mockResolvedValue(TEAMMATE);
    const user = userEvent.setup();
    render(<UserProfileCard userId="u-mate" name="구매 동료" />);
    const trigger = screen.getByRole('button', { name: '구매 동료 프로필' });

    await user.click(trigger);
    await screen.findByText('mate@buy.com');
    await user.keyboard('{Escape}'); // close
    await user.click(trigger); // reopen

    expect(getUserProfileAction).toHaveBeenCalledTimes(1);
  });

  it('일시 오류로 실패한 뒤 다시 열면 재요청한다 (영구 brick 방지)', async () => {
    getUserProfileAction
      .mockResolvedValueOnce({ ok: false, error: 'NOT_AVAILABLE' })
      .mockResolvedValueOnce(TEAMMATE);
    const user = userEvent.setup();
    render(<UserProfileCard userId="u-mate" name="구매 동료" />);
    const trigger = screen.getByRole('button', { name: '구매 동료 프로필' });

    await user.click(trigger);
    await screen.findByText('정보를 볼 수 없어요');
    await user.keyboard('{Escape}'); // close
    await user.click(trigger); // reopen → should retry

    expect(await screen.findByText('mate@buy.com')).toBeInTheDocument();
    expect(getUserProfileAction).toHaveBeenCalledTimes(2);
  });

  it('아바타 클릭이 상위 행 클릭으로 전파되지 않는다 (행 네비게이션 억제)', async () => {
    getUserProfileAction.mockResolvedValue(TEAMMATE);
    const rowClick = vi.fn();
    const user = userEvent.setup();
    render(
      <div onClick={rowClick}>
        <UserProfileCard userId="u-mate" name="구매 동료" />
      </div>,
    );

    await user.click(screen.getByRole('button', { name: '구매 동료 프로필' }));
    await screen.findByText('mate@buy.com');

    expect(rowClick).not.toHaveBeenCalled();
  });

  it('온라인이면 온라인 표시가 보인다', async () => {
    presenceRef.value = true;
    getUserProfileAction.mockResolvedValue(TEAMMATE);
    const user = userEvent.setup();
    render(<UserProfileCard userId="u-mate" name="구매 동료" />);

    await user.click(screen.getByRole('button', { name: '구매 동료 프로필' }));
    // wait for the profile to load, then the dot should be present
    await screen.findByText('mate@buy.com');
    expect(screen.getByLabelText('온라인')).toBeInTheDocument();
  });
});
