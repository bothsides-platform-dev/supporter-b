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
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock, refresh: refreshMock }) }));

const submitBidMock = vi.fn(async (_i: unknown) => ({ ok: true as const, bidId: 'b1' }));
vi.mock('@/lib/server/actions/bid', () => ({
  submitBidAction: (i: unknown) => submitBidMock(i),
}));
// BidWizard 가 임포트하는 서버 액션 — 목킹하지 않으면 next-auth 가 jsdom 에서 로드 실패.
vi.mock('@/lib/server/actions/onboarding/simulateSampleAwardAction', () => ({
  simulateSampleAwardAction: vi.fn(async () => ({ ok: true as const })),
}));
vi.mock('@/lib/server/actions/quote-template/saveQuoteTemplateAction', () => ({
  saveQuoteTemplateAction: vi.fn(async () => ({ ok: true as const, templateId: 't1' })),
}));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));
vi.mock('../../RfpBriefPanel', () => ({ RfpBriefPanel: () => <div /> }));
vi.mock('@/components/messages/CounterpartyProfileCard', () => ({
  CounterpartyProfileCard: ({ counterparty }: { counterparty: { name: string } }) => (
    <span>{counterparty.name}</span>
  ),
}));

import { BidWizard } from '../BidWizard';
import { toast } from '@/lib/toast';
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
// (NumericFormat 으로 전환되어 type="number" 가 아니므로 컨테이너의 단일 input 을 집는다.)
function feeInput(labelText: string): HTMLInputElement {
  const label = screen.getByText(labelText);
  return label.closest('.space-y-1')!.querySelector('input') as HTMLInputElement;
}

const draftV3 = (fees: Record<string, string>, memo = '') => ({
  __v: 3, cycleUnit: 'D', cycleNum: '1', settleLimit: '0', guaranteeInsurance: '0', fees, memo,
});

beforeEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  pushMock.mockClear();
  refreshMock.mockClear();
  submitBidMock.mockClear();
  vi.mocked(toast).mockClear();
});
afterEach(cleanup);

describe('BidWizard', () => {
  it('1단계 정산조건이 먼저 보인다 (수수료 입력칸은 2단계로 이동해야 보임)', () => {
    render(<BidWizard rfp={rfp} buyerName="토스" />);
    expect(screen.getByText('정산 주기 *')).toBeInTheDocument();
    expect(screen.queryByText(/카드 수수료/)).not.toBeInTheDocument();
  });

  it('단계 이동 후 입력 → 발송 → submitBidAction 호출 + 인플레이스 갱신(refresh)', async () => {
    const user = userEvent.setup();
    render(<BidWizard rfp={rfp} buyerName="토스" />);

    // step1: 정산주기
    await user.clear(screen.getByPlaceholderText('1'));
    await user.type(screen.getByPlaceholderText('1'), '1');
    await user.click(screen.getByRole('button', { name: '수수료' }));

    // step2: 카드는 구간 수단 → general 셀 입력
    await user.type(screen.getByTestId('fee-cell-card-general'), '1.5');
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
      paymentFees: { card: { general: 0.015 } },
    });
    // 별도 /submitted 페이지로 push 하지 않고 같은 창에서 refresh — PgDealRoomBody 가
    // 제출 완료 상태를 인플레이스 렌더.
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(pushMock).not.toHaveBeenCalledWith('/inbox/P-2606-0001/submitted');
  });
});

