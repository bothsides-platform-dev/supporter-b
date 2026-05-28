import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/inbox',
  useSearchParams: () => new URLSearchParams(''),
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
  replace.mockClear();
});

describe('InboxList', () => {
  it('행 클릭 시 ?peek=<rfpId>로 replace', async () => {
    const user = userEvent.setup();
    render(<InboxList rows={[row]} />);
    await user.click(screen.getByText('PG 결제대행 RFP'));
    expect(replace).toHaveBeenCalledWith('/inbox?peek=P-2604-0001');
  });

  it('번호 컬럼에 rfpId(code)를 표시', () => {
    render(<InboxList rows={[row]} />);
    expect(screen.getByText('P-2604-0001')).toBeInTheDocument();
  });

  it('InboxRow에 rfpStatus 필드가 포함됨', () => {
    const rowWithClosedRfp: InboxRow = {
      ...row,
      invitationId: 'inv-002',
      rfpStatus: 'closed',
    };
    render(<InboxList rows={[rowWithClosedRfp]} />);
    expect(screen.getByText('P-2604-0001')).toBeInTheDocument();
  });

  it('초대 상태 Chip을 렌더', () => {
    render(<InboxList rows={[row]} />);
    expect(screen.getByText('신규')).toBeInTheDocument();
  });

  it('하단 키보드 힌트 문구를 표시하지 않는다', () => {
    const { container } = render(<InboxList rows={[row]} />);
    expect(container.textContent).not.toContain('J / K 이동');
  });
});
