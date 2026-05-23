// PgRfpDetailContent — PG 상세 본문. myBid 유무로 분기:
//  - 있으면 "제출 완료" 블록 + 제출내역 링크
//  - 없으면 브리프 + BidForm
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('../RfpBriefPanel', () => ({
  RfpBriefPanel: () => <div data-testid="brief" />,
}));
const bidFormProps = vi.fn();
vi.mock('../BidForm', () => ({
  BidForm: (props: Record<string, unknown>) => {
    bidFormProps(props);
    return <div data-testid="bid-form" />;
  },
}));

import { PgRfpDetailContent } from '../PgRfpDetailContent';
import type { RFP } from '@/lib/types/rfp';
import type { Bid } from '@/lib/types/bid';

const rfp: RFP = {
  id: 'rfp-1',
  code: 'P-2605-0042',
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

const myBid: Bid = {
  id: 'bid-1',
  rfpId: 'rfp-1',
  pgWsId: 'ws-toss',
  invitationId: 'inv-1',
  settleCycle: 'D+1',
  deposit: 0,
  setupFee: 0,
  monthlyMin: 0,
  bankTransferFeePct: 0.005,
  easyPayFeePct: 0.018,
  proposalPdfs: [],
  status: 'submitted',
  submittedBy: 'pg-user',
  submittedAt: new Date().toISOString(),
};

afterEach(() => {
  cleanup();
  bidFormProps.mockClear();
});

describe('PgRfpDetailContent', () => {
  it('myBid 있으면 제출 완료 블록 + 제출내역 링크, 폼 없음', () => {
    render(<PgRfpDetailContent data={{ rfp, myBid }} />);
    expect(screen.getByText(/제안 제출 완료/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /제출 내역 보기/ })).toHaveAttribute(
      'href',
      '/inbox/P-2605-0042/submitted',
    );
    expect(screen.queryByTestId('bid-form')).not.toBeInTheDocument();
  });

  it('myBid 없으면 브리프 + BidForm 노출', () => {
    render(<PgRfpDetailContent data={{ rfp, myBid: undefined }} />);
    expect(screen.getByTestId('brief')).toBeInTheDocument();
    expect(screen.getByTestId('bid-form')).toBeInTheDocument();
    expect(screen.queryByText(/제안 제출 완료/)).not.toBeInTheDocument();
  });

  it('BidForm 에 rfpId·rfpCode 를 전달', () => {
    render(<PgRfpDetailContent data={{ rfp, myBid: undefined }} />);
    expect(bidFormProps).toHaveBeenCalledWith(
      expect.objectContaining({ rfpId: 'rfp-1', rfpCode: 'P-2605-0042' }),
    );
  });
});
