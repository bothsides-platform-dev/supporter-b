import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { ContractList } from '../ContractList';
import type { ContractDocListEntry } from '@/lib/server/contract-loader';

afterEach(cleanup);

function entry(over?: Partial<ContractDocListEntry>): ContractDocListEntry {
  return {
    id: 'doc-1',
    code: 'CT-2605-0001',
    title: '결제대행 계약',
    status: 'sent',
    counterpartyName: '(주)테스트',
    sentAt: '2026-05-01T00:00:00.000Z',
    expiresAt: '2026-05-15T00:00:00.000Z',
    completedAt: null,
    mySignPending: true,
    myParty: 'buyer',
    ...over,
  };
}

describe('ContractList', () => {
  it('빈 배열이면 EmptyState 문구를 렌더한다', () => {
    render(<ContractList items={[]} />);
    expect(screen.getByText('아직 전자계약이 없어요')).toBeInTheDocument();
  });

  it('항목이 있으면 code·title·상대방·상태칩을 렌더하고 /contracts/{id} 로 링크한다', () => {
    render(<ContractList items={[entry({ status: 'completed', mySignPending: false })]} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/contracts/doc-1');
    expect(screen.getByText('CT-2605-0001')).toBeInTheDocument();
    expect(screen.getByText('결제대행 계약')).toBeInTheDocument();
    expect(screen.getByText('(주)테스트')).toBeInTheDocument();
    expect(screen.getByText('서명 완료')).toBeInTheDocument();
  });

  it('여러 항목을 각각 렌더한다', () => {
    render(
      <ContractList
        items={[
          entry({ id: 'doc-1', code: 'CT-2605-0001' }),
          entry({ id: 'doc-2', code: 'CT-2605-0002', status: 'declined', mySignPending: false }),
        ]}
      />,
    );
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByText('CT-2605-0001')).toBeInTheDocument();
    expect(screen.getByText('CT-2605-0002')).toBeInTheDocument();
  });
});
