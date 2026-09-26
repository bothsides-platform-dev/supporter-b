import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { DeadlineChangeDialog } from '../DeadlineChangeDialog';

const mocks = vi.hoisted(() => ({ change: vi.fn(), calendar: vi.fn() }));
vi.mock('@/lib/server/actions/rfp/changeRfpDeadlineAction', () => ({ changeRfpDeadlineAction: mocks.change }));
vi.mock('@/lib/server/actions/rfp/getBusinessCalendarAction', () => ({ getBusinessCalendarAction: mocks.calendar }));
beforeEach(() => { mocks.change.mockReset(); mocks.calendar.mockReset(); });

it('확인한 날짜와 기존 날짜를 함께 보내고 성공 시 화면을 갱신한다', async () => {
  mocks.calendar.mockResolvedValue({ enabled: true, coveredFrom: '2026-01-01', coveredThrough: '2027-12-31', holidays: [], version: 'test' });
  mocks.change.mockResolvedValue({ ok: true });
  const onChanged = vi.fn();
  render(<DeadlineChangeDialog open onOpenChange={vi.fn()} rfpId="rfp-1" expectedDeadline="2026-09-21T09:00:00.000Z" expectedReviewId="review-1" reopen onChanged={onChanged} />);
  await screen.findByRole('group', { name: '영업일 기간' });
  const displayed = (await screen.findByText(/오후 6시/)).textContent;
  await waitFor(() => expect(screen.getByRole('button', { name: '견적 접수 다시 열기' })).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: '견적 접수 다시 열기' }));
  await waitFor(() => expect(mocks.change).toHaveBeenCalledWith(expect.objectContaining({ rfpId: 'rfp-1', expectedDeadline: '2026-09-21T09:00:00.000Z', expectedReviewId: 'review-1', reopen: true, newDeadline: expect.stringMatching(/T09:00:00.000Z$/) })));
  expect(displayed).toContain('오후 6시');
  expect(onChanged).toHaveBeenCalled();
});

it('동시 변경 오류를 한국어로 안내하고 상태를 새로고침한다', async () => {
  mocks.calendar.mockResolvedValue({ enabled: true, coveredFrom: '2026-01-01', coveredThrough: '2027-12-31', holidays: [], version: 'test' });
  mocks.change.mockResolvedValue({ ok: false, error: 'DEADLINE_CHANGED' });
  const onChanged = vi.fn();
  render(<DeadlineChangeDialog open onOpenChange={vi.fn()} rfpId="rfp-1" expectedDeadline="2026-09-21T09:00:00.000Z" reopen onChanged={onChanged} />);
  await screen.findByText(/오후 6시/);
  await waitFor(() => expect(screen.getByRole('button', { name: '견적 접수 다시 열기' })).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: '견적 접수 다시 열기' }));
  await waitFor(() => expect(mocks.change).toHaveBeenCalledOnce());
  expect(await screen.findByRole('alert')).toHaveTextContent('다른 변경이 먼저 반영됐어요');
  expect(onChanged).toHaveBeenCalled();
});

it('진행 중인 재요청보다 이른 날짜는 연장으로 확정할 수 없다', async () => {
  mocks.calendar.mockResolvedValue({ enabled: true, coveredFrom: '2026-01-01', coveredThrough: '2027-12-31', holidays: [], version: 'test' });
  render(<DeadlineChangeDialog open onOpenChange={vi.fn()} rfpId="rfp-1" expectedDeadline="2026-09-21T09:00:00.000Z" latestDeadline="2099-01-01T09:00:00.000Z" reopen={false} onChanged={vi.fn()} />);
  await screen.findByText(/오후 6시/);
  expect(screen.getByRole('button', { name: '마감일 연장하기' })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent(/선택할 수 있는 마감일이 없어요/);
});

it('서버 달력 오류 뒤 새 판본을 받아 다시 확인하기 전에는 재발송할 수 없다', async () => {
  mocks.calendar.mockResolvedValue({ enabled: true, coveredFrom: '2026-01-01', coveredThrough: '2027-12-31', holidays: [], version: 'test' });
  mocks.change.mockResolvedValue({ ok: false, error: 'CALENDAR_UNAVAILABLE' });
  render(<DeadlineChangeDialog open onOpenChange={vi.fn()} rfpId="rfp-1" expectedDeadline="2026-09-21T09:00:00.000Z" reopen onChanged={vi.fn()} />);
  await screen.findByText(/오후 6시/);
  await waitFor(() => expect(screen.getByRole('button', { name: '견적 접수 다시 열기' })).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: '견적 접수 다시 열기' }));
  await waitFor(() => expect(mocks.change).toHaveBeenCalledOnce());
  await waitFor(() => expect(mocks.calendar).toHaveBeenCalledTimes(2));
});
