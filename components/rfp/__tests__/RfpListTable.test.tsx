// RfpListTable — 행 클릭은 사람용 code(P-YYMM-NNNN)로 이동해야 한다. 상세 라우트가
// findByCode 로 조회하므로 uuid(rfp.id)로 push 하면 "RFP를 찾을 수 없습니다" 가 뜬다
// (회귀 가드 + 모달 가로채기 진입점 정합).
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
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
  push.mockClear();
});

describe('RfpListTable', () => {
  it('행 클릭 시 code 로 이동(uuid 아님)', async () => {
    const user = userEvent.setup();
    render(<RfpListTable rfps={[rfp]} />);
    await user.click(screen.getByText('결제대행 RFP'));
    expect(push).toHaveBeenCalledWith('/rfp/P-2604-0001');
  });

  it('번호 컬럼에 uuid 가 아니라 code 를 표시', () => {
    render(<RfpListTable rfps={[rfp]} />);
    expect(screen.getByText('P-2604-0001')).toBeInTheDocument();
    expect(
      screen.queryByText('11111111-1111-1111-1111-111111111111'),
    ).not.toBeInTheDocument();
  });

  it('하단 키보드 힌트 문구를 표시하지 않는다', () => {
    render(<RfpListTable rfps={[rfp]} />);
    expect(screen.queryByText('이동')).not.toBeInTheDocument();
    expect(screen.queryByText('상세')).not.toBeInTheDocument();
    expect(screen.queryByText('신규')).not.toBeInTheDocument();
  });

  it('J/K 로 행을 이동하고 Enter 로 상세(code)로 이동한다', () => {
    const { container } = render(<RfpListTable rfps={[rfp, rfpSecond]} />);
    const rows = container.querySelectorAll('tbody tr');

    fireEvent.keyDown(document, { key: 'j' });
    expect(rows[0]).toHaveAttribute('data-active', 'true');

    fireEvent.keyDown(document, { key: 'j' });
    expect(rows[1]).toHaveAttribute('data-active', 'true');

    fireEvent.keyDown(document, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/rfp/P-2604-0002');
  });
});
