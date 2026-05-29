import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

// base-ui Menu needs these in jsdom.
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

afterEach(() => cleanup());

import { MessageComposeButton } from '../MessageComposeButton';

const counterparty = { name: '(주)샘플테크', type: 'buyer' as const };
const rfpContext = { code: 'RFP-2026-001', title: '온라인몰 결제대행 선정' };

describe('MessageComposeButton', () => {
  it('opens the compose sheet with recipient + RFP context on click', async () => {
    const user = userEvent.setup();
    render(<MessageComposeButton counterparty={counterparty} rfpContext={rfpContext} />);

    await user.click(screen.getByRole('button', { name: '메시지 보내기' }));

    expect(screen.getByPlaceholderText('메시지를 입력하세요…')).toBeInTheDocument();
    expect(screen.getByText('RFP-2026-001', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '채팅보내기' })).toBeInTheDocument();
  });

  it('avatar variant: 아바타 클릭 → 채팅보내기 메뉴 → 컴포즈 Sheet', async () => {
    const user = userEvent.setup();
    render(<MessageComposeButton variant="avatar" counterparty={counterparty} rfpContext={rfpContext} />);

    // 진입점은 아바타(프로필) 버튼 — '메시지 보내기' 텍스트 버튼이 아니다.
    expect(screen.queryByRole('button', { name: '메시지 보내기' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '(주)샘플테크 프로필' }));
    const item = await screen.findByRole('menuitem', { name: '채팅보내기' });
    await user.click(item);

    expect(screen.getByPlaceholderText('메시지를 입력하세요…')).toBeInTheDocument();
  });

  it('shows the 구현중 modal when 채팅보내기 is clicked (no backend)', async () => {
    const user = userEvent.setup();
    render(<MessageComposeButton counterparty={counterparty} rfpContext={rfpContext} />);

    await user.click(screen.getByRole('button', { name: '메시지 보내기' }));
    await user.click(screen.getByRole('button', { name: '채팅보내기' }));

    expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument();
    expect(screen.getAllByText('구현중입니다').length).toBeGreaterThan(0);
  });
});
