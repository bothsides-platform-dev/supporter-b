import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const replace = vi.fn();
const mockPathname = vi.fn(() => '/rfp');
const mockSearchParams = vi.fn(() => new URLSearchParams(''));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => mockPathname(),
  useSearchParams: () => mockSearchParams(),
}));

import { BoardFilterBar } from '../BoardFilterBar';

const STATUS = [
  { value: 'draft', label: '작성중' },
  { value: 'active', label: '진행중' },
  { value: 'closed', label: '마감' },
  { value: 'awarded', label: '계약완료' },
];
const GRADE = [
  { value: 'small', label: '영세' },
  { value: 'sme1', label: '중소1' },
  { value: 'general', label: '일반' },
];

beforeEach(() => {
  replace.mockClear();
  mockPathname.mockReturnValue('/rfp');
  mockSearchParams.mockReturnValue(new URLSearchParams(''));
});
afterEach(() => cleanup());

describe('BoardFilterBar', () => {
  it('selecting a status pushes ?status=active', async () => {
    const user = userEvent.setup();
    render(<BoardFilterBar statusOptions={STATUS} gradeOptions={GRADE} />);
    await user.click(screen.getByRole('button', { name: '진행중' }));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][0]).toContain('status=active');
  });

  it('clicking the active status again removes the param', async () => {
    const user = userEvent.setup();
    mockSearchParams.mockReturnValue(new URLSearchParams('status=active'));
    render(<BoardFilterBar statusOptions={STATUS} gradeOptions={GRADE} />);
    await user.click(screen.getByRole('button', { name: '진행중' }));
    const url = replace.mock.calls[0][0] as string;
    expect(url).not.toContain('status=active');
  });

  it('selecting a grade pushes ?grade=sme1 and preserves existing params', async () => {
    const user = userEvent.setup();
    mockSearchParams.mockReturnValue(new URLSearchParams('view=board'));
    render(<BoardFilterBar statusOptions={STATUS} gradeOptions={GRADE} />);
    await user.selectOptions(screen.getByLabelText('가맹점 등급'), 'sme1');
    const url = replace.mock.calls[0][0] as string;
    expect(url).toContain('grade=sme1');
    expect(url).toContain('view=board');
  });

  it('clearing the only param pushes the bare pathname (no trailing ?)', async () => {
    const user = userEvent.setup();
    mockSearchParams.mockReturnValue(new URLSearchParams('status=active'));
    render(<BoardFilterBar statusOptions={STATUS} gradeOptions={GRADE} />);
    await user.click(screen.getByRole('button', { name: '진행중' }));
    expect(replace).toHaveBeenCalledWith('/rfp');
  });
});
