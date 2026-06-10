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
      paymentFees: { overseas_card: 0.018 },
    };
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={t} />);
    expect(screen.getByText('템플릿 편집')).toBeInTheDocument();
    expect((screen.getByPlaceholderText('템플릿 이름') as HTMLInputElement).value).toBe('표준 요율');
  });

  it('TierRates 수단(카드)은 5개 구간 라벨을 보여준다', () => {
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={tieredTmpl} />);
    expect(screen.getByText('영세')).toBeInTheDocument();
    expect(screen.getByText('중소1')).toBeInTheDocument();
    expect(screen.getByText('일반')).toBeInTheDocument();
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
      settleLimit: 0, guaranteeInsurance: 0, paymentFees: {},
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
});
