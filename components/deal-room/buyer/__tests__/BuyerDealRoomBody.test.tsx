// BuyerDealRoomBody — 구매사 딜룸 본문(레일 + 탭).
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render as rtlRender, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';

vi.mock('@/components/deal-room/signing/SigningTab', () => ({
  SigningTab: () => <div data-testid="signing-tab" />,
}));
vi.mock('@/components/deal-room/signing/AwardContextLine', () => ({
  AwardContextLine: () => <div data-testid="award-context" />,
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Element.prototype.scrollIntoView = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

// 무거운 자식 트리·server-action 정적 임포트(next-auth 체인)는 각자 테스트가 커버 — 목.
vi.mock('@/components/rfp/comparison/FocusComparison', () => ({
  FocusComparison: () => <div data-testid="focus-comparison" />,
}));
vi.mock('@/components/rfp/RequestConditionsView', () => ({
  RequestConditionsView: () => <div data-testid="request-conditions" />,
}));
vi.mock('@/components/rfp/RfpInviteManager', () => ({
  RfpInviteManager: () => <div data-testid="invite-manager" />,
}));
vi.mock('@/components/rfp/RfpBoardVisibilityStatus', () => ({
  RfpBoardVisibilityStatus: () => <div data-testid="board-visibility-status" />,
}));
vi.mock('@/components/rfp/RfpPendingRequests', () => ({
  RfpPendingRequests: () => <div data-testid="pending-requests" />,
}));
vi.mock('@/components/attachments/AttachmentPreviewList', () => ({
  AttachmentPreviewList: () => <div data-testid="attachments" />,
}));
vi.mock('@/components/rfp/comparison/AwardConfirmDialog', () => ({
  AwardConfirmDialog: () => null,
}));
vi.mock('@/components/rfp/comparison/RequoteDialog', () => ({
  RequoteDialog: () => null,
}));
vi.mock('@/lib/server/actions/rfp', () => ({
  closeRfpAction: vi.fn(),
  cancelRfpAction: vi.fn(),
}));

const mq = vi.hoisted(() => ({ lgUp: true }));
vi.mock('@/lib/hooks/useIsLgUp', () => ({ useIsLgUp: () => mq.lgUp }));

import { BuyerDealRoomBody } from '../BuyerDealRoomBody';
import { DealRoomProvider } from '@/components/deal-room/DealRoomContext';
import type { BuyerRfpDetailData } from '@/lib/server/rfp-detail-loader';
import type { RFP } from '@/lib/types/rfp';
import type { Bid } from '@/lib/types/bid';

// BuyerDealRoomBody 는 useDealRoom() 으로 포커스 PG 를 읽으므로 Provider 안에서 렌더한다.
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: DealRoomProvider });

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
  signupFee: 0,
  paymentFees: {},
  customFees: {},
  proposalPdfs: [],
  status: 'submitted',
  submittedBy: 'pg-user',
  round: 1,
};

function buildData(over?: Partial<BuyerRfpDetailData>): BuyerRfpDetailData {
  return {
    rfp: baseRfp,
    bids: [aBid],
    rfpFiles: [],
    companyName: '구매사',
    inviteList: [],
    pgWsNameMap: {},
    pgWsLogoUpdatedAtMap: {},
    pendingRequests: [],
    canEdit: true,
    authorId: 'u1',
    authorName: '담당자',
    requoteByPg: {},
    priorBidByPg: {},
    awardedPgContact: null,
    signing: null,
    ...over,
  };
}

afterEach(cleanup);
afterEach(() => { mq.lgUp = true; });

describe('BuyerDealRoomBody — 소형 화면 레이아웃', () => {
  it('lg 미만에서 DealRoomCenter 콘텐츠가 DOM 에 존재한다', () => {
    mq.lgUp = false;
    render(<BuyerDealRoomBody data={buildData()} />);
    // FocusComparison 은 '견적 비교' 탭의 기본 콘텐츠.
    expect(screen.getByTestId('focus-comparison')).toBeInTheDocument();
  });
});

