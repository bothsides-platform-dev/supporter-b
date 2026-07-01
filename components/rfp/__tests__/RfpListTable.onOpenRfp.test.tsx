import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { RFP } from '@/lib/types/rfp';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/rfp',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/server/actions/onboarding/deleteSampleRfpAction', () => ({
  deleteSampleRfpAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));

import { RfpListTable } from '../RfpListTable';

function rfp(over: Partial<RFP> = {}): RFP {
  return {
    id: over.id ?? 'r1', code: over.code ?? 'P-2606-0001', buyerWsId: 'ws1',
    title: over.title ?? 't', memo: '', rfpFiles: [], allowedPgWorkspaceIds: [],
    deadline: new Date().toISOString(), status: 'sent', createdBy: 'u1',
    createdAt: new Date().toISOString(), requiredPaymentMethods: [], customPaymentMethods: [],
    ...over,
  };
}

describe('RfpListTable — onOpenRfp 시드 (랜딩 데모 인플레이스 이동)', () => {
  beforeEach(() => push.mockClear());

  it('onOpenRfp가 있으면 행 클릭이 그것을 호출하고 router.push를 타지 않는다', () => {
    const onOpenRfp = vi.fn();
    render(
      <RfpListTable rfps={[rfp({ code: 'P-2606-0042', title: '데모 견적' })]} onOpenRfp={onOpenRfp} />,
    );
    fireEvent.click(screen.getByText('데모 견적'));
    expect(onOpenRfp).toHaveBeenCalledWith('P-2606-0042');
    expect(push).not.toHaveBeenCalled();
  });

  it('onOpenRfp가 없으면 기존대로 router.push로 상세 라우트로 이동한다', () => {
    render(<RfpListTable rfps={[rfp({ code: 'P-2606-0042', title: '데모 견적' })]} />);
    fireEvent.click(screen.getByText('데모 견적'));
    expect(push).toHaveBeenCalledWith('/rfp/P-2606-0042');
  });
});
