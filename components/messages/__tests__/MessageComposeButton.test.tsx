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

// 통일된 진입 인터랙션: 프로필(아바타) 클릭 → '채팅보내기' 메뉴 → 컴포즈 Sheet.
async function openComposeSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '(주)샘플테크 프로필' }));
  await user.click(await screen.findByRole('menuitem', { name: '채팅보내기' }));
}

describe('MessageComposeButton', () => {
  it('프로필 클릭 → 채팅보내기 메뉴 → 컴포즈 Sheet(받는사람+RFP 컨텍스트)', async () => {
    const user = userEvent.setup();
    render(<MessageComposeButton counterparty={counterparty} rfpContext={rfpContext} />);

    // '메시지 보내기' 텍스트 버튼은 더 이상 진입점이 아니다(프로필 아바타로 통일).
    expect(screen.queryByRole('button', { name: '메시지 보내기' })).not.toBeInTheDocument();

    await openComposeSheet(user);

    expect(screen.getByPlaceholderText('메시지를 입력하세요…')).toBeInTheDocument();
    expect(screen.getByText('RFP-2026-001', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '채팅보내기' })).toBeInTheDocument();
  });

  it('profile variant(아바타+이름)도 동일하게 메뉴 → Sheet로 진입한다', async () => {
    const user = userEvent.setup();
    render(<MessageComposeButton variant="profile" counterparty={counterparty} rfpContext={rfpContext} />);
    await openComposeSheet(user);
    expect(screen.getByPlaceholderText('메시지를 입력하세요…')).toBeInTheDocument();
  });

  it('shows the 구현중 modal when 채팅보내기 is clicked (no backend)', async () => {
    const user = userEvent.setup();
    render(<MessageComposeButton counterparty={counterparty} rfpContext={rfpContext} />);

    await openComposeSheet(user);
    await user.click(screen.getByRole('button', { name: '채팅보내기' }));

    expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument();
    expect(screen.getAllByText('구현중입니다').length).toBeGreaterThan(0);
  });
});
