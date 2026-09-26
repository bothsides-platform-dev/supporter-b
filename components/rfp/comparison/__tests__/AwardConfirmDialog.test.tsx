import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const awardRfpAction = vi.fn();
vi.mock('@/lib/server/actions/rfp', () => ({
  awardRfpAction: (...a: unknown[]) => awardRfpAction(...a),
}));

import { AwardConfirmDialog } from '../AwardConfirmDialog';
import type { Bid } from '@/lib/types/bid';

const features = vi.hoisted(() => ({ LONG_TERM_AGREEMENTS_ENABLED: true }));
vi.mock('@/lib/features/long-term-agreements', () => features);

beforeEach(() => {
  awardRfpAction.mockReset();
  features.LONG_TERM_AGREEMENTS_ENABLED = true;
});
afterEach(cleanup);

function renderDialog(over: Partial<Parameters<typeof AwardConfirmDialog>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    rfpId: 'rfp-uuid-1',
    awardedBidId: 'bid-1',
    pgName: '토스페이먼츠',
    otherCount: 3,
    selectedBid: { paymentFees: { card: 0.022 }, settleCycle: 'D+1', settleLimit: 700_000_000, guaranteeInsurance: 1_000_000, signupFee: 0 } as Bid,
    buyerGrade: 'general' as const,
    onAwarded: vi.fn(),
    ...over,
  };
  render(<AwardConfirmDialog {...props} />);
  return props;
}

describe('AwardConfirmDialog', () => {
  it('warns that selecting an existing quote closes a pending revision request', () => {
    renderDialog({ pendingRequote: true });
    expect(screen.getByText(/수정 견적을 기다리지 않고 현재 견적을 선정해요/)).toBeInTheDocument();
  });
  it('확정 직전에 선택한 견적의 수수료와 정산 조건을 다시 보여준다', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('카드 수수료');
    expect(dialog).toHaveTextContent('2.20%');
    expect(dialog).toHaveTextContent('D+1');
    expect(dialog).toHaveTextContent('700,000,000원');
    expect(dialog).toHaveTextContent('가입비');
  });
  it('구매사 등급에 맞는 카드 요율만 확정 조건으로 보여준다', () => {
    renderDialog({
      buyerGrade: 'sme1',
      selectedBid: {
        paymentFees: { card: { general: 0.025, sme1: 0.013 } },
        settleCycle: 'D+1',
        settleLimit: 700_000_000,
        guaranteeInsurance: 1_000_000,
        signupFee: 0,
      } as Bid,
    });
    const conditions = screen.getByRole('region', { name: '선정할 견적의 핵심 조건' });
    expect(conditions).toHaveTextContent('1.30%');
    expect(conditions).not.toHaveTextContent('2.50%');
  });
  it('선택한 견적에 해당 등급의 카드 요율이 없으면 임의 수치를 표시하지 않는다', () => {
    renderDialog({ selectedBid: { paymentFees: {}, settleCycle: 'D+1', settleLimit: 0, guaranteeInsurance: 0, signupFee: 0 } as Bid });
    expect(screen.getByRole('region', { name: '선정할 견적의 핵심 조건' })).toHaveTextContent('견적에서 확인해요');
  });
  it('선정하기 전에 핵심 약정 조건과 실제 공통 문안을 확인할 수 있다', async () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('2년 약정');
    expect(dialog).toHaveTextContent('독점 이용');
    expect(dialog).toHaveTextContent('할인받은 수수료 반환');
    expect(dialog).toHaveTextContent('선정 후 PG사가 합의서를 준비하면');
    await userEvent.setup().click(screen.getByText('공통 합의서 문안 보기'));
    expect(screen.getByRole('heading', { name: '전자결제서비스 장기계약 부속합의서' })).toBeVisible();
    // 금액을 추정하지 않고 실제 고정 문안의 약정 시작점·적용 예외까지 보여준다.
    expect(screen.getByText(/원 계약의 효력 발생일과 본 합의서의 양측 서명 완료일 중 늦은 날부터 2년/)).toBeVisible();
    expect(screen.getByText(/PG사의 시스템 장애로 2시간 이상/)).toBeVisible();
    expect(awardRfpAction).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '선정할게요' })).toBeEnabled();
  });

  it('공통 장기합의서가 비활성화되면 그 약정 조건을 선정 조건처럼 안내하지 않는다', () => {
    features.LONG_TERM_AGREEMENTS_ENABLED = false;
    renderDialog();
    expect(screen.queryByText('공통 합의서 문안 보기')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).not.toHaveTextContent('2년 약정');
  });
  it('shows the selected PG name and the number of PGs that will be notified as not selected', () => {
    renderDialog();
    expect(screen.getByRole('heading', { name: /토스페이먼츠/ })).toBeInTheDocument();
    expect(screen.getByText(/미선정 PG 3곳/)).toBeInTheDocument();
  });

  it('awards the selected bid and notifies the parent on success', async () => {
    awardRfpAction.mockResolvedValue({ ok: true });
    const onAwarded = vi.fn();
    renderDialog({ onAwarded });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '선정할게요' }));

    expect(awardRfpAction).toHaveBeenCalledWith({
      rfpId: 'rfp-uuid-1',
      awardedBidId: 'bid-1',
    });
    await waitFor(() => expect(onAwarded).toHaveBeenCalled());
  });

  it('surfaces the error and does not notify the parent when the action fails', async () => {
    awardRfpAction.mockResolvedValue({ ok: false, error: '마감된 견적 요청' });
    const onAwarded = vi.fn();
    renderDialog({ onAwarded });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '선정할게요' }));

    expect(await screen.findByText(/마감된 견적 요청/)).toBeInTheDocument();
    expect(onAwarded).not.toHaveBeenCalled();
  });

  it('구회차 견적 선정 충돌이면 새로고침 후 최신 견적을 고르도록 안내한다', async () => {
    awardRfpAction.mockResolvedValue({ ok: false, error: 'WINNING_BID_OUTDATED' });
    renderDialog();
    await userEvent.setup().click(screen.getByRole('button', { name: '선정할게요' }));
    expect(await screen.findByText(/최신 견적이 도착했어요.*새로고침/)).toBeInTheDocument();
  });

  it('closes without awarding when cancelled', async () => {
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '닫기' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(awardRfpAction).not.toHaveBeenCalled();
  });
});
