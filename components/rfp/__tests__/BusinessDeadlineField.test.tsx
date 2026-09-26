import { render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { BusinessDeadlineField } from '../BusinessDeadlineField';

const getCalendar = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/actions/rfp/getBusinessCalendarAction', () => ({ getBusinessCalendarAction: getCalendar }));

it('서버 판본을 불러온 뒤 기본 5영업일을 부모에게 전달한다', async () => {
  getCalendar.mockResolvedValue({ enabled: true, coveredFrom: '2026-09-01', coveredThrough: '2026-12-31', holidays: [], version: 'v1' });
  const onChange = vi.fn();
  render(<BusinessDeadlineField label="마감일" value="" onChange={onChange} />);
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/T09:00:00.000Z$/), { mode: 'period', days: 5 }));
  expect(screen.getByRole('group', { name: '영업일 기간' })).toBeInTheDocument();
});

it('서버 거절 후 판본을 다시 조회하는 동안 이전 유효 날짜를 확정하지 않는다', async () => {
  getCalendar.mockReset();
  getCalendar.mockResolvedValueOnce({ enabled: true, coveredFrom: '2026-09-01', coveredThrough: '2027-12-31', holidays: [], version: 'v1' });
  let resolveSecond!: (calendar: { enabled: boolean; coveredFrom: string; coveredThrough: string; holidays: string[]; version: string }) => void;
  getCalendar.mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve; }));
  const onValidityChange = vi.fn();
  const props = { label: '마감일', value: '2026-10-07T09:00:00.000Z', choice: { mode: 'date' as const }, onChange: vi.fn(), onValidityChange };
  const { rerender } = render(<BusinessDeadlineField {...props} refreshKey={0} />);
  await waitFor(() => expect(screen.getByRole('group', { name: '영업일 기간' })).toBeInTheDocument());
  rerender(<BusinessDeadlineField {...props} refreshKey={1} />);
  await waitFor(() => expect(getCalendar).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('group', { name: '영업일 기간' })).not.toBeInTheDocument();
  expect(onValidityChange).toHaveBeenLastCalledWith(false);
  resolveSecond({ enabled: true, coveredFrom: '2026-09-01', coveredThrough: '2027-12-31', holidays: ['2026-10-07'], version: 'v2' });
  await waitFor(() => expect(screen.getByText(/저장된 날짜가 한국 영업일이 아니에요/)).toBeInTheDocument());
  expect(onValidityChange).toHaveBeenLastCalledWith(false);
});
