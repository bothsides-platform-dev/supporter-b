// components/rfp/__tests__/RfpListTable.test.tsx
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/rfp',
  useSearchParams: () => new URLSearchParams(''),
}));

import { RfpListTable } from '../RfpListTable';
import type { RFP } from '@/lib/types/rfp';

function makeRfp(overrides: Partial<RFP> & Pick<RFP, 'code' | 'title'>): RFP {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    buyerWsId: 'ws-buyer',
    memo: '',
    rfpFiles: [],
    allowedPgWorkspaceIds: [],
    requiredPaymentMethods: [],
    deadline: new Date(Date.now() + 86_400_000).toISOString(),
    status: 'sent',
    createdBy: 'u1',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const rfp = makeRfp({ code: 'P-2604-0001', title: '결제대행 RFP' });
const rfpSecond = makeRfp({
  id: '22222222-2222-2222-2222-222222222222',
  code: 'P-2604-0002',
  title: '두 번째 RFP',
});

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  replace.mockClear();
});

describe('RfpListTable', () => {
  it('행 클릭 시 ?peek=<code>로 replace (uuid 아님)', async () => {
    const user = userEvent.setup();
    render(<RfpListTable rfps={[rfp]} />);
    await user.click(screen.getByText('결제대행 RFP'));
    expect(replace).toHaveBeenCalledWith('/rfp?peek=P-2604-0001');
  });

  it('번호 컬럼에 code를 표시', () => {
    render(<RfpListTable rfps={[rfp]} />);
    expect(screen.getByText('P-2604-0001')).toBeInTheDocument();
    expect(
      screen.queryByText('11111111-1111-1111-1111-111111111111'),
    ).not.toBeInTheDocument();
  });

  it('Enter 키로 ?peek=<code> replace', () => {
    render(<RfpListTable rfps={[rfp, rfpSecond]} />);
    fireEvent.keyDown(document, { key: 'j' });
    fireEvent.keyDown(document, { key: 'j' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(replace).toHaveBeenCalledWith('/rfp?peek=P-2604-0002');
  });

  it('peekCode와 일치하는 행이 2개 렌더됨', () => {
    const { container } = render(<RfpListTable rfps={[rfp, rfpSecond]} />);
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
  });
});
