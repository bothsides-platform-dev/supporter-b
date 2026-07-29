// PgDealRoomBody — PG 딜룸 본문(레일 + 탭).
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/components/deal-room/signing/SigningTab', () => ({
  SigningTab: (p: { side: string; rfpCode: string }) => (
    <div data-testid="signing-tab" data-side={p.side} data-rfp={p.rfpCode} />
  ),
}));
vi.mock('@/components/deal-room/signing/AwardContextLine', () => ({
  AwardContextLine: (p: { workspaceName: string; contactName?: string; counterpartyWsId?: string }) => (
    <div
      data-testid="award-context"
      data-ws-name={p.workspaceName}
      data-contact={p.contactName}
      data-counterparty={p.counterpartyWsId}
    />
  ),
}));

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
    signingTemplates: [],
    awardedBidSigningTemplateId: null,
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

import type { SigningView } from '@/lib/types/signing';

function signingView(status: SigningView['contract']['status'] = 'awaiting_pg_template'): SigningView {
  return {
    contract: {
      id: 'c1',
      rfpId: 'r1',
      status,
      round: 1,
      createdBy: 'u',
      createdAt: '2026-07-20T04:40:00Z',
    },
    participants: [],
  };
}

describe('PgDealRoomBody — 계약 탭', () => {
  const awarded = (over: Partial<PgRfpDetailData> = {}) =>
    buildData({
      rfp: { ...baseRfp, status: 'awarded' },
      myBid: submittedBid,
      awardedToMe: true,
      buyerContact: {
        workspaceName: '(주)테스트',
        name: '구매 담당자',
        email: 'buyer@buy.com',
        phone: null,
      },
      ...over,
    });

  it('선정 + signing 이면 계약 탭이 첫 번째이고 기본으로 열리며 pg side + 올바른 rfpCode 로 렌더된다', () => {
    render(<PgDealRoomBody data={awarded({ signing: signingView() })} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveTextContent('계약');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    const signingTab = screen.getByTestId('signing-tab');
    expect(signingTab).toHaveAttribute('data-side', 'pg');
    expect(signingTab).toHaveAttribute('data-rfp', baseRfp.code);
  });

  it('signing 이 없으면 계약 탭이 없고 견적 작성이 기본이다', () => {
    render(<PgDealRoomBody data={awarded()} />);
    expect(screen.queryByRole('tab', { name: /계약/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '견적 작성' })).toHaveAttribute('aria-selected', 'true');
  });

  it('견적 작성 탭의 요약 스트립을 누르면 계약 탭으로 간다', async () => {
    const user = userEvent.setup();
    render(<PgDealRoomBody data={awarded({ signing: signingView() })} />);
    await user.click(screen.getByRole('tab', { name: '견적 작성' }));
    // SigningTab 은 목이지만 SigningSummaryStrip 은 실제 컴포넌트라 side='pg' 로
    // 파생된 실제 상태 라벨(awaiting_pg_template → '계약서 보내기 전')을 그린다 —
    // side 배선의 두 번째(무료) 검증. 레일의 계약 버튼도 같은 라벨을 sr-only 로
    // 갖고 있어(Fix 8) getByText 는 모호해지므로 스트립 버튼으로 좁혀 조회한다.
    const strip = screen.getByRole('button', { name: /전자서명/ });
    expect(strip).toHaveTextContent('계약서 보내기 전');
    await user.click(strip);
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('signing-tab')).toHaveAttribute('data-side', 'pg');
  });

  it('계약 탭 상단 줄에 구매사 워크스페이스 id 를 상대로 전달한다', () => {
    render(<PgDealRoomBody data={awarded({ signing: signingView() })} />);
    const ctx = screen.getByTestId('award-context');
    expect(ctx).toHaveAttribute('data-counterparty', baseRfp.buyerWsId);
    expect(ctx).toHaveAttribute('data-ws-name', '(주)테스트');
  });

  it('레일의 계약 상태 점은 서명 진행 상태에 따라 색이 바뀐다', () => {
    render(<PgDealRoomBody data={awarded({ signing: signingView('in_progress') })} />);
    expect(screen.getByTestId('rail-dot').getAttribute('style')).toContain(
      '--md-sys-color-primary',
    );
    cleanup();
    render(<PgDealRoomBody data={awarded({ signing: signingView('awaiting_pg_template') })} />);
    expect(screen.getByTestId('rail-dot').getAttribute('style')).toContain(
      '--md-sys-color-warning',
    );
  });

  it('레일의 계약 버튼은 상태 점의 색과 같은 정보를 접근성 이름(sr-only)에도 싣는다 — 요청조건·첨부 탭엔 SigningSummaryStrip 이 없어 색만으로는 스크린리더에 전달되지 않는다', () => {
    render(<PgDealRoomBody data={awarded({ signing: signingView('in_progress') })} />);
    expect(screen.getByRole('button', { name: '계약 서명 진행 중' })).toBeInTheDocument();
    cleanup();
    render(<PgDealRoomBody data={awarded({ signing: signingView('awaiting_pg_template') })} />);
    expect(screen.getByRole('button', { name: '계약 계약서 보내기 전' })).toBeInTheDocument();
  });

  it('미선정 PG 는 signing 이 (오류로) 채워져 있어도 계약 탭을 보지 못한다(봉인입찰 방어)', () => {
    render(
      <PgDealRoomBody
        data={awarded({ awardedToMe: false, buyerContact: null, signing: signingView() })}
      />,
    );
    expect(screen.queryByRole('tab', { name: /계약/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('signing-tab')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '견적 작성' })).toHaveAttribute('aria-selected', 'true');
  });
});
