import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { RFP } from '@/lib/types/rfp';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/rfp',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/server/actions/onboarding/deleteSampleRfpAction', () => ({
  deleteSampleRfpAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));

import { RfpListTable } from '../RfpListTable';

function rfp(over: Partial<RFP>): RFP {
  return {
    id: over.id ?? 'r1', code: over.code ?? 'P-2606-0001', buyerWsId: 'ws1',
    title: 't', memo: '', rfpFiles: [], allowedPgWorkspaceIds: [],
    deadline: new Date().toISOString(), status: 'sent', createdBy: 'u1',
    createdAt: new Date().toISOString(), requiredPaymentMethods: [], customPaymentMethods: [],
    ...over,
  };
}

describe('RfpListTable sample row', () => {
  it('renders a 샘플 chip and a 삭제 trigger for sample rows', () => {
    render(<RfpListTable rfps={[rfp({ isSample: true })]} />);
    expect(screen.getByText('샘플')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '샘플 삭제' })).toBeInTheDocument();
  });

  it('does not render delete trigger for normal rows', () => {
    render(<RfpListTable rfps={[rfp({ isSample: false })]} />);
    expect(screen.queryByRole('button', { name: '샘플 삭제' })).not.toBeInTheDocument();
  });
});
