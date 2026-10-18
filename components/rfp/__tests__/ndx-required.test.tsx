import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RfpQuestionFlow } from '../RfpQuestionFlow';
import { getFirstIncompleteStep } from '../wizard-validation';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

vi.mock('../RfpAttachmentDropzone', () => ({ RfpAttachmentDropzone: () => null }));
beforeEach(() => useRfpDraftStore.getState().reset());

it.each(['default', 'public'] as const)('%s 작성에서 NDX 미입력을 막고 0일 입력 뒤 진행한다', async (presentation) => {
  useRfpDraftStore.setState({ contentQuestion: 'delivery' });
  const user = userEvent.setup();
  render(<RfpQuestionFlow presentation={presentation} onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
  expect(screen.queryByRole('button', { name: '지금은 건너뛰어요' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '다음' }));
  expect(useRfpDraftStore.getState().contentQuestion).toBe('delivery');
  const input = screen.getByRole('textbox', { name: '배송 및 서비스 기간' });
  expect(input).toHaveFocus();
  expect(input).toHaveAccessibleDescription('배송 및 서비스 기간을 입력해요');
  await user.type(input, '0{Enter}');
  expect(useRfpDraftStore.getState().deliveryServicePeriod).toBe('D+0');
  expect(useRfpDraftStore.getState().contentQuestion).toBe('contract');
});

it('최종 확인에서도 NDX가 없는 초안을 견적 내용 단계로 돌린다', () => {
  useRfpDraftStore.setState({ title: '견적', websiteUrl: 'https://example.com', contractType: 'new', mainProducts: '의류', requiredPaymentMethods: ['card'], allowedPgWorkspaceIds: [{id:'pg',displayName:'PG',logoUpdatedAt:null}], deadline:'2026-11-01T00:00:00Z' });
  expect(getFirstIncompleteStep(useRfpDraftStore.getState())).toMatchObject({ num: 2, hint: '배송 및 서비스 기간을 입력해요' });
});
