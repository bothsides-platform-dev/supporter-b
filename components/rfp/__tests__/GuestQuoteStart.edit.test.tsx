import { guestReviewFetch } from './_guest-review-fixture';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/guest-rfp/events', () => ({ sendGuestEvent: vi.fn() }));
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { GuestQuoteStart } from '../GuestQuoteStart';
import { GUEST_DRAFT_KEY, createGuestDraft, loadGuestDraft, saveGuestDraft } from '@/lib/guest-rfp/draft';
import { sendGuestEvent } from '@/lib/guest-rfp/events';
import { newQuoteContext } from '@/lib/guest-rfp/quote-context';

beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); localStorage.clear(); vi.clearAllMocks(); vi.stubGlobal('fetch', guestReviewFetch()); });
it('홈페이지 수정은 해당 출처의 확인값을 무효화하며 무관한 편집을 사용자 수정으로 표시하지 않는다', async () => {
  const draft = createGuestDraft();
  Object.assign(draft.data, {
    contentQuestion: 'attachments', websiteUrl: 'https://example.com', title: '견적', mainProducts: '자동 상품', deliveryServicePeriod: 'D+3',
    industryMode: 'custom', customIndustryName: '의류', contractType: 'new', requiredPaymentMethods: ['card'],
    productInfo: { cashConvertible: false, maximumPrice: 'under_100k', salesMethods: ['none'] },
  });
  draft.quoteContext = { ...newQuoteContext(), stage: 'complete', confirmed: ['website', 'products'],
    websiteResult: { status: 'partial', needsConfirmation: ['mainProducts'], suggestions: [{ field: 'mainProducts', value: '자동 상품', evidence: '자동 상품', source: 'rules', sourceUrl: 'https://example.com' }] } };
  saveGuestDraft(draft);
  render(<GuestQuoteStart industryGroups={[]} />);
  fireEvent.click(await screen.findByRole('button', { name: '계약 유형 수정' }));
  fireEvent.click(screen.getByRole('button', { name: '수정 완료' }));
  fireEvent.click(await screen.findByRole('button', { name: '홈페이지 수정' }));
  fireEvent.change(screen.getByLabelText('사업 운영 홈페이지'), { target: { value: 'other.example.com' } });
  expect(loadGuestDraft()?.data.mainProducts).toBe('');
  expect(loadGuestDraft()?.quoteContext?.confirmed).not.toContain('products');
});
async function finish() {
  const draft = createGuestDraft();
  Object.assign(draft.data, {
    contentQuestion: 'attachments', websiteUrl: 'https://example.com', title: '제목', mainProducts: '상품', deliveryServicePeriod: 'D+3',
    industryMode: 'custom', customIndustryName: '방문 돌봄', contractType: 'new', requiredPaymentMethods: ['card'],
    productInfo: { cashConvertible: false, maximumPrice: 'under_100k', salesMethods: ['none'] },
  });
  saveGuestDraft(draft);
  render(<GuestQuoteStart industryGroups={[]} />);
  fireEvent.click(await screen.findByRole('button', { name: '작성 마치기' }));
  await screen.findByRole('radio', { name: /Alpha/ });
  fireEvent.click(screen.getByText('요청 내용 전체 보기'));
}
it('edits a single answer in isolation, cancels without saving, then returns to the summary after commit', async () => {
  await finish();
  expect(screen.getByText('https://example.com')).toBeInTheDocument();
  expect(screen.getAllByText('방문 돌봄')[0]).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '홈페이지 수정' }));
  fireEvent.change(screen.getByLabelText('사업 운영 홈페이지'), { target: { value: 'changed.com' } });
  expect(loadGuestDraft()?.data.websiteUrl).toBe('https://example.com');
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  await screen.findByRole('radio', { name: /Alpha/ });
  fireEvent.click(screen.getByText('요청 내용 전체 보기'));
  expect(screen.getByText('https://example.com')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '홈페이지 수정' }));
  fireEvent.change(screen.getByLabelText('사업 운영 홈페이지'), { target: { value: 'changed.com' } });
  fireEvent.click(screen.getByRole('button', { name: '수정 완료' }));
  await screen.findByRole('radio', { name: /Alpha/ });
  fireEvent.click(screen.getByText('요청 내용 전체 보기'));
  expect(screen.getByText('https://changed.com')).toBeInTheDocument();
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
  expect(screen.getByRole('heading', { name: '전년도 월 평균 PG 거래액은 얼마인가요?' })).toBeInTheDocument();
  expect(loadGuestDraft()?.data.contractType).toBe('new');
  fireEvent.change(screen.getByRole('textbox', { name: '전년도 월 평균 PG 거래액' }), { target: { value: '1,000,000,000' } });
  fireEvent.click(screen.getByRole('button', { name: '수정 완료' }));
  await screen.findByRole('radio', { name: /Alpha/ });
  fireEvent.click(screen.getByText('요청 내용 전체 보기'));
  expect(loadGuestDraft()?.data.contractType).toBe('renewal');
  expect(loadGuestDraft()?.data.monthlyAvgPgVolume).toBe('1000000000');
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
  expect((await screen.findAllByText('반려동물 돌봄'))[0]).toBeInTheDocument();
  expect(loadGuestDraft()?.data.customIndustryName).toBe('반려동물 돌봄');
});

it('keeps legacy calculation data without exposing the calculator', async () => {
  await finish();
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('예상 연간 카드 거래액')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('예상 연매출 구간'), { target: { value: '500000000' } });
  await waitFor(() => expect(loadGuestDraft()?.quoteContext?.savings?.annualRevenue).toBe(500000000));
  await waitFor(() => expect(screen.getByRole('button', { name: '홈페이지 수정' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '홈페이지 수정' }));
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect(await screen.findByLabelText('예상 연매출 구간')).toHaveValue('500000000');
});
