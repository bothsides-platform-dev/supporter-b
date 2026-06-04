// QuoteTemplatesPanel — PG 설정 화면의 견적 템플릿(요율표) 관리: 목록 + 생성/편집/삭제.
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { QuoteTemplateOption } from '@/components/inbox/BidForm';

const saveMock = vi.fn(async (_i: unknown) => ({ ok: true as const, templateId: 't-new' }));
const deleteMock = vi.fn(async (_i: unknown) => ({ ok: true as const }));
vi.mock('@/lib/server/actions/quote-template/saveQuoteTemplateAction', () => ({
  saveQuoteTemplateAction: (i: unknown) => saveMock(i),
}));
vi.mock('@/lib/server/actions/quote-template/deleteQuoteTemplateAction', () => ({
  deleteQuoteTemplateAction: (i: unknown) => deleteMock(i),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { QuoteTemplatesPanel } from '../QuoteTemplatesPanel';

beforeEach(() => {
  saveMock.mockClear();
  deleteMock.mockClear();
  refresh.mockClear();
});
afterEach(() => cleanup());

function feeInput(labelText: string): HTMLInputElement {
  const label = screen.getByText(labelText);
  return label.closest('.space-y-1')!.querySelector('input[type="number"]') as HTMLInputElement;
}

const tmpl = (over: Partial<QuoteTemplateOption> = {}): QuoteTemplateOption => ({
  id: 't1',
  name: '표준 요율',
  settleCycle: 'M+2',
  settleLimit: 1_000_000,
  guaranteeInsurance: 0,
  paymentFees: { card: 0.0125 },
  ...over,
});

describe('QuoteTemplatesPanel', () => {
  it('템플릿이 없으면 빈 상태 안내를 보여준다', () => {
    render(<QuoteTemplatesPanel initialTemplates={[]} />);
    expect(screen.getByText(/저장된 템플릿이 없어요/)).toBeInTheDocument();
  });

  it('템플릿 목록을 이름과 함께 렌더한다', () => {
    render(
      <QuoteTemplatesPanel
        initialTemplates={[tmpl({ id: 't1', name: '표준 요율' }), tmpl({ id: 't2', name: '공격적 요율' })]}
      />,
    );
    expect(screen.getByText('표준 요율')).toBeInTheDocument();
    expect(screen.getByText('공격적 요율')).toBeInTheDocument();
  });

  it('"새 템플릿" 후 이름·요율 입력·저장 시 id 없이 saveQuoteTemplateAction 호출', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplatesPanel initialTemplates={[]} />);

    await user.click(screen.getByRole('button', { name: '새 템플릿' }));
    await user.type(screen.getByPlaceholderText('템플릿 이름'), '기본 요율');
    await user.type(feeInput('카드 수수료'), '1.25');
    await user.click(screen.getByRole('button', { name: '템플릿 저장' }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledOnce());
    expect(saveMock.mock.calls[0][0]).toEqual({
      name: '기본 요율',
      settleCycle: 'D+1',
      settleLimit: 0,
      guaranteeInsurance: 0,
      paymentFees: { card: 0.0125 },
    });
  });

  it('기존 템플릿 편집 시 id를 포함해 현재 값으로 저장', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplatesPanel initialTemplates={[tmpl()]} />);

    await user.click(screen.getByRole('button', { name: '편집' }));
    const nameInput = screen.getByPlaceholderText('템플릿 이름');
    await user.clear(nameInput);
    await user.type(nameInput, '표준 요율 v2');
    await user.click(screen.getByRole('button', { name: '템플릿 저장' }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledOnce());
    expect(saveMock.mock.calls[0][0]).toEqual({
      id: 't1',
      name: '표준 요율 v2',
      settleCycle: 'M+2',
      settleLimit: 1_000_000,
      guaranteeInsurance: 0,
      paymentFees: { card: 0.0125 },
    });
  });

  it('삭제 확인 시 deleteQuoteTemplateAction 을 templateId 로 호출', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplatesPanel initialTemplates={[tmpl({ id: 't1' })]} />);

    await user.click(screen.getByRole('button', { name: '삭제' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '삭제할게요' }));

    await waitFor(() => expect(deleteMock).toHaveBeenCalledOnce());
    expect(deleteMock.mock.calls[0][0]).toEqual({ templateId: 't1' });
  });
});
