import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { BusinessDeadlinePicker } from '../BusinessDeadlinePicker';

const calendar = { enabled: true, coveredFrom: '2026-09-01', coveredThrough: '2026-12-31', holidays: ['2026-09-28'], version: 'test' };

it('기간 기본값 5영업일을 한국 공휴일을 건너뛰어 오후 6시로 표시한다', () => {
  const onChange = vi.fn();
  render(<BusinessDeadlinePicker label="마감일" value="" onChange={onChange} calendar={calendar} now={new Date('2026-09-24T03:00:00Z')} />);
  expect(screen.getByText(/오후 6시/)).toBeInTheDocument();
  expect(screen.getByText(/10월 2일/)).toBeInTheDocument();
  expect(onChange).toHaveBeenCalledWith('2026-10-02T09:00:00.000Z', { mode: 'period', days: 5 });
});

it('달력에서 휴일은 선택할 수 없고 유효한 날짜를 고르면 닫힌다', () => {
  const onChange = vi.fn();
  render(<BusinessDeadlinePicker label="마감일" value="" onChange={onChange} calendar={calendar} now={new Date('2026-09-24T03:00:00Z')} />);
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /날짜 선택/ }));
  fireEvent.click(screen.getByRole('button', { name: '이전 달로 이동' }));
  expect(screen.getByRole('button', { name: /28/ })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /30/ }));
  expect(onChange).toHaveBeenLastCalledWith('2026-09-30T09:00:00.000Z', { mode: 'date' });
  expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /날짜 선택/ })).toHaveAccessibleName(/9월 30일.*오후 6시/);
});

it('달력 범위가 없으면 입력을 열지 않고 오류를 보여준다', () => {
  render(<BusinessDeadlinePicker label="마감일" value="" onChange={vi.fn()} calendar={{ ...calendar, coveredThrough: '2026-09-25' }} now={new Date('2026-09-24T03:00:00Z')} />);
  expect(screen.getByRole('alert')).toHaveTextContent(/영업일 달력/);
  expect(screen.queryByLabelText('직접 날짜 선택')).not.toBeInTheDocument();
});

it('선택할 수 없는 기간은 비활성화하고 이전 마감값을 유지한다', () => {
  const onChange = vi.fn();
  render(<BusinessDeadlinePicker label="마감일" value="2026-09-30T09:00:00.000Z" onChange={onChange} calendar={{ ...calendar, coveredThrough: '2026-10-01' }} now={new Date('2026-09-24T03:00:00Z')} />);
  expect(screen.getByRole('button', { name: '10영업일' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '10영업일' }));
  expect(onChange).not.toHaveBeenCalled();
});

it('손상된 저장 마감값에도 선택기가 열리며 다시 선택할 수 있다', () => {
  render(<BusinessDeadlinePicker label="마감일" value="invalid-date" onChange={vi.fn()} calendar={calendar} now={new Date('2026-09-24T03:00:00Z')} />);
  expect(screen.getByRole('group', { name: '영업일 기간' })).toBeInTheDocument();
});

it('보관된 기간 날짜가 무효가 되면 새 날짜로 자동 확정하지 않는다', () => {
  const onChange = vi.fn();
  render(<BusinessDeadlinePicker label="마감일" value="2026-09-25T09:00:00.000Z" choice={{ mode: 'period', days: 5 }} onChange={onChange} calendar={calendar} now={new Date('2026-09-24T03:00:00Z')} />);
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent(/3영업일/);
});

it('보관된 직접 날짜가 새 요청일 기준 3영업일 미만이면 유효하지 않다고 알린다', () => {
  const onValidityChange = vi.fn();
  render(<BusinessDeadlinePicker label="마감일" value="2026-09-25T09:00:00.000Z" choice={{ mode: 'date' }} onChange={vi.fn()} onValidityChange={onValidityChange} calendar={calendar} now={new Date('2026-09-24T03:00:00Z')} />);
  expect(onValidityChange).toHaveBeenCalledWith(false);
  expect(screen.getByRole('button', { name: /마감일 날짜 선택/ })).toHaveTextContent('9월 25일');
  expect(screen.getByRole('alert')).toHaveTextContent(/3영업일/);
});

it('기능이 꺼져도 기존 기간 초안의 마감과 네이티브 날짜 변경이 유효하다', () => {
  const onChange = vi.fn();
  const onValidityChange = vi.fn();
  const { rerender } = render(<BusinessDeadlinePicker label="마감일" value="2026-10-02T14:59:59.999Z" choice={{ mode: 'period', days: 5 }} onChange={onChange} onValidityChange={onValidityChange} calendar={{ ...calendar, enabled: false }} now={new Date('2026-09-24T03:00:00Z')} />);
  expect(screen.getByLabelText('마감일')).toHaveValue('2026-10-02');
  expect(onValidityChange).toHaveBeenLastCalledWith(true);
  fireEvent.change(screen.getByLabelText('마감일'), { target: { value: '2026-10-03' } });
  expect(onChange).toHaveBeenLastCalledWith('2026-10-03T14:59:59.999Z', { mode: 'date' });
  rerender(<BusinessDeadlinePicker label="마감일" value="2026-10-03T14:59:59.999Z" choice={{ mode: 'date' }} onChange={onChange} onValidityChange={onValidityChange} calendar={{ ...calendar, enabled: false }} now={new Date('2026-09-24T03:00:00Z')} />);
  expect(screen.getByLabelText('마감일')).toHaveValue('2026-10-03');
});

