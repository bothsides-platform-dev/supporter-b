import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { QuoteTemplateOption } from '@/lib/types/bid';

type MockResult = { ok: true; templateId?: string } | { ok: false; error: string };
const saveMock = vi.fn<(i: unknown) => Promise<MockResult>>();
vi.mock('@/lib/server/actions/quote-template/saveQuoteTemplateAction', () => ({
  saveQuoteTemplateAction: (i: unknown) => saveMock(i),
}));

const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (m: string, o?: unknown) => toastMock(m, o) }));

beforeEach(() => {
  saveMock.mockClear();
  toastMock.mockClear();
  saveMock.mockResolvedValue({ ok: true, templateId: 'new-id' });
});
afterEach(cleanup);

import { QuoteTemplateDrawer } from '../QuoteTemplateDrawer';

const onClose = vi.fn();
const onSaved = vi.fn();

// 정산한도는 0 초과라야 저장이 열린다(v0.4.27.0) — 빈 폼에서 출발하는 저장 경로
// 테스트는 이걸 먼저 채워야 한다. 값 자체는 각 테스트의 관심사가 아니다.
async function fillSettleLimit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('50,000,000'), '50000000');
}

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
  // 템플릿은 견적 폼의 프리필이라 정산한도 0 을 담을 수 있으면 위저드에서 막히는
  // 견적을 그대로 seed 하게 된다. 견적 쪽 게이트(isSettleLimitValid)와 같은 기준을
  // 저장 단계에서도 건다 — 프론트 전용, 서버 스키마는 그대로.
  it('정산한도가 비어 있으면 이름이 있어도 저장이 막힌다', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={null} />);
    await user.type(screen.getByPlaceholderText('템플릿 이름'), '기본 템플릿');
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  // 위저드는 제출을 시도해야 빨강이 뜨는데(BidStepSettlement 의 attempted 게이트)
  // 드로어는 같은 문구를 무조건 띄워, 새 템플릿을 열자마자 아무것도 안 한 칸이
  // 빨갛게 시작했다. 드로어의 저장 버튼은 disabled 라 '제출 시도'가 성립하지
  // 않으므로 attempted 대신 touched 로 맞춘다.
  it('새 템플릿을 열면 정산한도가 비어 있고 에러를 띄우지 않는다', () => {
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={null} />);
    expect((screen.getByPlaceholderText('50,000,000') as HTMLInputElement).value).toBe('');
    expect(screen.queryByText('정산한도를 입력해주세요')).not.toBeInTheDocument();
  });

  it('정산한도를 만졌다가 비우면 에러를 띄운다', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={null} />);
    const input = screen.getByPlaceholderText('50,000,000');
    await user.type(input, '5');
    await user.clear(input);
    expect(screen.getByText('정산한도를 입력해주세요')).toBeInTheDocument();
  });

  // 반대편 실패 모드: 만지기 전엔 숨긴다고 해서 0 이 든 기존 템플릿을 열었을 때
  // 저장이 잠긴 이유까지 숨기면 안 된다. 빈 값이 아닌 무효값은 즉시 짚는다.
  it('정산한도 0 인 기존 템플릿은 열자마자 저장이 막힌 이유를 보여준다', () => {
    render(
      <QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={tieredTmpl} />,
    );
    expect(screen.getByText('정산한도를 입력해주세요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('정산한도가 0 초과면 저장이 열린다', async () => {
    const user = userEvent.setup();
    render(
      <QuoteTemplateDrawer
        open={true}
        onClose={onClose}
        onSaved={onSaved}
        template={{ ...tieredTmpl, settleLimit: 50_000_000 }}
      />,
    );
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled();
    expect(screen.queryByText('정산한도를 입력해주세요')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
  });

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
    await fillSettleLimit(user);
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
      settleLimit: 50_000_000, guaranteeInsurance: 0, signupFee: 0, paymentFees: {},
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
    await fillSettleLimit(user);
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
    await fillSettleLimit(user);
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
      settleLimit: 50_000_000, guaranteeInsurance: 0, signupFee: 120000, paymentFees: {},
    };
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={t} />);
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    const call = saveMock.mock.calls[0][0] as { signupFee: number };
    expect(call.signupFee).toBe(120000);
  });

  // 저장 성공하면 드로어가 닫혀 인라인 확인이 사라진다 — 토스트가 유일한 피드백이다.
  it('저장에 성공하면 성공 토스트를 띄운다', async () => {
    const user = userEvent.setup();
    const t: QuoteTemplateOption = {
      id: 't6', name: '저장 템플릿', settleCycle: 'D+1',
      settleLimit: 50_000_000, guaranteeInsurance: 0, signupFee: 0, paymentFees: {},
    };
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={t} />);
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith('템플릿을 저장했어요', { type: 'success' }),
    );
  });

  it('서버 에러 문구를 해요체로 보여준다', async () => {
    const user = userEvent.setup();
    saveMock.mockResolvedValue({ ok: false, error: 'FORBIDDEN' });
    const t: QuoteTemplateOption = {
      id: 't7', name: '권한 없는 템플릿', settleCycle: 'D+1',
      settleLimit: 50_000_000, guaranteeInsurance: 0, signupFee: 0, paymentFees: {},
    };
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={t} />);
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('권한이 없어요.')).toBeInTheDocument();
  });

  // 손수 만든 fixed 패널이라 role/aria-modal 만 붙어 있고 실제 모달 동작이 없었다.
  it('Esc 를 누르면 닫힌다', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={null} />);
    onClose.mockClear();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  // 한국어 UI 이므로 스크린리더에 읽히는 이름도 한국어여야 한다.
  it('닫기 버튼을 한국어 이름으로 노출한다', () => {
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={null} />);
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument();
  });

  it('제목으로 다이얼로그 이름이 붙는다', () => {
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={null} />);
    expect(screen.getByRole('dialog', { name: '새 템플릿' })).toBeInTheDocument();
  });

  // 라벨이 htmlFor 없는 <span> 이라 입력에 접근 가능한 이름이 없었다.
  it('템플릿 이름 입력에 접근 가능한 이름이 있다', () => {
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={null} />);
    expect(screen.getByLabelText(/템플릿 이름/)).toBeInTheDocument();
  });

  it('알 수 없는 에러 코드를 raw 로 노출하지 않는다', async () => {
    const user = userEvent.setup();
    saveMock.mockResolvedValue({ ok: false, error: 'SOME_CODE_WE_DO_NOT_MAP' });
    const t: QuoteTemplateOption = {
      id: 't8', name: '알 수 없는 오류', settleCycle: 'D+1',
      settleLimit: 50_000_000, guaranteeInsurance: 0, signupFee: 0, paymentFees: {},
    };
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={t} />);
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    expect(screen.queryByText(/SOME_CODE_WE_DO_NOT_MAP/)).not.toBeInTheDocument();
    expect(await screen.findByText('템플릿을 저장하지 못했어요')).toBeInTheDocument();
  });
});
