import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { QuoteTemplateOption } from '@/lib/types/bid';

type MockResult = { ok: true; templateId?: string } | { ok: false; error: string };
const deleteMock = vi.fn<(i: unknown) => Promise<MockResult>>();
const duplicateMock = vi.fn<(i: unknown) => Promise<MockResult>>();
vi.mock('@/lib/server/actions/quote-template/deleteQuoteTemplateAction', () => ({
  deleteQuoteTemplateAction: (i: unknown) => deleteMock(i),
}));
vi.mock('@/lib/server/actions/quote-template/duplicateQuoteTemplateAction', () => ({
  duplicateQuoteTemplateAction: (i: unknown) => duplicateMock(i),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (m: string, o?: unknown) => toastMock(m, o) }));

// QuoteTemplateDrawer is tested separately — just verify open/closed state
vi.mock('@/components/quote-templates/QuoteTemplateDrawer', () => ({
  QuoteTemplateDrawer: ({ open, template }: { open: boolean; template: QuoteTemplateOption | null }) =>
    open ? (
      <div data-testid="drawer-open">{template ? `편집:${template.name}` : '신규'}</div>
    ) : null,
}));

import { QuoteTemplateList } from '../QuoteTemplateList';

const tmpl = (over: Partial<QuoteTemplateOption> = {}): QuoteTemplateOption => ({
  id: 't1',
  name: '표준 요율',
  settleCycle: 'D+1',
  settleLimit: 5_000_000,
  guaranteeInsurance: 0,
  signupFee: 0,
  paymentFees: { card: 0.0125, virtual_account: 300 },
  ...over,
});

beforeEach(() => {
  deleteMock.mockClear();
  duplicateMock.mockClear();
  refresh.mockClear();
  toastMock.mockClear();
  deleteMock.mockResolvedValue({ ok: true as const });
  duplicateMock.mockResolvedValue({ ok: true as const, templateId: 'dup-id' });
});
afterEach(cleanup);

