import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const requestRequoteAction = vi.fn();
vi.mock('@/lib/server/actions/rfp', () => ({
  requestRequoteAction: (input: unknown) => requestRequoteAction(input),
}));
const getCalendar = vi.hoisted(() => {
  const year = new Date().getFullYear();
  return vi.fn().mockResolvedValue({ coveredFrom: `${year}-01-01`, coveredThrough: `${year + 1}-12-31`, holidays: [], version: 'test' });
});
vi.mock('@/lib/server/actions/rfp/getBusinessCalendarAction', () => ({ getBusinessCalendarAction: getCalendar }));

import { RequoteDialog } from '../RequoteDialog';

const CANDIDATES = [
  { pgWsId: 'pg-1', name: 'OO페이' },
  { pgWsId: 'pg-2', name: '△△페이' },
];

afterEach(() => cleanup());
beforeEach(() => { requestRequoteAction.mockReset(); getCalendar.mockClear(); });

describe('RequoteDialog', () => {
  it('preselects the current consultation PG and explains that only its response deadline changes', () => {
    render(<RequoteDialog open onOpenChange={vi.fn()} rfpId="11111111-1111-1111-1111-111111111111" candidates={CANDIDATES} afterDeadline={undefined} defaultPgWsId="pg-2" />);
    expect(screen.getByLabelText('△△페이')).toBeChecked();
    expect(screen.getByText(/다른 PG사의 마감일은 바뀌지 않아요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수정 요청 보내기' })).toBeInTheDocument();
  });
  it('blocks submit with empty message', async () => {
    const user = userEvent.setup();
    render(<RequoteDialog open onOpenChange={vi.fn()} rfpId="11111111-1111-1111-1111-111111111111" candidates={CANDIDATES} afterDeadline={undefined} />);
    await user.click(screen.getByLabelText('OO페이'));
    await waitFor(() => expect(screen.getByRole('button', { name: '수정 요청 보내기' })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: '수정 요청 보내기' }));
    expect(requestRequoteAction).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('수정 요청 내용을 입력해 주세요');
  });

  it('submits selected PGs + message + deadline', async () => {
    const user = userEvent.setup();
    requestRequoteAction.mockResolvedValue({ ok: true });
    const onOpenChange = vi.fn();
    render(<RequoteDialog open onOpenChange={onOpenChange} rfpId="11111111-1111-1111-1111-111111111111" candidates={CANDIDATES} afterDeadline={undefined} />);
    await user.click(screen.getByLabelText('OO페이'));
    // 입력은 change 이벤트를 직접 쏜다 — 두 필드 모두 Base-UI 다이얼로그의
    // 포커스 트랩 안이라 userEvent.type 은 트랩이 포커스를 되가져가는 경쟁에서
    // 지면 키 입력을 조용히 유실한다(값이 '' 로 남고 예외도 안 난다).
    // DeleteAccountSection 이 같은 이유로 P0 플레이크였다.
    fireEvent.change(screen.getByPlaceholderText(/수정/), {
      target: { value: '카드 수수료를 낮춰주세요' },
    });
    await screen.findByRole('group', { name: '영업일 기간' });
    await user.click(screen.getByRole('button', { name: '수정 요청 보내기' }));
    await waitFor(() => expect(requestRequoteAction).toHaveBeenCalledTimes(1));
    const arg = requestRequoteAction.mock.calls[0]![0] as { pgWsIds: string[]; message: string; newDeadline: string };
    expect(arg.pgWsIds).toEqual(['pg-1']);
    expect(arg.message).toBe('카드 수수료를 낮춰주세요');
    expect(arg.newDeadline).toMatch(/T09:00:00.000Z$/);
  });

  it('공용 마감보다 이른 기간은 고를 수 없게 막는다 — 서버가 DEADLINE_MUST_EXTEND 로 거부한다', async () => {
    const afterDeadline = new Date(Date.now() + 20 * 86_400_000).toISOString();
    render(<RequoteDialog open onOpenChange={vi.fn()} rfpId="rfp-1" candidates={CANDIDATES} afterDeadline={afterDeadline} />);
    await screen.findByRole('group', { name: '영업일 기간' });
    expect(screen.getByRole('button', { name: '5영업일' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '10영업일' })).toBeDisabled();
  });

  it('달력 오류 뒤 최신 판본을 다시 불러온다', async () => {
    requestRequoteAction.mockResolvedValue({ ok: false, error: 'CALENDAR_UNAVAILABLE' });
    render(<RequoteDialog open onOpenChange={vi.fn()} rfpId="rfp-1" candidates={CANDIDATES} afterDeadline={undefined} />);
    fireEvent.click(screen.getByLabelText('OO페이'));
    fireEvent.change(screen.getByPlaceholderText(/수정/), { target: { value: '다시 검토해 주세요' } });
    await screen.findByRole('group', { name: '영업일 기간' });
    await waitFor(() => expect(screen.getByRole('button', { name: '수정 요청 보내기' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: '수정 요청 보내기' }));
    await waitFor(() => expect(requestRequoteAction).toHaveBeenCalledOnce());
    await waitFor(() => expect(getCalendar).toHaveBeenCalledTimes(2));
  });
});
