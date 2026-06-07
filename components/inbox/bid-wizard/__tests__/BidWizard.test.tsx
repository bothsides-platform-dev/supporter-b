import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from '@/lib/http';
import { HTTPError } from 'ky';
import type { NormalizedOptions, ResponsePromise } from 'ky';
import type { PaymentMethod } from '@/lib/types/bid';

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

vi.mock('@/lib/http', () => ({ http: { post: vi.fn() } }));
vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('use http client')));

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

const submitBidMock = vi.fn(async (_i: unknown) => ({ ok: true as const, bidId: 'b1' }));
vi.mock('@/lib/server/actions/bid', () => ({
  submitBidAction: (i: unknown) => submitBidMock(i),
}));
vi.mock('@/lib/server/actions/quote-template/saveQuoteTemplateAction', () => ({
  saveQuoteTemplateAction: vi.fn(async () => ({ ok: true as const, templateId: 't1' })),
}));
vi.mock('../../RfpBriefPanel', () => ({ RfpBriefPanel: () => <div /> }));
vi.mock('@/components/messages/CounterpartyProfileCard', () => ({
  CounterpartyProfileCard: ({ counterparty }: { counterparty: { name: string } }) => (
    <span>{counterparty.name}</span>
  ),
}));

import { BidWizard } from '../BidWizard';
import type { QuoteTemplateOption } from '@/lib/types/bid';

const rfp = {
  id: 'rfp-uuid',
  code: 'P-2606-0001',
  requiredPaymentMethods: ['card'] as PaymentMethod[],
  customPaymentMethods: [],
} as never;

// 커스텀 결제수단 포함 RFP — customFees 분리 검증용
const rfpWithCustom = {
  id: 'rfp-uuid',
  code: 'P-2606-0001',
  requiredPaymentMethods: ['card'] as PaymentMethod[],
  customPaymentMethods: [{ id: 'c1', label: '포인트결제' }],
} as never;

// PercentInput 은 label↔input aria 연결이 없어 라벨 텍스트 컨테이너에서 input 을 찾는다.
function feeInput(labelText: string): HTMLInputElement {
  const label = screen.getByText(labelText);
  return label.closest('.space-y-1')!.querySelector('input[type="number"]') as HTMLInputElement;
}

const draftV2 = (fees: Record<string, string>, memo = '') => ({
  __v: 2, cycleUnit: 'D', cycleNum: '1', settleLimit: '0', guaranteeInsurance: '0', fees, memo,
});

beforeEach(() => {
  localStorage.clear();
  pushMock.mockClear();
  submitBidMock.mockClear();
});
afterEach(cleanup);

describe('BidWizard', () => {
  it('1단계 정산조건이 먼저 보인다 (수수료 입력칸은 2단계로 이동해야 보임)', () => {
    render(<BidWizard rfp={rfp} buyerName="토스" />);
    expect(screen.getByText('정산 주기 *')).toBeInTheDocument();
    expect(screen.queryByText(/카드 수수료/)).not.toBeInTheDocument();
  });

  it('단계 이동 후 입력 → 발송 → submitBidAction 호출 + /submitted 이동', async () => {
    const user = userEvent.setup();
    render(<BidWizard rfp={rfp} buyerName="토스" />);

    // step1: 정산주기
    await user.clear(screen.getByPlaceholderText('1'));
    await user.type(screen.getByPlaceholderText('1'), '1');
    await user.click(screen.getByRole('button', { name: '수수료' }));

    // step2: 카드 수수료
    await user.type(feeInput('카드 수수료'), '1.5');
    await user.click(screen.getByRole('button', { name: '견적서' }));

    // step3 → step4
    await user.click(screen.getByRole('button', { name: '검토·발송' }));

    // step4: 발송 → 확인 다이얼로그 → 확인
    await user.click(screen.getByRole('button', { name: '견적 보내기' }));
    await user.click(screen.getByRole('button', { name: '견적 보내기', hidden: false }));

    await waitFor(() => expect(submitBidMock).toHaveBeenCalledTimes(1));
    expect(submitBidMock.mock.calls[0][0]).toMatchObject({
      rfpId: 'rfp-uuid',
      settleCycle: 'D+1',
      paymentFees: { card: 0.015 },
    });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/inbox/P-2606-0001/submitted'));
  });
});

