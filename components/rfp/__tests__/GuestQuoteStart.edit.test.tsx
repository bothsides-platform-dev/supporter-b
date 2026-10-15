vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/guest-rfp/events', () => ({ sendGuestEvent: vi.fn() }));
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { GuestQuoteStart } from '../GuestQuoteStart';
import { GUEST_DRAFT_KEY, createGuestDraft, loadGuestDraft, saveGuestDraft } from '@/lib/guest-rfp/draft';
import { sendGuestEvent } from '@/lib/guest-rfp/events';

beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); localStorage.clear(); vi.clearAllMocks(); });
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
  expect(screen.getByRole('heading', { name: '현재 이용 중인 PG사는 어디인가요?' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'PG 회사명 직접 입력' }), { target: { value: 'External PG' } });
  fireEvent.click(screen.getByRole('button', { name: '추가해요' }));
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

it('keeps calculator values separate from the draft across answer edits and preserves auth return links', async () => {
  await finish();
  expect(screen.getByRole('heading', { name: 'PG 수수료, 얼마나 아낄 수 있을까요?' })).toHaveFocus();
  const before = localStorage.getItem(GUEST_DRAFT_KEY);
  expect(screen.getByLabelText('확정 절감 예상')).toHaveTextContent('1,000만 원');
  expect(screen.getByLabelText('확정 절감 예상')).toHaveTextContent('83만 3,333원');
  fireEvent.click(screen.getByRole('button', { name: '연간 카드 거래액 직접 입력' }));
  fireEvent.change(screen.getByRole('textbox', { name: '연간 카드 거래액' }), { target: { value: '500000000' } });
  expect(screen.getByRole('slider', { name: '연간 카드 거래액' })).toHaveAttribute('aria-valuenow', '500000000');
  expect(localStorage.getItem(GUEST_DRAFT_KEY)).toBe(before);
  fireEvent.click(screen.getByRole('button', { name: '홈페이지 수정' }));
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect(screen.getByRole('slider', { name: '연간 카드 거래액' })).toHaveAttribute('aria-valuenow', '500000000');
  expect(screen.getByRole('link', { name: '로그인하고 이어 쓸게요' })).toHaveAttribute('href', '/login?next=%2Frfp-create%3Fresume%3Dguest');
  expect(screen.getByRole('link', { name: '가입하고 이어 쓸게요' })).toHaveAttribute('href', '/signup/buyer?next=%2Frfp-create%3Fresume%3Dguest');
});
