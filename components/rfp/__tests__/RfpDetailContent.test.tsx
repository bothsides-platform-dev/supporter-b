// RfpDetailContent — 구매사 상세 본문. 새 IA: 헤더 → 아코디언('내가 요청한 조건') →
// FocusComparison → 아코디언('PG 초대 · 게시판 노출 관리'). 자체 책임은 합성 + 아코디언
// 기본 펼침 규칙(받은 견적 0건 또는 콜드피치 대기 > 0 → PG 관리 자동 펼침 + 배지)이다.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

// 무거운 자식 트리는 이 컴포넌트의 책임이 아니다 — 각자 단위 테스트가 있다.
vi.mock('../comparison/FocusComparison', () => ({
  FocusComparison: () => <div data-testid="focus-comparison" />,
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

  it('견적 비교(FocusComparison)를 렌더하고, 별도 "최종 선택" 링크는 더 이상 없다', () => {
    render(<RfpDetailContent data={buildData()} />);
    expect(screen.getByTestId('focus-comparison')).toBeInTheDocument();
    expect(screen.queryByText(/최종 선택/)).not.toBeInTheDocument();
  });

  it("'내가 요청한 조건' 아코디언은 기본 접힘이며, 펼치면 사업 운영 정보를 보여준다", async () => {
    render(
      <RfpDetailContent data={buildData({ rfp: { ...baseRfp, currentSolution: 'cafe24' } })} />,
    );
    // 접힌 상태 — 솔루션 라벨 미마운트
    expect(screen.queryByText('카페24')).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /내가 요청한 조건/ }));
    expect(await screen.findByText('카페24')).toBeInTheDocument();
  });

  it("펼친 '내가 요청한 조건'에서 '현재 월 정산한도' 라벨을 쓴다", async () => {
    render(
      <RfpDetailContent
        data={buildData({ rfp: { ...baseRfp, currentSettlementLimit: '월 1억' } })}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /내가 요청한 조건/ }));
    expect(await screen.findByText('현재 월 정산한도')).toBeInTheDocument();
    expect(screen.queryByText('현재 정산한도')).not.toBeInTheDocument();
  });

  it('받은 견적이 있고 대기 요청이 없으면 PG 관리 아코디언은 기본 접힘', () => {
    render(<RfpDetailContent data={buildData({ bids: [aBid], pendingRequests: [] })} />);
    expect(screen.queryByTestId('invite-manager')).not.toBeInTheDocument();
  });

  it('콜드피치 대기 요청이 있으면 PG 관리 아코디언을 자동으로 펼치고 대기 배지를 단다', () => {
    render(
      <RfpDetailContent
        data={buildData({
          pendingRequests: [
            { id: 'r1', pgWsId: 'ws-toss', pgWsName: '토스', message: '제안합니다', createdAt: new Date().toISOString() },
          ],
        })}
      />,
    );
    expect(screen.getByText('대기 1건')).toBeInTheDocument();
    expect(screen.getByTestId('invite-manager')).toBeInTheDocument();
    expect(screen.getByTestId('pending-requests')).toHaveTextContent('1');
  });

  it('받은 견적이 0건이면 PG 관리 아코디언을 자동으로 펼친다', () => {
    render(<RfpDetailContent data={buildData({ bids: [] })} />);
    expect(screen.getByTestId('invite-manager')).toBeInTheDocument();
  });
});