describe('BidWizard 드래프트 자동 복원(1단계)', () => {
  it('드래프트 없으면 복원 토스트도 배너도 없다', () => {
    render(<BidWizard rfp={rfp} buyerName="토스" />);
    expect(toast).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '불러오기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '무시' })).toBeNull();
  });

  it('의미 있는 드래프트는 묻지 않고 자동 복원 + 토스트 1회', async () => {
    const user = userEvent.setup();
    localStorage.setItem('bid-draft:rfp-uuid', JSON.stringify(draftV3({ 'card:general': '0.40' }, '복원됨')));
    render(<BidWizard rfp={rfp} buyerName="토스" />);

    // 묻는 배너/버튼 없음
    expect(screen.queryByRole('button', { name: '불러오기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '무시' })).toBeNull();

    // 복원 토스트
    expect(toast).toHaveBeenCalledWith(
      '이전에 작성하던 내용을 그대로 불러왔어요',
      expect.objectContaining({ id: expect.stringContaining('bid-draft-restored') }),
    );

    // 폼이 이미 복원되어 있다
    await user.click(screen.getByRole('button', { name: '수수료' }));
    expect((screen.getByTestId('fee-cell-card-general') as HTMLInputElement).value).toBe('0.40');
  });

  it('빈(pristine) 드래프트는 복원/토스트하지 않는다', () => {
    localStorage.setItem('bid-draft:rfp-uuid', JSON.stringify(draftV3({})));
    render(<BidWizard rfp={rfp} buyerName="토스" />);
    expect(toast).not.toHaveBeenCalled();
  });

  it('초기화 → 처음부터 다시 → 폼이 비워진다', async () => {
    const user = userEvent.setup();
    localStorage.setItem('bid-draft:rfp-uuid', JSON.stringify(draftV3({ 'card:general': '0.40' })));
    render(<BidWizard rfp={rfp} buyerName="토스" />);

    await user.click(screen.getByRole('button', { name: '초기화' }));
    await user.click(screen.getByRole('button', { name: '처음부터 다시' }));

    await user.click(screen.getByRole('button', { name: '수수료' }));
    expect((screen.getByTestId('fee-cell-card-general') as HTMLInputElement).value).toBe('');
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
    // 카드는 구간 수단 — 구버전 단일요율(0.005) → 전 구간 동일값으로 전개
    await user.click(screen.getByRole('button', { name: '수수료' }));
    expect((screen.getByTestId('fee-cell-card-general') as HTMLInputElement).value).toBe('0.5');
    expect((screen.getByTestId('fee-cell-card-sole') as HTMLInputElement).value).toBe('0.5');
  });

  it('드래프트가 복원돼 있어도 템플릿 선택 시 템플릿 값으로 덮어쓴다', async () => {
    const user = userEvent.setup();
    localStorage.setItem('bid-draft:rfp-uuid', JSON.stringify(draftV3({ 'card:general': '0.40' })));
    const tmpl: QuoteTemplateOption = {
      id: 't1', name: '표준', settleCycle: 'M+2', settleLimit: 0, guaranteeInsurance: 0,
      paymentFees: { card: 0.005 },
    };
    render(<BidWizard rfp={rfp} buyerName="토스" templates={[tmpl]} />);

    await user.selectOptions(
      screen.getByRole('option', { name: '표준' }).closest('select')!,
      't1',
    );
    expect((screen.getByPlaceholderText('1') as HTMLInputElement).value).toBe('2');
    await user.click(screen.getByRole('button', { name: '수수료' }));
    expect((screen.getByTestId('fee-cell-card-general') as HTMLInputElement).value).toBe('0.5');
  });

  it('저장된 템플릿이 0개면 빈 상태 안내와 관리 링크를 보인다', () => {
    render(<BidWizard rfp={rfp} buyerName="토스" templates={[]} />);
    expect(screen.getByText(/저장된 견적 템플릿이 없어요/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: '템플릿 관리' });
    expect(link).toHaveAttribute('href', '/quote-templates');
  });

  it('템플릿 적용 시 토스트로 알린다', async () => {
    const user = userEvent.setup();
    const tmpl: QuoteTemplateOption = {
      id: 't1', name: '표준', settleCycle: 'M+2', settleLimit: 0, guaranteeInsurance: 0,
      paymentFees: { card: 0.005 },
    };
    render(<BidWizard rfp={rfp} buyerName="토스" templates={[tmpl]} />);
    await user.selectOptions(
      screen.getByRole('option', { name: '표준' }).closest('select')!,
      't1',
    );
    expect(toast).toHaveBeenCalledWith(`‘표준’ 템플릿을 불러왔어요`);
  });
});

describe('BidWizard 제출 — paymentFees / customFees 분리', () => {
  it('enum 요율은 paymentFees, 커스텀 요율은 customFees로 전송', async () => {
    const user = userEvent.setup();
    render(<BidWizard rfp={rfpWithCustom} buyerName="토스" />);
    await user.click(screen.getByRole('button', { name: '수수료' }));
    // 카드는 구간 수단 → general 셀 입력
    await user.type(screen.getByTestId('fee-cell-card-general'), '1.0');
    await user.type(feeInput('포인트결제 수수료'), '2.0');
    await user.click(screen.getByRole('button', { name: '견적서' }));
    await user.click(screen.getByRole('button', { name: '검토·발송' }));
    await user.click(screen.getByRole('button', { name: '견적 보내기' }));
    await user.click(screen.getByRole('button', { name: '견적 보내기', hidden: false }));

    await waitFor(() => expect(submitBidMock).toHaveBeenCalledTimes(1));
    const arg = submitBidMock.mock.calls[0][0] as {
      paymentFees: Record<string, unknown>;
      customFees: Record<string, number>;
    };
    expect(arg.paymentFees).toEqual({ card: { general: 0.01 } });
    expect(arg.customFees).toEqual({ c1: 0.02 });
  });
});

describe('BidWizard confirm 취소', () => {
  it('확인 다이얼로그에서 취소하면 제출 안 함', async () => {
    const user = userEvent.setup();
    render(<BidWizard rfp={rfp} buyerName="토스" />);
    await user.click(screen.getByRole('button', { name: '수수료' }));
    await user.type(screen.getByTestId('fee-cell-card-general'), '1.5');
    await user.click(screen.getByRole('button', { name: '견적서' }));
    await user.click(screen.getByRole('button', { name: '검토·발송' }));
    await user.click(screen.getByRole('button', { name: '견적 보내기' }));
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(submitBidMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe('BidWizard 구간 수수료 조립', () => {
  it('구간 셀을 채워 발송하면 paymentFees가 구간맵으로 조립된다', async () => {
    const user = userEvent.setup();
    const rfpTiered = {
      id: 'rfp-uuid',
      code: 'P-2606-0001',
      requiredPaymentMethods: ['card', 'virtual_account'] as PaymentMethod[],
      customPaymentMethods: [],
    } as never;
    render(<BidWizard rfp={rfpTiered} buyerName="토스" />);

    // step1: 정산주기
    await user.clear(screen.getByPlaceholderText('1'));
    await user.type(screen.getByPlaceholderText('1'), '1');
    await user.click(screen.getByRole('button', { name: '수수료' }));

    // step2: 카드 구간 셀(영세·일반) + 가상계좌 단일
    await user.type(screen.getByTestId('fee-cell-card-sole'), '0.5');
    await user.type(screen.getByTestId('fee-cell-card-general'), '1.8');
    await user.type(feeInput('가상계좌 수수료'), '0.3');
    await user.click(screen.getByRole('button', { name: '견적서' }));

    // step3 → step4
    await user.click(screen.getByRole('button', { name: '검토·발송' }));

    // step4: 발송 → 확인 다이얼로그 → 확인
    await user.click(screen.getByRole('button', { name: '견적 보내기' }));
    await user.click(screen.getByRole('button', { name: '견적 보내기', hidden: false }));

    await waitFor(() => expect(submitBidMock).toHaveBeenCalledTimes(1));
    const arg = submitBidMock.mock.calls[0][0] as {
      paymentFees: Record<string, unknown>;
    };
    expect(arg.paymentFees).toMatchObject({
      card: { sole: 0.005, general: expect.closeTo(0.018, 5) },
      virtual_account: 0.003,
    });
  });
});