describe('BidWizard 드래프트 복원(1단계)', () => {
  it('드래프트 없으면 복원 배너 없음', () => {
    render(<BidWizard rfp={rfp} buyerName="토스" />);
    expect(screen.queryByText(/이전에 작성 중이던 내용/)).toBeNull();
  });

  it('드래프트 있으면 배너 표시 + 불러오기 시 값 반영', async () => {
    const user = userEvent.setup();
    localStorage.setItem('bid-draft:rfp-uuid', JSON.stringify(draftV2({ card: '0.40' }, '복원됨')));
    render(<BidWizard rfp={rfp} buyerName="토스" />);
    await user.click(screen.getByRole('button', { name: '불러오기' }));
    expect(screen.queryByText(/이전에 작성 중이던 내용/)).toBeNull();
    await user.click(screen.getByRole('button', { name: '수수료' }));
    expect(feeInput('카드 수수료').value).toBe('0.40');
  });

  it('무시 클릭 시 배너 사라지고 localStorage 제거', async () => {
    const user = userEvent.setup();
    localStorage.setItem('bid-draft:rfp-uuid', JSON.stringify(draftV2({ card: '0.50' })));
    render(<BidWizard rfp={rfp} buyerName="토스" />);
    await user.click(screen.getByRole('button', { name: '무시' }));
    expect(screen.queryByText(/이전에 작성 중이던 내용/)).toBeNull();
    expect(localStorage.getItem('bid-draft:rfp-uuid')).toBeNull();
  });
});

describe('BidWizard 413 업로드 오류(3단계)', () => {
  it('413 응답 시 파일 크기 오류 메시지', async () => {
    const user = userEvent.setup();
    render(<BidWizard rfp={rfp} buyerName="토스" />);
    // step1 → step2 → step3
    await user.click(screen.getByRole('button', { name: '수수료' }));
    await user.click(screen.getByRole('button', { name: '견적서' }));

    const error413 = new HTTPError(
      new Response('', { status: 413 }),
      new Request('http://localhost/api/files/upload'),
      {} as unknown as NormalizedOptions,
    );
    vi.mocked(http.post).mockReturnValue({
      json: vi.fn().mockRejectedValue(error413),
    } as unknown as ResponsePromise);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'big.pdf', { type: 'application/pdf' }));
    await waitFor(() => expect(screen.getByText(/파일이 너무 큽니다/)).toBeInTheDocument());
  });
});

describe('BidWizard 템플릿 적용(1단계)', () => {
  it('템플릿 선택 시 정산주기 + 요청 결제수단 요율 채움', async () => {
    const user = userEvent.setup();
    const tmpl: QuoteTemplateOption = {
      id: 't1', name: '표준', settleCycle: 'M+2', settleLimit: 0, guaranteeInsurance: 0,
      paymentFees: { card: 0.005 },
    };
    render(<BidWizard rfp={rfp} buyerName="토스" templates={[tmpl]} />);
    await user.selectOptions(screen.getByRole('option', { name: '표준' }).closest('select')!, 't1');
    expect((screen.getByPlaceholderText('1') as HTMLInputElement).value).toBe('2');
    await user.click(screen.getByRole('button', { name: '수수료' }));
    expect(feeInput('카드 수수료').value).toBe('0.5');
  });
});

describe('BidWizard 제출 — paymentFees / customFees 분리', () => {
  it('enum 요율은 paymentFees, 커스텀 요율은 customFees로 전송', async () => {
    const user = userEvent.setup();
    render(<BidWizard rfp={rfpWithCustom} buyerName="토스" />);
    await user.click(screen.getByRole('button', { name: '수수료' }));
    await user.type(feeInput('카드 수수료'), '1.0');
    await user.type(feeInput('포인트결제 수수료'), '2.0');
    await user.click(screen.getByRole('button', { name: '견적서' }));
    await user.click(screen.getByRole('button', { name: '검토·발송' }));
    await user.click(screen.getByRole('button', { name: '견적 보내기' }));
    await user.click(screen.getByRole('button', { name: '견적 보내기', hidden: false }));

    await waitFor(() => expect(submitBidMock).toHaveBeenCalledTimes(1));
    const arg = submitBidMock.mock.calls[0][0] as {
      paymentFees: Record<string, number>;
      customFees: Record<string, number>;
    };
    expect(arg.paymentFees).toEqual({ card: 0.01 });
    expect(arg.customFees).toEqual({ c1: 0.02 });
  });
});

describe('BidWizard confirm 취소', () => {
  it('확인 다이얼로그에서 취소하면 제출 안 함', async () => {
    const user = userEvent.setup();
    render(<BidWizard rfp={rfp} buyerName="토스" />);
    await user.click(screen.getByRole('button', { name: '수수료' }));
    await user.type(feeInput('카드 수수료'), '1.5');
    await user.click(screen.getByRole('button', { name: '견적서' }));
    await user.click(screen.getByRole('button', { name: '검토·발송' }));
    await user.click(screen.getByRole('button', { name: '견적 보내기' }));
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(submitBidMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