it('자정 뒤 기간 버튼을 누르면 새로 계산해 전달한 날짜를 화면에도 표시한다', () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2026-09-24T14:59:00Z'));
    const onChange = vi.fn();
    render(<BusinessDeadlinePicker label="마감일" value="" onChange={onChange} calendar={calendar} />);
    vi.setSystemTime(new Date('2026-09-24T15:01:00Z'));
    fireEvent.click(screen.getByRole('button', { name: '5영업일' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-10-05T09:00:00.000Z', { mode: 'period', days: 5 });
    expect(screen.getByText(/10월 5일/)).toBeInTheDocument();
  } finally { vi.useRealTimers(); }
});

it('연장 기준은 같은 날짜라도 오후 6시와 정확히 비교한다', () => {
  const onValidityChange = vi.fn();
  const props = { label: '마감일', value: '2026-09-30T09:00:00.000Z', choice: { mode: 'date' as const }, onChange: vi.fn(), calendar, now: new Date('2026-09-24T03:00:00Z'), onValidityChange };
  const { rerender } = render(<BusinessDeadlinePicker {...props} afterDeadline="2026-09-30T08:59:59.000Z" />);
  expect(onValidityChange).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole('button', { name: /마감일 날짜 선택/ }));
  expect(screen.getByRole('button', { name: /2026년 9월 30일 수요일, 선택됨/ })).toBeEnabled();
  expect(screen.getByText('9월 30일')).toBeInTheDocument();
  rerender(<BusinessDeadlinePicker {...props} afterDeadline="2026-09-30T09:00:01.000Z" />);
  expect(screen.getByRole('button', { name: /2026년 9월 30일 수요일, 선택됨/ })).toHaveAttribute('aria-disabled', 'true');
  expect(onValidityChange).toHaveBeenLastCalledWith(false);
  expect(screen.getByText('10월 1일')).toBeInTheDocument();
});

it('달력 판본에서 선택일이 휴일로 바뀌어도 자동 대체하지 않고 재선택을 요구한다', () => {
  const onChange = vi.fn();
  const onValidityChange = vi.fn();
  const props = { label: '마감일', value: '2026-10-02T09:00:00.000Z', choice: { mode: 'period' as const, days: 5 }, onChange, now: new Date('2026-09-24T03:00:00Z'), onValidityChange };
  const { rerender } = render(<BusinessDeadlinePicker {...props} calendar={calendar} />);
  expect(onValidityChange).toHaveBeenLastCalledWith(true);
  rerender(<BusinessDeadlinePicker {...props} calendar={{ ...calendar, holidays: [...calendar.holidays, '2026-10-02'], version: 'v2' }} />);
  expect(onChange).not.toHaveBeenCalled();
  expect(onValidityChange).toHaveBeenLastCalledWith(false);
  expect(screen.getByRole('alert')).toHaveTextContent(/영업일이 아니에요/);
});

it('팝업을 Escape로 닫으면 날짜 버튼으로 초점이 돌아온다', async () => {
  render(<BusinessDeadlinePicker label="마감일" value="2026-09-30T09:00:00.000Z" onChange={vi.fn()} calendar={calendar} now={new Date('2026-09-24T03:00:00Z')} />);
  const trigger = screen.getByRole('button', { name: /마감일 날짜 선택/ });
  fireEvent.click(trigger);
  await waitFor(() => expect(screen.getByRole('grid')).toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole('grid')).toContainElement(document.activeElement as HTMLElement));
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('grid')).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
});

it('키보드로도 선택 불가 날짜를 건너뛰고 유효한 날짜만 확정한다', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<BusinessDeadlinePicker label="마감일" value="2026-09-30T09:00:00.000Z" choice={{ mode: 'date' }} onChange={onChange} calendar={calendar} now={new Date('2026-09-24T03:00:00Z')} />);
  await user.click(screen.getByRole('button', { name: /마감일 날짜 선택/ }));
  const tooSoon = screen.getByRole('button', { name: /2026년 9월 29일/ });
  expect(tooSoon).toBeDisabled();
  tooSoon.focus();
  await user.keyboard('{Enter}');
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole('grid')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '다음 달로 이동' }));
  const valid = screen.getByRole('button', { name: /2026년 10월 1일/ });
  valid.focus();
  await user.keyboard('{Enter}');
  expect(onChange).toHaveBeenCalledWith('2026-10-01T09:00:00.000Z', { mode: 'date' });
});

it('아무 동작이 없어도 KST 자정에 기존 선택이 무효가 되면 재선택을 요구한다', () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2026-09-24T14:59:00Z'));
    const onChange = vi.fn();
    const onValidityChange = vi.fn();
    render(<BusinessDeadlinePicker label="마감일" value="2026-09-30T09:00:00.000Z" choice={{ mode: 'date' }} onChange={onChange} onValidityChange={onValidityChange} calendar={calendar} />);
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
    act(() => vi.advanceTimersByTime(120_000));
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/새 날짜를 선택해 주세요/);
  } finally { vi.useRealTimers(); }
});

it('근로자의 날·주말·30일 초과 날짜를 달력에서 선택할 수 없다', () => {
  const springCalendar = { ...calendar, coveredFrom: '2026-04-01', coveredThrough: '2026-06-30', holidays: [] };
  render(<BusinessDeadlinePicker label="마감일" value="2026-04-30T09:00:00.000Z" choice={{ mode: 'date' }} onChange={vi.fn()} calendar={springCalendar} now={new Date('2026-04-27T03:00:00Z')} />);
  fireEvent.click(screen.getByRole('button', { name: /마감일 날짜 선택/ }));
  fireEvent.click(screen.getByRole('button', { name: '다음 달로 이동' }));
  expect(screen.getByRole('button', { name: /2026년 5월 1일/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: /2026년 5월 2일/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: /2026년 5월 28일/ })).toBeDisabled();
});
