import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, it, expect, vi } from 'vitest';
import { GuestRequestFlow } from '../GuestRequestFlow';
import { GuestMatchingReview } from '../GuestMatchingReview';
import { GuestQuoteController } from '@/lib/guest-rfp/quote-controller';
import { GuestSession } from '../useGuestDraft';
import { createGuestDraft } from '@/lib/guest-rfp/draft';
import type { GuestRecommendation } from '@/lib/guest-rfp/requests-client';
const mocks = vi.hoisted(() => ({ request: vi.fn(), save: vi.fn(), signup: vi.fn(), push: vi.fn(), isLg: true }));
vi.mock('@/lib/hooks/useIsLgUp', () => ({ useIsLgUp: () => mocks.isLg }));
vi.mock('../RfpMatchingSelection', async original => ({ ...await original<object>(), MIN_MATCHING_LOADING_MS: 0 }));
vi.mock('@/lib/guest-rfp/server-client', async original => ({ ...await original<object>(), saveGuestProgress: mocks.save, saveGuestForSignup: mocks.signup }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/guest-rfp/requests-client', () => ({ guestRequest: mocks.request }));
let result: GuestRecommendation;
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); mocks.isLg = true;
  result = { revision: 2, tierBasis: 'unknown', annualRevenue: null, files: [], attachmentCount: 0,
    answers: { title: '의류 판매 견적', websiteUrl: 'https://shop.example', mainProducts: '의류', contractType: 'new', requiredPaymentMethods: ['card'] },
    recommendation: { risk: 'white', industryName: '의류', candidates: [{ pgWorkspaceId: 'pg', name: 'Alpha', reason: '의류 업종 상담', merchantTier: null, feeRate: null, feeNote: '카드 결제 기준' }] } };
  mocks.request.mockImplementation(async input => input.op === 'recommend' ? structuredClone(result) : input.op === 'account' ? { signedIn: false, workspaces: [] } : null);
  mocks.save.mockResolvedValue({ revision: 2 }); mocks.signup.mockResolvedValue(undefined);
});
const radio = () => screen.getByRole('radio', { name: /Alpha/ });
const submit = () => screen.getByRole('button', { name: '선택한 PG사에 자동 요청하기' });
const quote = () => new GuestQuoteController(new GuestSession(createGuestDraft(), () => {}));
it('shares cards and collapsed summary, requires explicit selection and only saves originals on confirmation', async () => {
  render(<GuestRequestFlow id="draft" revision={1} onCancel={() => {}} quote={quote()} />);
  await screen.findByRole('radio', { name: /Alpha/ });
  expect(mocks.save).toHaveBeenCalledTimes(1); expect(mocks.signup).not.toHaveBeenCalled();
  expect(mocks.request).not.toHaveBeenCalledWith(expect.objectContaining({ op: 'reserve' }));
  expect(submit()).toBeDisabled();
  expect(screen.getAllByText('의류 판매 견적', { selector: 'span' })[0]).toBeVisible();
  expect(screen.getByText('https://shop.example')).not.toBeVisible();
  fireEvent.click(screen.getByText('요청 내용 전체 보기'));
  expect(screen.getByText('https://shop.example')).toBeVisible();
  expect(screen.queryByLabelText('예상 연간 카드 거래액')).not.toBeInTheDocument();
  fireEvent.click(radio());
  expect(submit()).toBeEnabled();
  fireEvent.click(submit());
  await waitFor(() => expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ op: 'reserve', revision: 2, pgId: 'pg', days: 5 })));
  expect(mocks.signup).toHaveBeenCalledTimes(1);
});
it('shows one pane at a time on mobile and shares back, scroll and focus rules', async () => {
  mocks.isLg = false; const back = vi.fn();
  render(<GuestRequestFlow id="draft" revision={1} onCancel={back} />);
  await screen.findByRole('radio', { name: /Alpha/ });
  expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
  expect(screen.queryByRole('heading', { name: '응답 기간' })).not.toBeInTheDocument();
  fireEvent.click(radio()); fireEvent.click(screen.getByRole('button', { name: '다음' }));
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '응답 기간' }).parentElement?.parentElement?.parentElement).toHaveFocus();
  fireEvent.keyDown(submit(), { key: 'Enter', shiftKey: true });
  expect(radio()).toBeChecked(); expect(back).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '이전' })); expect(back).toHaveBeenCalledOnce();
});
it('updates revenue without replaying the introductory loading and preserves valid selection', async () => {
  const controller = quote();
  render(<GuestRequestFlow id="draft" revision={1} onCancel={() => {}} quote={controller} />);
  await screen.findByRole('radio', { name: /Alpha/ }); fireEvent.click(radio());
  result.annualRevenue = 300000000; result.tierBasis = 'provisional';
  result.recommendation.candidates[0] = { ...result.recommendation.candidates[0], merchantTier: 'sole', feeRate: 0 };
  fireEvent.change(screen.getByLabelText('예상 연매출 구간'), { target: { value: '300000000' } });
  await screen.findByText('0%');
  expect(screen.queryByLabelText('맞춤 PG 추천 진행')).not.toBeInTheDocument();
  expect(radio()).toBeChecked(); expect(controller.snapshot().savings?.annualRevenue).toBe(300000000);
});
it('does not reserve when saving originals fails and locks edits until the save finishes', async () => {
  let reject!: (error: Error) => void;
  mocks.signup.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  render(<GuestRequestFlow id="draft" revision={1} onCancel={() => {}} quote={quote()} />);
  await screen.findByRole('radio', { name: /Alpha/ }); fireEvent.click(radio()); fireEvent.click(submit());
  expect(screen.getByRole('button', { name: '저장 중…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '답변을 수정해요' })).toBeDisabled();
  await act(async () => reject(new Error('첨부 저장을 다시 시도해요.')));
  expect(screen.getByRole('alert')).toHaveTextContent('첨부 저장');
  expect(mocks.request).not.toHaveBeenCalledWith(expect.objectContaining({ op: 'reserve' }));
  fireEvent.click(screen.getByRole('button', { name: '다시 확인해요' }));
  await waitFor(() => expect(submit()).toBeEnabled());
  fireEvent.click(submit());
  await waitFor(() => expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ op: 'reserve' })));
});
it('revalidates selected PG against the latest policy after the final save', async () => {
  render(<GuestRequestFlow id="draft" revision={1} onCancel={() => {}} quote={quote()} />);
  await screen.findByRole('radio', { name: /Alpha/ }); fireEvent.click(radio());
  result.recommendation = { risk: 'black', industryName: '의류', candidates: [] };
  fireEvent.click(submit());
  await screen.findByText('입력한 사업은 현재 신청을 진행하기 어려워요');
  expect(submit()).toBeDisabled();
  expect(mocks.request).not.toHaveBeenCalledWith(expect.objectContaining({ op: 'reserve' }));
});
it('keeps manual signup continuation when automatic sending is disabled', async () => {
  render(<GuestRequestFlow id="draft" revision={1} autoRequestEnabled={false} onCancel={() => {}} quote={quote()} />);
  await screen.findByRole('radio', { name: /Alpha/ }); fireEvent.click(radio());
  fireEvent.click(screen.getByRole('button', { name: '가입하고 이어갈게요' }));
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/signup/buyer?next=%2Frfp-create%3Fresume%3Dguest'));
  expect(mocks.request).not.toHaveBeenCalledWith(expect.objectContaining({ op: 'reserve' }));
});
it('blocks progress on query failure and supports retry', async () => {
  mocks.request.mockRejectedValueOnce(new Error('연결을 다시 확인해요.'));
  render(<GuestMatchingReview id="draft" revision={1} workspaceId="" autoRequestEnabled onBack={() => {}} onConfirm={vi.fn()} />);
  await screen.findByRole('alert'); expect(submit()).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '다시 확인해요' }));
  await screen.findByRole('radio', { name: /Alpha/ }); expect(submit()).toBeDisabled();
});
it('ignores an old recommendation after switching the recovered draft', async () => {
  let resolve!: (value: GuestRecommendation) => void;
  mocks.request.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const props = { revision: 1, workspaceId: '', autoRequestEnabled: true, onBack: vi.fn(), onConfirm: vi.fn() };
  const view = render(<GuestMatchingReview {...props} id="old" />);
  view.rerender(<GuestMatchingReview {...props} id="new" />);
  await screen.findByRole('radio', { name: /Alpha/ });
  await act(async () => resolve({ ...result, recommendation: { risk: 'black', industryName: 'old', candidates: [] } }));
  expect(radio()).toBeInTheDocument();
});
it('uses the cancellation path before editing an existing reservation', async () => {
  const canceled = vi.fn();
  mocks.request.mockImplementation(async input => input.op === 'account' ? { signedIn: false, workspaces: [] }
    : input.op === 'status' ? { id: 'draft', status: 'unbound', pgName: 'Alpha' } : null);
  localStorage.setItem('support-b-guest-request', 'draft');
  render(<GuestRequestFlow id="draft" revision={1} onCancel={vi.fn()} onCanceled={canceled} />);
  fireEvent.click(await screen.findByRole('button', { name: '자동 요청을 취소하고 수정해요' }));
  await waitFor(() => expect(canceled).toHaveBeenCalledOnce());
  expect(mocks.request).toHaveBeenCalledWith({ op: 'cancel', id: 'draft' });
});
