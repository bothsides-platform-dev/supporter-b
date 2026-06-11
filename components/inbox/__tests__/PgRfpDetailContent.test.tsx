// PgRfpDetailContent — PG 상세 본문. variant + myBid 로 분기:
//  - myBid 있으면 "제출 완료" 블록 + 제출내역 링크 (peek/full 공통)
//  - 미제출 + variant="full" → BidWizard (전체 페이지)
//  - 미제출 + variant="peek"(기본) → 브리프 + "견적 작성" CTA (인박스 peek 오버레이)
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('../RfpBriefPanel', () => ({
  RfpBriefPanel: () => <div data-testid="brief" />,
}));
const bidWizardProps = vi.fn();
vi.mock('../bid-wizard/BidWizard', () => ({
  BidWizard: (props: Record<string, unknown>) => {
    bidWizardProps(props);
    return <div data-testid="bid-wizard" />;
  },
}));
vi.mock('../SamplePgRfpBanner', () => ({
  SamplePgRfpBanner: ({ rfpCode }: { rfpCode: string }) => (
    <div data-testid="sample-banner">{rfpCode}</div>
  ),
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
  requiredPaymentMethods: [],
  customPaymentMethods: [],
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
  settleLimit: 0,
  guaranteeInsurance: 0,
  paymentFees: {},
  customFees: {},
  proposalPdfs: [],
  status: 'submitted',
  submittedBy: 'pg-user',
  submittedAt: new Date().toISOString(),
};

afterEach(() => {
  cleanup();
  bidWizardProps.mockClear();
});

describe('PgRfpDetailContent', () => {
  it('myBid 있으면 제출 완료 블록 + 보낸 견적 보기 링크, 위저드 없음', () => {
    render(<PgRfpDetailContent data={{ rfp, myBid, buyerName: '(주)테스트', quoteTemplates: [] }} />);
    expect(screen.getByText(/견적을 보냈어요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /보낸 견적 보기/ })).toHaveAttribute(
      'href',
      '/inbox/P-2605-0042/submitted',
    );
    expect(screen.queryByTestId('bid-wizard')).not.toBeInTheDocument();
  });

  it('variant="full" 미제출 시 BidWizard 렌더 + rfp·buyerName 전달', () => {
    render(
      <PgRfpDetailContent
        data={{ rfp, myBid: undefined, buyerName: '(주)테스트', quoteTemplates: [] }}
        variant="full"
      />,
    );
    expect(screen.getByTestId('bid-wizard')).toBeInTheDocument();
    expect(bidWizardProps).toHaveBeenCalledWith(
      expect.objectContaining({ rfp: expect.objectContaining({ id: 'rfp-1' }), buyerName: '(주)테스트' }),
    );
  });

  it('variant="peek"(기본) 미제출 시 브리프 + 견적 작성 CTA, 위저드 없음', () => {
    render(<PgRfpDetailContent data={{ rfp, myBid: undefined, buyerName: '(주)테스트', quoteTemplates: [] }} />);
    expect(screen.getByTestId('brief')).toBeInTheDocument();
    expect(screen.queryByTestId('bid-wizard')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /견적 작성/ })).toHaveAttribute('href', '/inbox/P-2605-0042');
  });

  it('isSample 면 샘플 배너를 위저드와 함께 보여준다 (full)', () => {
    render(
      <PgRfpDetailContent
        data={{ rfp: { ...rfp, isSample: true }, myBid: undefined, buyerName: '샘플 쇼핑몰', quoteTemplates: [] }}
        variant="full"
      />,
    );
    expect(screen.getByTestId('sample-banner')).toBeInTheDocument();
    expect(screen.getByTestId('bid-wizard')).toBeInTheDocument();
  });

  it('isSample 면 제출 완료 화면에도 샘플 배너를 보여준다', () => {
    render(
      <PgRfpDetailContent
        data={{ rfp: { ...rfp, isSample: true }, myBid, buyerName: '샘플 쇼핑몰', quoteTemplates: [] }}
      />,
    );
    expect(screen.getByTestId('sample-banner')).toBeInTheDocument();
  });

  it('isSample 아니면 샘플 배너 없음', () => {
    render(
      <PgRfpDetailContent
        data={{ rfp, myBid: undefined, buyerName: '(주)테스트', quoteTemplates: [] }}
        variant="full"
      />,
    );
    expect(screen.queryByTestId('sample-banner')).not.toBeInTheDocument();
  });
});
