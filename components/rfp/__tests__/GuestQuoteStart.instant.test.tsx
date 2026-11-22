import { guestReviewFetch } from './_guest-review-fixture';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/lib/guest-rfp/events', () => ({ sendGuestEvent: vi.fn() }));
vi.mock('@/lib/guest-rfp/journey-client', () => ({ guestJourney: { resume: vi.fn().mockResolvedValue(true) } }));
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { GuestQuoteStart } from '../GuestQuoteStart';
import { GUEST_DRAFT_KEY, createGuestDraft, saveGuestDraft } from '@/lib/guest-rfp/draft';
import { newQuoteContext } from '@/lib/guest-rfp/quote-context';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', guestReviewFetch());
  localStorage.clear();
  sessionStorage.clear();
});

function seed() {
  localStorage.removeItem(GUEST_DRAFT_KEY);
  const draft = createGuestDraft();
  Object.assign(draft.data, {
    contentQuestion: 'contract', websiteUrl: 'https://example.com', title: '견적', mainProducts: '가방', deliveryServicePeriod: 'D+3',
    industryMode: 'custom', customIndustryName: '의류', requiredPaymentMethods: ['card'],
    contractType: 'renewal', monthlyAvgPgVolume: '60000000', currentPgs: [{ pgWorkspaceId: null, name: '기존 PG' }],
    productInfo: { cashConvertible: false, maximumPrice: 'under_100k', salesMethods: ['none'] },
  });
  draft.quoteContext = { ...newQuoteContext(), stage: 'questions', bizNo: '1248100998', confirmedWebsite: 'https://example.com', confirmed: ['business-number', 'website'] };
  saveGuestDraft(draft);
}

it('접수가 열리면 홈페이지 다음에 사업자번호를 필수로 받는다', async () => {
  render(<GuestQuoteStart industryGroups={[]} instantOpen />);
  expect(await screen.findByRole('heading', { name: '어떤 홈페이지에서 판매하나요?' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('사업 운영 홈페이지'), { target: { value: 'example.com' } });
  fireEvent.click(screen.getByRole('button', { name: '직접 입력할게요' }));
  expect(await screen.findByRole('heading', { name: '사업자등록번호를 알려주세요' })).toBeInTheDocument();
  expect(screen.getByText('필수')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '지금은 건너뛸게요' })).not.toBeInTheDocument();
});

it('맞춤 상담으로 넘어간 뒤 새로고침해도 상담을 이어간다', async () => {
  seed();
  const first = render(<GuestQuoteStart industryGroups={[]} instantOpen />);
  fireEvent.click(await screen.findByRole('button', { name: '견적 조회하기' }));
  expect(await screen.findByRole('heading', { name: '어떤 계약을 준비하나요?' })).toBeInTheDocument();
  first.unmount();
  render(<GuestQuoteStart industryGroups={[]} instantOpen />);
  expect(await screen.findByRole('heading', { name: '어떤 계약을 준비하나요?' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '견적 조회하기' })).not.toBeInTheDocument();
});

it('상담 선택은 다른 초안에 남지 않는다', async () => {
  seed();
  const first = render(<GuestQuoteStart industryGroups={[]} instantOpen />);
  fireEvent.click(await screen.findByRole('button', { name: '견적 조회하기' }));
  first.unmount();
  seed();
  render(<GuestQuoteStart industryGroups={[]} instantOpen />);
  expect(await screen.findByRole('button', { name: '견적 조회하기' })).toBeInTheDocument();
});

it('접수가 닫혀 있으면 확인한 초안도 기존 질문으로 이어간다', async () => {
  seed();
  render(<GuestQuoteStart industryGroups={[]} />);
  expect(await screen.findByRole('heading', { name: '어떤 계약을 준비하나요?' })).toBeInTheDocument();
});
