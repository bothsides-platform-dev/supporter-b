import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { QuoteTemplateOption } from '@/lib/types/bid';

const saveMock = vi.fn(async (_i: unknown) => ({ ok: true as const, templateId: 'new-id' }));
vi.mock('@/lib/server/actions/quote-template/saveQuoteTemplateAction', () => ({
  saveQuoteTemplateAction: (i: unknown) => saveMock(i),
}));

beforeEach(() => saveMock.mockClear());
afterEach(cleanup);

import { QuoteTemplateDrawer } from '../QuoteTemplateDrawer';

const onClose = vi.fn();
const onSaved = vi.fn();

const tieredTmpl: QuoteTemplateOption = {
  id: 't1',
  name: '구간 요율',
  settleCycle: 'D+1',
  settleLimit: 0,
  guaranteeInsurance: 0,
  signupFee: 0,
  paymentFees: {
    card: { sole: 0.008, sme1: 0.011, sme2: 0.0125, sme3: 0.015, general: 0.0195 },
  },
};

describe('QuoteTemplateDrawer', () => {
  it('open=false면 드로어가 렌더되지 않는다', () => {
    render(<QuoteTemplateDrawer open={false} onClose={onClose} onSaved={onSaved} template={null} />);
    expect(screen.queryByText('새 템플릿')).toBeNull();
  });

  it('open=true이고 template=null이면 "새 템플릿" 타이틀과 빈 폼을 보여준다', () => {
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={null} />);
    expect(screen.getByText('새 템플릿')).toBeInTheDocument();
    const nameInput = screen.getByPlaceholderText('템플릿 이름');
    expect((nameInput as HTMLInputElement).value).toBe('');
  });

  it('template이 있으면 "템플릿 편집" 타이틀로 폼에 기존 값을 채운다', () => {
    const t: QuoteTemplateOption = {
      id: 't2', name: '표준 요율', settleCycle: 'M+2',
      settleLimit: 1_000_000, guaranteeInsurance: 500_000,
      signupFee: 0,
      paymentFees: { overseas_card: 0.018 },
    };
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={t} />);
    expect(screen.getByText('템플릿 편집')).toBeInTheDocument();
    expect((screen.getByPlaceholderText('템플릿 이름') as HTMLInputElement).value).toBe('표준 요율');
  });

  it('TierRates 수단(카드)은 5개 구간 라벨을 보여준다', () => {
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={tieredTmpl} />);
    // 모든 tiered 수단이 같은 tier 라벨을 렌더하므로 getAllByText 사용
    expect(screen.getAllByText('영세').length).toBeGreaterThan(0);
    expect(screen.getAllByText('중소1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('일반').length).toBeGreaterThan(0);
  });

  it('가상계좌는 % 정률이 아니라 건당 정액(원) 입력으로 받는다', () => {
    const t: QuoteTemplateOption = {
      id: 'va', name: '가상계좌 요율', settleCycle: 'D+1',
      settleLimit: 0, guaranteeInsurance: 0,
      signupFee: 0,
      paymentFees: { virtual_account: 300 },
    };
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={t} />);
    // CurrencyInput: "가상계좌 건당 수수료" 라벨 + 원 정수 값 그대로 (× ÷100/×100)
    expect(screen.getByText('가상계좌 건당 수수료')).toBeInTheDocument();
    expect(screen.getByDisplayValue('300')).toBeInTheDocument();
  });

  it('TierRates 수단에 기존값이 채워진다', () => {
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={tieredTmpl} />);
    // sole → 0.008 → display 0.8 (%)
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    const soleInput = inputs.find((i) => i.value === '0.8');
    expect(soleInput).toBeTruthy();
  });

  it('이름 입력 후 저장 버튼 클릭 시 saveQuoteTemplateAction을 id 없이 호출한다', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={null} />);
    await user.type(screen.getByPlaceholderText('템플릿 이름'), '신규 요율');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    const call = saveMock.mock.calls[0][0] as { name: string; id?: string };
    expect(call.name).toBe('신규 요율');
    expect(call.id).toBeUndefined();
  });

  it('편집 시 저장 버튼 클릭 시 id를 포함해 saveQuoteTemplateAction을 호출한다', async () => {
    const user = userEvent.setup();
    const t: QuoteTemplateOption = {
      id: 'edit-id', name: '기존 요율', settleCycle: 'D+1',
      settleLimit: 0, guaranteeInsurance: 0, signupFee: 0, paymentFees: {},
    };
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={t} />);
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    const call = saveMock.mock.calls[0][0] as { id: string };
    expect(call.id).toBe('edit-id');
  });

  it('저장 성공 시 onSaved를 호출한다', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={null} />);
    await user.type(screen.getByPlaceholderText('템플릿 이름'), '테스트');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('취소 버튼 클릭 시 onClose를 호출한다', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={null} />);
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('정산주기 단위 선택에 D(일)·W(주)·M(개월) 옵션이 표시된다', () => {
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={null} />);
    expect(screen.getByRole('option', { name: 'D (일)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'W (주)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'M (개월)' })).toBeInTheDocument();
  });

  it('W 단위 선택 후 저장 시 W+N 형식으로 전달된다', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={null} />);
    await user.type(screen.getByPlaceholderText('템플릿 이름'), '테스트');
    await user.selectOptions(screen.getByRole('combobox'), 'W');
    await user.clear(screen.getByPlaceholderText('1'));
    await user.type(screen.getByPlaceholderText('1'), '2');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    const call = saveMock.mock.calls[0][0] as { settleCycle: string };
    expect(call.settleCycle).toBe('W+2');
  });

  it('기존 M+2 템플릿 로드 시 M 단위와 2가 표시된다', () => {
    const t: QuoteTemplateOption = {
      id: 't3', name: '월 주기', settleCycle: 'M+2',
      settleLimit: 0, guaranteeInsurance: 0, signupFee: 0, paymentFees: {},
    };
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={t} />);
    expect(screen.getByRole('combobox')).toHaveValue('M');
    expect(screen.getByPlaceholderText('1')).toHaveValue('2');
  });

  it('가입비 (원/최초 1회) 라벨의 금액 입력을 보여준다', () => {
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={null} />);
    expect(screen.getByText('가입비 (원/최초 1회)')).toBeInTheDocument();
  });

  it('기존 템플릿의 가입비가 입력에 프리필된다', () => {
    const t: QuoteTemplateOption = {
      id: 't4', name: '가입비 템플릿', settleCycle: 'D+1',
      settleLimit: 0, guaranteeInsurance: 0, signupFee: 120000, paymentFees: {},
    };
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={t} />);
    expect(screen.getByDisplayValue('120,000')).toBeInTheDocument();
  });

  it('저장 시 signupFee를 숫자로 전달한다', async () => {
    const user = userEvent.setup();
    const t: QuoteTemplateOption = {
      id: 't5', name: '가입비 저장 템플릿', settleCycle: 'D+1',
      settleLimit: 0, guaranteeInsurance: 0, signupFee: 120000, paymentFees: {},
    };
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={t} />);
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    const call = saveMock.mock.calls[0][0] as { signupFee: number };
    expect(call.signupFee).toBe(120000);
  });
});
