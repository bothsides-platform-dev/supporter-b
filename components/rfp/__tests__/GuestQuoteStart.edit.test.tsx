vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/guest-rfp/events', () => ({ sendGuestEvent: vi.fn() }));
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { GuestQuoteStart } from '../GuestQuoteStart';
import { GUEST_DRAFT_KEY, createGuestDraft, loadGuestDraft, saveGuestDraft } from '@/lib/guest-rfp/draft';
import { sendGuestEvent } from '@/lib/guest-rfp/events';

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
async function finish() {
  const draft = createGuestDraft();
  Object.assign(draft.data, {
    contentQuestion: 'attachments', websiteUrl: 'https://example.com', title: '제목', mainProducts: '상품',
    industryMode: 'custom', customIndustryName: '방문 돌봄', contractType: 'new', requiredPaymentMethods: ['card'],
    productInfo: { cashConvertible: false, maximumPrice: 'under_100k', salesMethods: ['none'] },
  });
  saveGuestDraft(draft);
  render(<GuestQuoteStart industryGroups={[]} />);
  fireEvent.click(await screen.findByRole('button', { name: '작성 마치기' }));
  await screen.findByRole('heading', { name: '작성 내용을 보관했어요' });
}
it('edits a single answer in isolation, cancels without saving, then returns to the summary after commit', async () => {
  await finish();
  expect(screen.getByText('https://example.com')).toBeInTheDocument();
  expect(screen.getByText('방문 돌봄')).toBeInTheDocument();
  const term = screen.getByText('홈페이지');
  expect(term.parentElement?.parentElement?.tagName).toBe('DL');
  expect(term.nextElementSibling?.tagName).toBe('DD');
  fireEvent.click(screen.getByRole('button', { name: '홈페이지 수정' }));
  fireEvent.change(screen.getByLabelText('사업 운영 홈페이지'), { target: { value: 'changed.com' } });
  expect(loadGuestDraft()?.data.websiteUrl).toBe('https://example.com');
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect(screen.getByText('https://example.com')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '홈페이지 수정' }));
  fireEvent.change(screen.getByLabelText('사업 운영 홈페이지'), { target: { value: 'changed.com' } });
  fireEvent.click(screen.getByRole('button', { name: '수정 완료' }));
  expect(await screen.findByText('https://changed.com')).toBeInTheDocument();
  expect(loadGuestDraft()?.data.websiteUrl).toBe('https://changed.com');
  expect(loadGuestDraft()?.data.contentQuestion).toBe('attachments');
  expect(vi.mocked(sendGuestEvent).mock.calls.filter(call => call[1] === 'completed')).toHaveLength(1);
});
it('requires missing renewal answers in the temporary store before committing a contract change', async () => {
  await finish();
  fireEvent.click(screen.getByRole('button', { name: '계약 유형 수정' }));
  fireEvent.click(screen.getByRole('button', { name: '갱신 계약' }));
  fireEvent.click(screen.getByRole('button', { name: '수정 완료' }));
  expect(screen.getByRole('heading', { name: '전년도 PG 거래액은 얼마인가요?' })).toBeInTheDocument();
  expect(loadGuestDraft()?.data.contractType).toBe('new');
  fireEvent.change(screen.getByRole('textbox', { name: '전년도 연간 PG 총 거래액' }), { target: { value: '1,000,000,000' } });
  fireEvent.click(screen.getByRole('button', { name: '수정 완료' }));
  await screen.findByRole('heading', { name: '작성 내용을 보관했어요' });
  expect(loadGuestDraft()?.data.contractType).toBe('renewal');
  expect(loadGuestDraft()?.data.annualPgVolume).toBe('1000000000');
});
it('keeps unsaved edit values and the original draft when durable saving fails, and retries the edit', async () => {
  await finish();
  fireEvent.click(screen.getByRole('button', { name: '업종 수정' }));
  fireEvent.change(screen.getByRole('textbox', { name: '업종 이름' }), { target: { value: '반려동물 돌봄' } });
  const original = Storage.prototype.setItem;
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === GUEST_DRAFT_KEY) throw new DOMException('quota', 'QuotaExceededError');
    return original.call(this, key, value);
  });
  fireEvent.click(screen.getByRole('button', { name: '수정 완료' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('저장'));
  expect(screen.getByRole('textbox', { name: '업종 이름' })).toHaveValue('반려동물 돌봄');
  expect(loadGuestDraft()?.data.customIndustryName).toBe('방문 돌봄');
  spy.mockRestore();
  fireEvent.click(screen.getByRole('button', { name: '다시 저장해요' }));
  expect(await screen.findByText('반려동물 돌봄')).toBeInTheDocument();
  expect(loadGuestDraft()?.data.customIndustryName).toBe('반려동물 돌봄');
});
