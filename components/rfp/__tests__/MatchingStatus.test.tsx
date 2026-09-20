import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { BuyerMatchingStatus, PgReviewPanel } from '../MatchingStatus';
import type { BuyerMatching } from '@/lib/rfp/pg-matching';

const mocks = vi.hoisted(() => ({ next: vi.fn(), review: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/lib/server/actions/rfp/matching', () => ({ requestNextPgAction: mocks.next, reviewPgRequestAction: mocks.review }));
const data: BuyerMatching = { industryName: '판매', reviews: [{ id: 'review-1', pgWorkspaceId: 'pg-1', status: 'rejected', reason: '취급 조건이 맞지 않아요', createdAt: '2026-09-19', updatedAt: '2026-09-19', candidate: { pgWorkspaceId: 'pg-1', name: 'Alpha', reason: '판매 상담', feeMin: null, feeMax: null, feeNote: '' } }], recommendation: { risk: 'gray', industryName: '판매', candidates: [{ pgWorkspaceId: 'pg-2', name: 'Beta', reason: '추가 검토 상담', feeMin: null, feeMax: null, feeNote: '' }] } };
beforeEach(() => { vi.clearAllMocks(); mocks.next.mockResolvedValue({ ok: true }); mocks.review.mockResolvedValue({ ok: true }); });
it('거절 사유와 다음 후보를 보여주고 선택한 한 곳에 새 마감일로 요청한다', async () => {
  render(<BuyerMatchingStatus rfpId="rfp-1" status="sent" data={data} />);
  expect(screen.getByText('취급 조건이 맞지 않아요')).toBeInTheDocument();
  const user = userEvent.setup();
  await user.click(screen.getByRole('radio', { name: /Beta/ }));
  await user.click(screen.getByRole('button', { name: '다음 PG사에 상담 요청하기' }));
  await waitFor(() => expect(mocks.next).toHaveBeenCalledWith(expect.objectContaining({ rfpId: 'rfp-1', previousReviewId: 'review-1', pgWorkspaceId: 'pg-2', deadline: expect.any(String) })));
  expect(mocks.refresh).toHaveBeenCalled();
});
it('PG 거절에는 구매사에게 보여줄 사유가 필요하고 성공 후 새로고침한다', async () => {
  render(<PgReviewPanel rfpId="rfp-1" status="sent" review={{ id: 'review-1', status: 'requested', reason: '' }} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '검토 시작하기' }));
  expect(mocks.review).toHaveBeenCalledWith({ rfpId: 'rfp-1', reviewId: 'review-1', status: 'reviewing', reason: '' });
  await user.click(screen.getByRole('button', { name: '상담 거절하기' }));
  expect(mocks.review).toHaveBeenCalledTimes(1);
  await user.type(screen.getByLabelText('거절 사유'), '추가 서류 확인이 어려워요');
  await user.click(screen.getByRole('button', { name: '상담 거절하기' }));
  expect(screen.getByText('상담을 거절할까요?')).toBeInTheDocument();
  expect(mocks.review).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: '닫기' }));
  expect(mocks.review).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: '상담 거절하기' }));
  await user.click(screen.getByRole('button', { name: '거절 확정하기' }));
  expect(mocks.review).toHaveBeenLastCalledWith({ rfpId: 'rfp-1', reviewId: 'review-1', status: 'rejected', reason: '추가 서류 확인이 어려워요' });
});
it('선정이 완료되거나 요청이 닫히면 다음 상담을 요청하지 않는다', () => {
  render(<BuyerMatchingStatus rfpId="rfp-1" status="awarded" data={data} />);
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
});
it('PG가 답하지 않아도 구매사가 운영팀에 상담을 요청할 수 있다', () => {
  render(<BuyerMatchingStatus rfpId="rfp-1" status="sent" data={{ ...data, reviews: [{ ...data.reviews[0], status: 'requested', reason: '' }] }} />);
  expect(screen.getByRole('link', { name: '운영팀에 문의해요' })).toHaveAttribute('href', 'mailto:help@support-b.com');
});
