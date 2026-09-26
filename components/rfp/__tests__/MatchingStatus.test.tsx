import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BuyerMatchingStatus, PgReviewPanel } from '../MatchingStatus';
import type { BuyerMatching } from '@/lib/rfp/pg-matching';

const mocks = vi.hoisted(() => ({ next: vi.fn(), endNext: vi.fn(), review: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/lib/server/actions/rfp/matching', () => ({ requestNextPgAction: mocks.next, endAndRequestNextPgAction: mocks.endNext, reviewPgRequestAction: mocks.review }));
const getCalendar = vi.hoisted(() => vi.fn().mockResolvedValue({ enabled: true, coveredFrom: '2026-01-01', coveredThrough: '2027-12-31', holidays: [], version: 'test' }));
vi.mock('@/lib/server/actions/rfp/getBusinessCalendarAction', () => ({ getBusinessCalendarAction: getCalendar }));
const data: BuyerMatching = { industryName: '판매', reviews: [{ id: 'review-1', pgWorkspaceId: 'pg-1', status: 'rejected', reason: '취급 조건이 맞지 않아요', createdAt: '2026-09-19', updatedAt: '2026-09-19', candidate: { pgWorkspaceId: 'pg-1', name: 'Alpha', reason: '판매 상담', feeMin: null, feeMax: null, feeNote: '' } }], recommendation: { risk: 'gray', industryName: '판매', candidates: [{ pgWorkspaceId: 'pg-2', name: 'Beta', reason: '추가 검토 상담', feeMin: null, feeMax: null, feeNote: '' }] } };
beforeEach(() => { vi.clearAllMocks(); mocks.next.mockResolvedValue({ ok: true }); mocks.review.mockResolvedValue({ ok: true }); });

it('답변 없이 마감되면 다음 후보와 마감을 고른 뒤 현재 상담 종료를 확인한다', async () => {
  mocks.endNext.mockResolvedValue({ ok: true });
  render(<BuyerMatchingStatus rfpCode="P-2609-0042" deadline="2026-09-21T09:00:00Z" rfpId="rfp-1" status="sent" data={{ ...data, reviews: [{ ...data.reviews[0], status: 'requested', reason: '' }] }} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('radio', { name: /Beta/ }));
  await screen.findByRole('group', { name: '영업일 기간' });
  await user.click(screen.getByRole('button', { name: '다음 PG사에 상담 요청하기' }));
  expect(mocks.endNext).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '현재 상담을 종료하고 요청하기' }));
  await waitFor(() => expect(mocks.endNext).toHaveBeenCalledWith(expect.objectContaining({ previousReviewId: 'review-1', pgWorkspaceId: 'pg-2', deadline: expect.stringMatching(/T09:00:00.000Z$/) })));
});

it('영업일 기능이 비활성화된 상담은 마감 뒤 기존 문의 경로를 유지한다', () => {
  render(<BuyerMatchingStatus businessDeadlinesEnabled={false} rfpCode="P-2609-0042" deadline="2026-09-21T09:00:00Z" rfpId="rfp-1" status="sent" data={{ ...data, reviews: [{ ...data.reviews[0], status: 'requested', reason: '' }] }} />);
  expect(screen.getByRole('link', { name: '다른 PG 상담을 문의해요' })).toBeInTheDocument();
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
});
it('거절 사유와 다음 후보를 보여주고 선택한 한 곳에 새 마감일로 요청한다', async () => {
  render(<BuyerMatchingStatus rfpCode="P-2609-0042" deadline="2099-09-30T14:59:59.999Z" rfpId="rfp-1" status="sent" data={data} />);
  expect(screen.getByText('취급 조건이 맞지 않아요')).toBeInTheDocument();
  const user = userEvent.setup();
  await user.click(screen.getByRole('radio', { name: /Beta/ }));
  await user.click(screen.getByRole('button', { name: '다음 PG사에 상담 요청하기' }));
  await waitFor(() => expect(mocks.next).toHaveBeenCalledWith(expect.objectContaining({ rfpId: 'rfp-1', previousReviewId: 'review-1', pgWorkspaceId: 'pg-2', deadline: expect.any(String) })));
  expect(mocks.refresh).toHaveBeenCalled();
});
it('다음 PG 요청의 달력 오류 뒤 새 판본을 다시 확인한다', async () => {
  mocks.next.mockResolvedValue({ ok: false, error: 'CALENDAR_UNAVAILABLE' });
  render(<BuyerMatchingStatus rfpCode="P-2609-0042" deadline="2099-09-30T14:59:59.999Z" rfpId="rfp-1" status="sent" data={data} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('radio', { name: /Beta/ }));
  await screen.findByRole('group', { name: '영업일 기간' });
  await waitFor(() => expect(screen.getByRole('button', { name: '다음 PG사에 상담 요청하기' })).not.toBeDisabled());
  await user.click(screen.getByRole('button', { name: '다음 PG사에 상담 요청하기' }));
  await waitFor(() => expect(mocks.next).toHaveBeenCalledOnce());
  await waitFor(() => expect(getCalendar).toHaveBeenCalledTimes(2));
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
  render(<BuyerMatchingStatus rfpCode="P-2609-0042" deadline="2099-09-30T14:59:59.999Z" rfpId="rfp-1" status="awarded" data={data} />);
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
});
it('PG가 답하지 않아도 구매사가 운영팀에 상담을 요청할 수 있다', () => {
  render(<BuyerMatchingStatus rfpCode="P-2609-0042" deadline="2099-09-30T14:59:59.999Z" rfpId="rfp-1" status="sent" data={{ ...data, reviews: [{ ...data.reviews[0], status: 'requested', reason: '' }] }} />);
  expect(screen.getByRole('link', { name: '다른 PG 상담을 문의해요' }).getAttribute('href')).toMatch(/^mailto:help@support-b\.com\?/);
});


