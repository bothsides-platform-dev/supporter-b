// RfpDetailContent — 구매사 상세 본문(전체 페이지·모달 공유). loader 산출물을 받아
// 헤더 + 제안비교 + 첨부 + meta 를 그린다. 자체 로직은 '수주 처리' 링크 조건뿐.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// 무거운 자식 트리(비교표/칸반·초대관리·첨부 미리보기)는 이 컴포넌트의 책임이
// 아니다 — 자체 단위 테스트가 따로 있다. 여기선 합성+조건 분기만 검증.
vi.mock('../BidComparisonView', () => ({
  BidComparisonView: () => <div data-testid="bid-comparison" />,
}));
vi.mock('../RfpInviteManager', () => ({
  RfpInviteManager: () => <div data-testid="invite-manager" />,
}));
vi.mock('../RfpBoardVisibilityToggle', () => ({
  RfpBoardVisibilityToggle: () => <div data-testid="board-visibility-toggle" />,
}));
vi.mock('../RfpPendingRequests', () => ({
  RfpPendingRequests: ({ requests }: { requests: { id: string }[] }) => (
    <div data-testid="pending-requests">{requests.length}</div>
  ),
}));
vi.mock('@/components/attachments/AttachmentPreviewList', () => ({
  AttachmentPreviewList: () => <div data-testid="attachments" />,
}));

import { RfpDetailContent } from '../RfpDetailContent';
import type { BuyerRfpDetailData } from '@/lib/server/rfp-detail-loader';
import type { RFP } from '@/lib/types/rfp';
import type { Bid } from '@/lib/types/bid';

const baseRfp: RFP = {
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

const aBid: Bid = {
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
};

function buildData(over?: Partial<BuyerRfpDetailData>): BuyerRfpDetailData {
  return {
    rfp: baseRfp,
    bids: [aBid],
    notesByBid: {},
    rfpFiles: [],
    companyName: '구매사',
    inviteList: [],
    pgWsNameMap: {},
    pendingRequests: [],
    canEdit: true,
    shareUrl: '',
    authorId: 'u1',
    authorName: '담당자',
    ...over,
  };
}

afterEach(cleanup);

describe('RfpDetailContent', () => {
  it('RFP code·제목·상태칩을 그린다', () => {
    render(<RfpDetailContent data={buildData()} />);
    expect(screen.getByText('P-2605-0042')).toBeInTheDocument();
    expect(screen.getByText('결제대행 RFP')).toBeInTheDocument();
    expect(screen.getByText('요청 보냄')).toBeInTheDocument();
  });

  it("status='sent' 이고 제출 입찰이 있으면 '최종 선택' 링크 노출", () => {
    render(<RfpDetailContent data={buildData({ bids: [aBid] })} />);
    const link = screen.getByRole('link', { name: /최종 선택/ });
    expect(link).toHaveAttribute('href', '/rfp/P-2605-0042/award');
  });

  it('제출 입찰이 없으면 최종 선택 링크 미노출', () => {
    render(<RfpDetailContent data={buildData({ bids: [] })} />);
    expect(screen.queryByText(/최종 선택/)).not.toBeInTheDocument();
  });

  it('"현재 정산한도" 라벨이 "현재 월 정산한도"로 변경됐다', () => {
    render(<RfpDetailContent data={buildData({ rfp: { ...baseRfp, currentSettlementLimit: '월 1억' } })} />);
    expect(screen.queryByText('현재 정산한도')).not.toBeInTheDocument();
    expect(screen.getByText('현재 월 정산한도')).toBeInTheDocument();
  });

  it('currentSolution=cafe24 이면 "카페24" 텍스트를 렌더한다', () => {
    render(<RfpDetailContent data={buildData({ rfp: { ...baseRfp, currentSolution: 'cafe24' } })} />);
    expect(screen.getByText('카페24')).toBeInTheDocument();
  });

  it('currentSolution=self + detail 이면 "자체 개발 (ABC몰)"을 렌더한다', () => {
    render(<RfpDetailContent data={buildData({ rfp: { ...baseRfp, currentSolution: 'self', currentSolutionDetail: 'ABC몰' } })} />);
    expect(screen.getByText('자체 개발 (ABC몰)')).toBeInTheDocument();
  });

  it('currentSolution=other + detail 이면 "기타 (커스텀솔루션)"을 렌더한다', () => {
    render(<RfpDetailContent data={buildData({ rfp: { ...baseRfp, currentSolution: 'other', currentSolutionDetail: '커스텀솔루션' } })} />);
    expect(screen.getByText('기타 (커스텀솔루션)')).toBeInTheDocument();
  });

  it('currentSolution 이 없으면 "현재 운영 솔루션" 행을 렌더하지 않는다', () => {
    render(<RfpDetailContent data={buildData()} />);
    expect(screen.queryByText('현재 운영 솔루션')).not.toBeInTheDocument();
  });

  it('게시판 노출 토글과 참여 요청 검토 목록을 함께 렌더한다', () => {
    render(
      <RfpDetailContent
        data={buildData({
          pendingRequests: [
            { id: 'r1', pgWsId: 'ws-toss', pgWsName: '토스', message: '제안합니다', createdAt: new Date().toISOString() },
          ],
        })}
      />,
    );
    expect(screen.getByTestId('board-visibility-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('pending-requests')).toHaveTextContent('1');
  });
});
