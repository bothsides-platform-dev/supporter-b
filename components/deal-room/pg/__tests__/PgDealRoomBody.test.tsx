// PgDealRoomBody — PG 딜룸 본문(레일 + 탭).
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Element.prototype.scrollIntoView = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

vi.mock('@/components/inbox/RfpBriefPanel', () => ({ RfpBriefPanel: () => <div data-testid="brief" /> }));
vi.mock('@/components/inbox/bid-wizard/BidWizard', () => ({ BidWizard: () => <div data-testid="bid-wizard" /> }));
vi.mock('@/components/inbox/RequoteBanner', () => ({ RequoteBanner: () => <div data-testid="requote-banner" /> }));
vi.mock('@/components/attachments/AttachmentPreviewList', () => ({ AttachmentPreviewList: () => <div data-testid="attachments" /> }));
vi.mock('@/lib/server/actions/bid/withdrawBidAction', () => ({ withdrawBidAction: vi.fn() }));

// useIsLgUp mock — PgDealRoomBody 자신은 lgUp 을 쓰지 않지만
// DealRoomActionRail/Center 가 렌더되는 컨텍스트에서 안전하게 고정.
const mq = vi.hoisted(() => ({ lgUp: true }));
vi.mock('@/lib/hooks/useIsLgUp', () => ({ useIsLgUp: () => mq.lgUp }));

import { PgDealRoomBody } from '../PgDealRoomBody';
import type { PgRfpDetailData } from '@/lib/server/rfp-detail-loader';
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

function buildData(over?: Partial<PgRfpDetailData>): PgRfpDetailData {
  return {
    rfp: baseRfp,
    myBid: undefined,
    buyerName: '(주)테스트',
    buyerLogoUpdatedAt: null,
    quoteTemplates: [],
    pendingRequote: null,
    awardedToMe: false,
    buyerContact: null,
    signing: null,
    ...over,
  };
}

afterEach(cleanup);
afterEach(() => { mq.lgUp = true; });

const submittedBid: Bid = {
  id: 'b1',
  rfpId: 'rfp-1',
  pgWsId: 'ws-pg',
  invitationId: 'inv1',
  settleCycle: 'D+1',
  settleLimit: 0,
  guaranteeInsurance: 0,
  signupFee: 0,
  paymentFees: { card: 1.5 },
  customFees: {},
  proposalPdfs: [],
  status: 'submitted',
  submittedBy: 'pg-u',
  submittedAt: new Date().toISOString(),
  round: 1,
};

describe('PgDealRoomBody — 제출 완료 상태', () => {
  it('myBid 있으면 제출 완료 안내 + 접이식 SubmittedSummary 를 같은 창에서 보여준다', () => {
    render(<PgDealRoomBody data={buildData({ myBid: submittedBid })} />);
    expect(screen.getByText(/견적을 보냈어요/)).toBeInTheDocument();
    // SubmittedSummary 의 '보낸 내용 보기' 토글이 인라인으로 — /submitted 페이지로 안 나감.
    expect(screen.getByRole('button', { name: /보낸 내용 보기/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /보낸 견적 보기/ })).not.toBeInTheDocument();
  });
});

describe('PgDealRoomBody — 소형 화면 레이아웃', () => {
  it('lg 미만에서 DealRoomCenter 콘텐츠가 DOM 에 존재한다', () => {
    mq.lgUp = false;
    render(<PgDealRoomBody data={buildData()} />);
    // BidWizard 는 '견적 작성' 탭의 기본 콘텐츠 — 소형 화면에서도 보여야 한다.
    expect(screen.getByTestId('bid-wizard')).toBeInTheDocument();
  });
});

describe('PgDealRoomBody — 선정 결과 안내', () => {
  const buyerContact = { workspaceName: '(주)테스트', name: '구매 담당자', email: 'buyer@buy.com', phone: null };

  it('awardedToMe 면 견적 작성 탭에 선정 결과 헤더 + 구매사 연락처를 보여준다', () => {
    render(<PgDealRoomBody data={buildData({
      rfp: { ...baseRfp, status: 'awarded' },
      myBid: submittedBid,
      awardedToMe: true,
      buyerContact,
    })} />);
    expect(screen.getByText('이 견적이 선정됐어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /buyer@buy\.com/ })).toBeInTheDocument();
    // 보낸 내용은 계속 확인 가능.
    expect(screen.getByRole('button', { name: /보낸 내용 보기/ })).toBeInTheDocument();
  });

  it('타사 선정(awarded, awardedToMe=false)이면 미선정 결과 헤더 + 연락처 없음 + BidWizard 미노출', () => {
    render(<PgDealRoomBody data={buildData({
      rfp: { ...baseRfp, status: 'awarded' },
      myBid: submittedBid,
      awardedToMe: false,
      buyerContact: null,
    })} />);
    expect(screen.getByText('이번엔 선정되지 않았어요')).toBeInTheDocument();
    expect(screen.queryByText('이 견적이 선정됐어요')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bid-wizard')).not.toBeInTheDocument();
  });

  it('미선정 분기는 buyerContact 가 (오류로) 채워져 있어도 연락처를 렌더하지 않는다(봉인입찰 방어)', () => {
    render(<PgDealRoomBody data={buildData({
      rfp: { ...baseRfp, status: 'awarded' },
      myBid: submittedBid,
      awardedToMe: false,
      buyerContact: { workspaceName: '(주)테스트', name: '구매 담당자', email: 'buyer@buy.com', phone: '010-1111-2222' },
    })} />);
    expect(screen.getByText('이번엔 선정되지 않았어요')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /buyer@buy\.com/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /010-1111-2222/ })).not.toBeInTheDocument();
  });

  it('선정 전(sent)에는 결과 헤더를 렌더하지 않는다', () => {
    render(<PgDealRoomBody data={buildData({ myBid: submittedBid })} />);
    expect(screen.queryByText('이 견적이 선정됐어요')).not.toBeInTheDocument();
    expect(screen.queryByText('이번엔 선정되지 않았어요')).not.toBeInTheDocument();
  });
});
