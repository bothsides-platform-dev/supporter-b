import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InviteScene } from '../InviteScene';

afterEach(cleanup);

describe('InviteScene (pg 튜토리얼 — 초대 수신 연출)', () => {
  it('구매사명·제목·마감 정보와 안내 문구를 렌더한다', () => {
    render(
      <InviteScene
        buyerName="튜토리얼 쇼핑몰"
        rfpTitle="온라인 쇼핑몰 PG 견적 요청 (튜토리얼)"
        deadline="2026-07-21T00:00:00.000Z"
        onProceed={vi.fn()}
      />,
    );
    expect(screen.getByText('튜토리얼 쇼핑몰')).toBeInTheDocument();
    expect(screen.getByText('온라인 쇼핑몰 PG 견적 요청 (튜토리얼)')).toBeInTheDocument();
    expect(screen.getByText(/실제로는 이메일과 알림으로 초대를 받아요/)).toBeInTheDocument();
  });

  it('"요청 확인하기" 클릭 시 onProceed를 호출한다', async () => {
    const onProceed = vi.fn();
    const user = userEvent.setup();
    render(
      <InviteScene
        buyerName="튜토리얼 쇼핑몰"
        rfpTitle="온라인 쇼핑몰 PG 견적 요청 (튜토리얼)"
        deadline="2026-07-21T00:00:00.000Z"
        onProceed={onProceed}
      />,
    );
    await user.click(screen.getByRole('button', { name: '요청 확인하기' }));
    expect(onProceed).toHaveBeenCalledTimes(1);
  });

  it('CTA 버튼에 튜토리얼 코치마크 앵커가 있다', () => {
    render(
      <InviteScene
        buyerName="튜토리얼 쇼핑몰"
        rfpTitle="온라인 쇼핑몰 PG 견적 요청 (튜토리얼)"
        deadline="2026-07-21T00:00:00.000Z"
        onProceed={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '요청 확인하기' })).toHaveAttribute(
      'data-coachmark',
      'tutorial-invite-cta',
    );
  });
});
