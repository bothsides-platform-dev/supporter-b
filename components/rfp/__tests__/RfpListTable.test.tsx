// RfpListTable — 행 클릭은 사람용 code(P-YYMM-NNNN)로 이동해야 한다. 상세 라우트가
// findByCode 로 조회하므로 uuid(rfp.id)로 push 하면 "RFP를 찾을 수 없습니다" 가 뜬다
// (회귀 가드 + 모달 가로채기 진입점 정합).
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

import { RfpListTable } from '../RfpListTable';
import type { RFP } from '@/lib/types/rfp';

const rfp: RFP = {
  id: '11111111-1111-1111-1111-111111111111',
  code: 'P-2604-0001',
  buyerWsId: 'ws-buyer',
  title: '결제대행 RFP',
  memo: '',
  rfpFiles: [],
  allowedPgWorkspaceIds: [],
  deadline: new Date(Date.now() + 86_400_000).toISOString(),
  status: 'sent',
  createdBy: 'u1',
  createdAt: new Date().toISOString(),
};

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
});