describe('QuoteTemplateList', () => {
  it('빈 목록이면 공유 EmptyState(제목·설명·CTA)를 보여준다', () => {
    render(<QuoteTemplateList initialTemplates={[]} />);
    expect(screen.getByText('아직 저장한 견적 템플릿이 없어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /새 템플릿 만들기/ })).toBeInTheDocument();
  });

  // 한 화면에 primary 액션 하나 — 목록이 비면 빈 상태가 CTA 를 소유한다.
  it('빈 목록이면 헤더 액션을 감춘다', () => {
    render(<QuoteTemplateList initialTemplates={[]} />);
    expect(screen.queryByTestId('page-header-action')).not.toBeInTheDocument();
  });

  // 빈 화면에 "0" 칩이 뜨면 바로 아래 "아직 …없어요" 와 같은 말을 두 번 하는 셈이다.
  it('빈 목록이면 개수 칩을 띄우지 않는다', () => {
    render(<QuoteTemplateList initialTemplates={[]} />);
    expect(screen.queryByTestId('page-header-count')).not.toBeInTheDocument();
  });

  it('목록이 있으면 헤더 액션을 보여준다', () => {
    render(<QuoteTemplateList initialTemplates={[tmpl()]} />);
    expect(screen.getByTestId('page-header-action')).toBeInTheDocument();
  });

  it('템플릿 이름·정산주기·한도를 목록에 표시한다', () => {
    render(<QuoteTemplateList initialTemplates={[tmpl()]} />);
    expect(screen.getByText('표준 요율')).toBeInTheDocument();
    expect(screen.getByText(/D\+1/)).toBeInTheDocument();
    expect(screen.getByText(/5,000,000/)).toBeInTheDocument();
  });

  it('단일요율 수단은 "카드 1.25%" chip으로 표시한다', () => {
    render(<QuoteTemplateList initialTemplates={[tmpl({ paymentFees: { card: 0.0125 } })]} />);
    expect(screen.getByText('카드 1.25%')).toBeInTheDocument();
  });

  it('정액(건당) 수단은 "가상계좌 건당 300원" chip으로 표시한다', () => {
    render(<QuoteTemplateList initialTemplates={[tmpl({ paymentFees: { virtual_account: 300 } })]} />);
    expect(screen.getByText('가상계좌 건당 300원')).toBeInTheDocument();
  });

  it('구간요율 수단은 "카드 구간별" chip으로 표시한다', () => {
    render(
      <QuoteTemplateList
        initialTemplates={[tmpl({ paymentFees: { card: { sole: 0.008, general: 0.0195 } } })]}
      />,
    );
    expect(screen.getByText('카드 구간별')).toBeInTheDocument();
  });

  it('chip이 4개를 초과하면 +N 표시', () => {
    render(
      <QuoteTemplateList
        initialTemplates={[
          tmpl({
            paymentFees: {
              card: 0.0125,
              overseas_card: 0.018,
              virtual_account: 300,
              bank_transfer: 0.004,
              naver_pay: 0.015,
            },
          }),
        ]}
      />,
    );
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('빈 상태 CTA 클릭 시 드로어가 신규 모드로 열린다', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplateList initialTemplates={[]} />);
    await user.click(screen.getByRole('button', { name: /새 템플릿 만들기/ }));
    expect(screen.getByTestId('drawer-open')).toHaveTextContent('신규');
  });

  it('헤더 "새 템플릿" 버튼 클릭 시 드로어가 신규 모드로 열린다', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplateList initialTemplates={[tmpl()]} />);
    await user.click(screen.getByRole('button', { name: '새 템플릿' }));
    expect(screen.getByTestId('drawer-open')).toHaveTextContent('신규');
  });

  it('"편집" 버튼 클릭 시 드로어가 해당 템플릿으로 열린다', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplateList initialTemplates={[tmpl()]} />);
    await user.click(screen.getByRole('button', { name: '편집' }));
    expect(screen.getByTestId('drawer-open')).toHaveTextContent('편집:표준 요율');
  });

  it('"복제" 버튼 클릭 시 duplicateQuoteTemplateAction 호출 후 router.refresh', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplateList initialTemplates={[tmpl({ id: 'abc' })]} />);
    await user.click(screen.getByRole('button', { name: '복제' }));
    await waitFor(() => expect(duplicateMock).toHaveBeenCalledWith({ templateId: 'abc' }));
    expect(refresh).toHaveBeenCalled();
  });

  it('"삭제" 버튼 → 확인 다이얼로그 → 삭제 확인 시 deleteQuoteTemplateAction 호출', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplateList initialTemplates={[tmpl({ id: 'del-id' })]} />);
    await user.click(screen.getByRole('button', { name: '삭제' }));
    const confirmBtn = await screen.findByRole('button', { name: /삭제할게요/ });
    await user.click(confirmBtn);
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith({ templateId: 'del-id' }));
    expect(refresh).toHaveBeenCalled();
  });

  it('템플릿 수를 헤더 카운트 칩으로 표시한다', () => {
    render(<QuoteTemplateList initialTemplates={[tmpl()]} />);
    expect(screen.getByTestId('page-header-count')).toHaveTextContent('1');
  });

  it('목록이 있으면 저장 상한을 안내한다', () => {
    render(<QuoteTemplateList initialTemplates={[tmpl()]} />);
    expect(screen.getByText(/최대 20개까지 저장할 수 있어요/)).toBeInTheDocument();
  });

  it('빈 목록에서는 상한 안내를 띄우지 않는다', () => {
    render(<QuoteTemplateList initialTemplates={[]} />);
    expect(screen.queryByText(/최대 20개까지 저장할 수 있어요/)).not.toBeInTheDocument();
  });

  // 이전에는 복제·삭제가 서버에서 실패해도 화면에 아무 일도 일어나지 않았다.
  it('복제가 실패하면 에러 토스트를 띄우고 새로고침하지 않는다', async () => {
    const user = userEvent.setup();
    duplicateMock.mockResolvedValue({ ok: false as const, error: 'LIMIT_REACHED' });
    render(<QuoteTemplateList initialTemplates={[tmpl({ id: 'abc' })]} />);
    await user.click(screen.getByRole('button', { name: '복제' }));
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith('템플릿은 최대 20개까지 저장할 수 있어요.', {
        type: 'error',
      }),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('삭제가 실패하면 에러 토스트를 띄운다', async () => {
    const user = userEvent.setup();
    deleteMock.mockResolvedValue({ ok: false as const, error: 'TEMPLATE_NOT_FOUND' });
    render(<QuoteTemplateList initialTemplates={[tmpl({ id: 'del-id' })]} />);
    await user.click(screen.getByRole('button', { name: '삭제' }));
    await user.click(await screen.findByRole('button', { name: /삭제할게요/ }));
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith('템플릿을 찾을 수 없어요.', { type: 'error' }),
    );
  });

  // 매핑에 **없는** 코드여야 폴백 분기가 실제로 실행된다 — 매핑에 있는 코드를 쓰면
  // 통과는 하지만 아무것도 증명하지 못한다.
  it('알 수 없는 에러 코드는 raw 로 노출하지 않는다', async () => {
    const user = userEvent.setup();
    duplicateMock.mockResolvedValue({ ok: false as const, error: 'SOME_CODE_WE_DO_NOT_MAP' });
    render(<QuoteTemplateList initialTemplates={[tmpl()]} />);
    await user.click(screen.getByRole('button', { name: '복제' }));
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(toastMock.mock.calls[0][0]).not.toContain('SOME_CODE_WE_DO_NOT_MAP');
    expect(toastMock.mock.calls[0][0]).toBe('템플릿을 복제하지 못했어요');
  });

  it('복제 성공 시 성공 토스트를 띄운다', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplateList initialTemplates={[tmpl()]} />);
    await user.click(screen.getByRole('button', { name: '복제' }));
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith('템플릿을 복제했어요', { type: 'success' }),
    );
  });

  it('삭제 성공 시 성공 토스트를 띄운다', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplateList initialTemplates={[tmpl()]} />);
    await user.click(screen.getByRole('button', { name: '삭제' }));
    await user.click(await screen.findByRole('button', { name: /삭제할게요/ }));
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith('템플릿을 삭제했어요', { type: 'success' }),
    );
  });
});