describe('BuyerDealRoomBody — 선정 결과 패널', () => {
  const awardedPgContact = { workspaceName: '토스페이먼츠', name: '김영업', email: 'sales@toss.im', phone: '010-1234-5678' };

  it('awarded + awardedPgContact 면 "<PG>를 선정했어요" 결과 패널 + 연락처를 렌더한다', () => {
    render(<BuyerDealRoomBody data={buildData({
      rfp: { ...baseRfp, status: 'awarded' },
      awardedPgContact,
    })} />);
    expect(screen.getByText(/토스페이먼츠를 선정했어요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sales@toss\.im/ })).toBeInTheDocument();
  });

  it('sent(선정 전)에는 결과 패널을 렌더하지 않는다', () => {
    render(<BuyerDealRoomBody data={buildData()} />);
    expect(screen.queryByText(/선정했어요/)).not.toBeInTheDocument();
  });

  it('awarded 면 "담당처와 연락을 이어나가보세요." 부제목을 렌더한다', () => {
    render(<BuyerDealRoomBody data={buildData({
      rfp: { ...baseRfp, status: 'awarded' },
      awardedPgContact,
    })} />);
    expect(screen.getByText('담당처와 연락을 이어나가보세요.')).toBeInTheDocument();
  });

  it('awarded 면 연락처 이메일 링크가 견적 비교 탭 콘텐츠 영역에 위치한다', () => {
    const { container } = render(<BuyerDealRoomBody data={buildData({
      rfp: { ...baseRfp, status: 'awarded' },
      awardedPgContact,
    })} />);
    const focusComp = container.querySelector('[data-testid="focus-comparison"]')!;
    const emailLink = screen.getByRole('link', { name: /sales@toss\.im/ });
    expect(focusComp.parentElement).toContainElement(emailLink as HTMLElement);
  });

  it('awarded 면 선정 제목·안내 문구가 견적 비교 탭(연락처 카드와 같은 영역)에 렌더된다', () => {
    const { container } = render(<BuyerDealRoomBody data={buildData({
      rfp: { ...baseRfp, status: 'awarded' },
      awardedPgContact,
    })} />);
    const focusComp = container.querySelector('[data-testid="focus-comparison"]')!;
    expect(focusComp.parentElement).toContainElement(
      screen.getByText(/토스페이먼츠를 선정했어요/),
    );
    expect(focusComp.parentElement).toContainElement(
      screen.getByText('담당처와 연락을 이어나가보세요.'),
    );
  });
});

import type { SigningView } from '@/lib/types/signing';

function signingView(): SigningView {
  return {
    contract: {
      id: 'c1',
      rfpId: 'r1',
      status: 'in_progress',
      round: 1,
      createdBy: 'u',
      createdAt: '2026-07-20T04:40:00Z',
    },
    participants: [],
  };
}

describe('BuyerDealRoomBody — 계약 탭', () => {
  it('signing 이 없으면 계약 탭이 없고 견적 비교가 기본이다', () => {
    render(<BuyerDealRoomBody data={buildData()} />);
    expect(screen.queryByRole('tab', { name: /계약/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '견적 비교' })).toHaveAttribute('aria-selected', 'true');
  });

  it('signing 이 있으면 계약 탭이 첫 번째이고 기본으로 열린다', () => {
    render(<BuyerDealRoomBody data={buildData({ signing: signingView() })} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveTextContent('계약');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('signing-tab')).toBeInTheDocument();
  });

  it('견적 비교 탭의 요약 스트립을 누르면 계약 탭으로 간다', async () => {
    const user = userEvent.setup();
    render(<BuyerDealRoomBody data={buildData({ signing: signingView() })} />);
    await user.click(screen.getByRole('tab', { name: '견적 비교' }));
    await user.click(screen.getByRole('button', { name: /전자서명/ }));
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('signing-tab')).toBeInTheDocument();
  });
});