afterEach(() => vi.useRealTimers());

it.each(['requested', 'reviewing', 'quoted'] as const)('%s 상담에서도 다음 PG 상담 문의에 견적번호와 현재 PG를 포함한다', status => {
  render(<BuyerMatchingStatus rfpCode="P-2609-0042" deadline="2099-09-30T14:59:59.999Z" rfpId="rfp-1" status="sent" data={{ ...data, reviews: [{ ...data.reviews[0], status, reason: '', candidate: { ...data.reviews[0].candidate, name: 'Alpha & Beta' } }] }} />);
  const href = new URL(screen.getByRole('link', { name: '다른 PG 상담을 문의해요' }).getAttribute('href')!);
  expect(href.pathname).toBe('help@support-b.com');
  expect(href.searchParams.get('subject')).toBe('[서포트비] 다른 PG 상담 문의 · P-2609-0042');
  expect(href.searchParams.get('body')).toContain('견적 요청 번호: P-2609-0042');
  expect(href.searchParams.get('body')).toContain('현재 상담 PG사: Alpha & Beta');
  expect(screen.getByText(/문의만으로 현재 상담이 종료되지는 않아요/)).toBeInTheDocument();
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  expect(mocks.next).not.toHaveBeenCalled();
});

it.each(['requested', 'reviewing'] as const)('%s 상태에서 마감이 지나면 계속 기다리라는 안내 대신 다음 경로를 보여준다', status => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-21T15:00:00Z'));
  render(<BuyerMatchingStatus rfpCode="P-2609-0042" deadline="2026-09-21T15:00:00Z" rfpId="rfp-1" status="sent" data={{ ...data, reviews: [{ ...data.reviews[0], status, reason: '' }] }} />);
  expect(screen.getByRole('heading', { name: '견적 마감일까지 답변이 도착하지 않았어요' })).toBeInTheDocument();
  expect(screen.queryByText(/이내에 연락드릴 예정/)).not.toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /Beta/ })).toBeInTheDocument();
});

it('화면을 열어둔 채 마감에 도달해도 대기 안내를 바꾼다', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-21T14:59:59Z'));
  const props = { rfpCode: 'P-2609-0042', deadline: '2026-09-21T15:00:00Z', rfpId: 'rfp-1', status: 'sent' as const, data: { ...data, reviews: [{ ...data.reviews[0], status: 'requested' as const, reason: '' }] } };
  const { rerender } = render(<BuyerMatchingStatus {...props} />);
  expect(screen.getByText(/이내에 연락드릴 예정/)).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByRole('heading', { name: '견적 마감일까지 답변이 도착하지 않았어요' })).toBeInTheDocument();
  rerender(<BuyerMatchingStatus {...props} deadline="2026-09-22T15:00:00Z" />);
  expect(screen.getByText(/이내에 연락드릴 예정/)).toBeInTheDocument();
});

it('견적이 이미 도착했으면 기한이 지나도 견적 확인과 선정 안내를 유지한다', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-22T15:00:00Z'));
  render(<BuyerMatchingStatus rfpCode="P-2609-0042" deadline="2026-09-21T15:00:00Z" rfpId="rfp-1" status="sent" data={{ ...data, reviews: [{ ...data.reviews[0], status: 'quoted', reason: '' }] }} />);
  expect(screen.getByRole('heading', { name: '도착한 견적을 확인해주세요' })).toBeInTheDocument();
  expect(screen.queryByText('견적 마감일까지 답변이 도착하지 않았어요')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: '다른 PG 상담을 문의해요' })).toBeInTheDocument();
});

it.each(['closed', 'cancelled', 'awarded'] as const)('%s 요청에는 진행 상담의 전환 문의나 선정 안내를 남기지 않는다', status => {
  render(<BuyerMatchingStatus rfpCode="P-2609-0042" deadline="2099-09-30T14:59:59.999Z" rfpId="rfp-1" status={status} data={{ ...data, reviews: [{ ...data.reviews[0], status: 'quoted', reason: '' }] }} />);
  expect(screen.queryByRole('link', { name: '다른 PG 상담을 문의해요' })).not.toBeInTheDocument();
  expect(screen.queryByText(/최종 선정해주세요/)).not.toBeInTheDocument();
});
