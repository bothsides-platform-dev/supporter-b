import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { QuoteTemplateOption } from '@/lib/types/bid';

const deleteMock = vi.fn(async () => ({ ok: true as const }));
const duplicateMock = vi.fn(async () => ({ ok: true as const, templateId: 'dup-id' }));
vi.mock('@/lib/server/actions/quote-template/deleteQuoteTemplateAction', () => ({
  deleteQuoteTemplateAction: (i: unknown) => deleteMock(i),
}));
vi.mock('@/lib/server/actions/quote-template/duplicateQuoteTemplateAction', () => ({
  duplicateQuoteTemplateAction: (i: unknown) => duplicateMock(i),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

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
  paymentFees: { card: 0.0125, virtual_account: 0.005 },
  ...over,
});

beforeEach(() => { deleteMock.mockClear(); duplicateMock.mockClear(); refresh.mockClear(); });
afterEach(cleanup);

describe('QuoteTemplateList', () => {
  it('빈 목록이면 빈 상태 안내를 보여준다', () => {
    render(<QuoteTemplateList initialTemplates={[]} workspaceName="테스트" />);
    expect(screen.getByText(/저장된 템플릿이 없어요/)).toBeInTheDocument();
  });

  it('템플릿 이름·정산주기·한도를 목록에 표시한다', () => {
    render(<QuoteTemplateList initialTemplates={[tmpl()]} workspaceName="테스트" />);
    expect(screen.getByText('표준 요율')).toBeInTheDocument();
    expect(screen.getByText(/D\+1/)).toBeInTheDocument();
    expect(screen.getByText(/5,000,000/)).toBeInTheDocument();
  });

  it('단일요율 수단은 "카드 1.25%" chip으로 표시한다', () => {
    render(<QuoteTemplateList initialTemplates={[tmpl({ paymentFees: { card: 0.0125 } })]} />);
    expect(screen.getByText('카드 1.25%')).toBeInTheDocument();
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
              virtual_account: 0.005,
              bank_transfer: 0.004,
              naver_pay: 0.015,
            },
          }),
        ]}
      />,
    );
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('"새 템플릿" 버튼 클릭 시 드로어가 신규 모드로 열린다', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplateList initialTemplates={[]} />);
    await user.click(screen.getByRole('button', { name: /새 템플릿/ }));
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

  it('템플릿 수를 "N / 20개"로 표시한다', () => {
    render(<QuoteTemplateList initialTemplates={[tmpl()]} />);
    expect(screen.getByText('1 / 20개')).toBeInTheDocument();
  });
});
