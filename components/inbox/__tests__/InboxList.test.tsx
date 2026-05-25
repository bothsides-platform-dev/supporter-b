// InboxList — 행 클릭 시 rfpId(code) 로 이동, rfpStatus 필드가 있는 InboxRow 렌더.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

import { InboxList } from '../InboxList';
import type { InboxRow } from '../InboxList';

const row: InboxRow = {
  invitationId: 'inv-001',
  invitationStatus: 'sent',
  rfpStatus: 'sent',
  rfpId: 'P-2604-0001',
  rfpTitle: 'PG 결제대행 RFP',
  rfpDeadline: new Date(Date.now() + 86_400_000).toISOString(),
  grade: '일반',
};

afterEach(() => {
  cleanup();
  push.mockClear();
});

describe('InboxList', () => {
  it('행 클릭 시 rfpId 로 이동', async () => {
    const user = userEvent.setup();
    render(<InboxList rows={[row]} />);
    await user.click(screen.getByText('PG 결제대행 RFP'));
    expect(push).toHaveBeenCalledWith('/inbox/P-2604-0001');
  });

  it('번호 컬럼에 rfpId(code) 를 표시', () => {
    render(<InboxList rows={[row]} />);
    expect(screen.getByText('P-2604-0001')).toBeInTheDocument();
  });

  it('InboxRow에 rfpStatus 필드가 포함됨', () => {
    // rfpStatus is required for closed-filter mapping — ensure type accepts it
    const rowWithClosedRfp: InboxRow = {
      ...row,
      invitationId: 'inv-002',
      rfpStatus: 'closed',
    };
    render(<InboxList rows={[rowWithClosedRfp]} />);
    // Table still renders the row (status chip shows invitationStatus label)
    expect(screen.getByText('P-2604-0001')).toBeInTheDocument();
  });

  it('초대 상태 Chip을 렌더', () => {
    render(<InboxList rows={[row]} />);
    // invStatusLabel for 'sent' = '신규'
    expect(screen.getByText('신규')).toBeInTheDocument();
  });

  it('하단 키보드 힌트 문구를 표시하지 않는다', () => {
    const { container } = render(<InboxList rows={[row]} />);
    expect(container.textContent).not.toContain('J / K 이동');
    expect(container.textContent).not.toMatch(/Enter[\s\S]*응답[\s\S]*작성/);
  });
});
