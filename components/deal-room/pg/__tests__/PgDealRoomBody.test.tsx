// PgDealRoomBody — PG 딜룸 본문(탭).
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, within, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/components/deal-room/signing/SigningTab', () => ({
  SigningTab: (p: {
    side: string;
    rfpCode: string;
    buyerSigner?: { name: string; email: string } | null;
    linkedSigningTemplate?: { name: string; kind: 'pdf' | 'composed' } | null;
  }) => (
    <div
      data-testid="signing-tab"
      data-side={p.side}
      data-rfp={p.rfpCode}
      data-buyer-signer={p.buyerSigner?.email ?? ''}
      data-linked-template={p.linkedSigningTemplate?.name ?? ''}
      data-linked-kind={p.linkedSigningTemplate?.kind ?? ''}
    />
  ),
}));
vi.mock('@/components/deal-room/signing/AwardContextLine', () => ({
  AwardContextLine: (p: {
    workspaceName: string;
    contactName?: string;
    counterpartyWsId?: string;
  }) => (
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

const navigation = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

vi.mock('@/components/inbox/RfpBriefPanel', () => ({
  RfpBriefPanel: ({ rfp }: { rfp: { deadline: string } }) => (
    <div data-testid="brief">{rfp.deadline}</div>
  ),
}));
vi.mock('@/components/inbox/bid-wizard/BidWizard', () => ({
  BidWizard: () => <div data-testid="bid-wizard" />,
}));
vi.mock('@/components/inbox/RequoteBanner', () => ({
  RequoteBanner: () => <div data-testid="requote-banner" />,
}));
vi.mock('@/components/attachments/AttachmentPreviewList', () => ({
  AttachmentPreviewList: () => <div data-testid="attachments" />,
}));
vi.mock('@/lib/server/actions/bid/withdrawBidAction', () => ({
  withdrawBidAction: vi.fn(),
}));

// useIsLgUp mock — PG 딜룸에서 반응형 콘텐츠를 그리는 컨텍스트에 고정.
const mq = vi.hoisted(() => ({ lgUp: true }));
vi.mock('@/lib/hooks/useIsLgUp', () => ({ useIsLgUp: () => mq.lgUp }));

import { PgDealRoomBody } from '../PgDealRoomBody';
import { pgDealRoomShowsBidWizard } from '@/lib/rfp/pg-bid-wizard-visibility';
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
    bidWindowOpen: true,
    myBid: undefined,
    buyer: { id: 'ws-buyer', name: '(주)테스트', type: 'buyer' as const, logoUpdatedAt: null },
    quoteTemplates: [],
    pendingRequote: null,
    awardedToMe: false,
    buyerContact: null,
    signing: null,
    signingTemplates: [],
    linkedSigningTemplate: null,
    ...over,
  };
}

afterEach(cleanup);
afterEach(() => { mq.lgUp = true; });
afterEach(() => { vi.useRealTimers(); });
afterEach(() => { navigation.refresh.mockClear(); navigation.push.mockClear(); });

// 기본 탭은 '요청 조건'이고 DealRoomCenter 는 활성 탭만 마운트한다 — 견적 작성 탭의
// 콘텐츠(부재 포함)를 단언하려면 먼저 그 탭을 연다. 안 열면 부재 단언이 거저 통과한다.
function openWriteTab() {
  fireEvent.click(
    screen.getByRole('tab', { name: /^(견적 작성|보낸 견적|견적 결과)$/ }),
  );
}

// 계약 탭도 기본이 아니다 — 지연 마운트라 SigningTab 을 보려면 먼저 연다.
function openContractTab() {
  fireEvent.click(screen.getByRole('tab', { name: /^계약/ }));
}

it('맞춤 상담 견적 철회 전에 재제출 불가와 다음 PG 상담을 알린다', async () => {
  const { withdrawBidAction } = await import('@/lib/server/actions/bid/withdrawBidAction');
  vi.mocked(withdrawBidAction).mockClear();
  render(<PgDealRoomBody data={buildData({ myBid: submittedBid, review: { id: 'review-1', status: 'quoted', reason: '' } })} />);
  const user = userEvent.setup();
  openWriteTab();
  await user.click(screen.getByRole('button', { name: '견적 철회' }));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('이 상담에는 다시 견적을 보낼 수 없어요');
  expect(dialog).toHaveTextContent('다른 PG사에 상담을 요청할 수 있어요');
  expect(dialog).toHaveTextContent('수정이 필요하면 구매사에게 견적 재요청을 부탁해주세요');
  await user.click(within(dialog).getByRole('button', { name: '닫기' }));
  expect(withdrawBidAction).not.toHaveBeenCalled();
});

it('기존 1:N 견적 철회에는 맞춤 상담의 영구 종료 안내를 붙이지 않는다', async () => {
  render(<PgDealRoomBody data={buildData({ myBid: submittedBid })} />);
  openWriteTab();
  await userEvent.setup().click(screen.getByRole('button', { name: '견적 철회' }));
  expect(screen.getByRole('dialog')).not.toHaveTextContent('이 상담에는 다시 견적을 보낼 수 없어요');
});

it('선정 후에는 실행할 수 없는 철회를 표시하지 않는다', () => {
  render(<PgDealRoomBody data={buildData({ rfp: { ...baseRfp, status: 'awarded' }, myBid: submittedBid, awardedToMe: true, bidWindowOpen: false })} />);
  openWriteTab();
  expect(screen.queryByRole('button', { name: /철회/ })).not.toBeInTheDocument();
});

describe('PgDealRoomBody — 탭 순서', () => {
  it('요청 조건이 견적 작성보다 앞에 오고 딜룸을 열면 요청 조건이 기본으로 열린다', () => {
    render(<PgDealRoomBody data={buildData()} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['요청 조건', '견적 작성', '첨부']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('brief')).toBeInTheDocument();
  });

  it('중복 레일 없이 상단 탭으로 모든 콘텐츠를 이동한다', () => {
    render(<PgDealRoomBody data={buildData()} />);
    expect(screen.queryByRole('navigation', { name: '견적 작업' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '견적 작성' }));
    expect(screen.getByRole('tab', { name: '견적 작성' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: '첨부' }));
    expect(screen.getByRole('tab', { name: '첨부' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: '요청 조건' }));
    expect(screen.getByRole('tab', { name: '요청 조건' })).toHaveAttribute('aria-selected', 'true');
  });
});

// 알림·메일 딥링크(?tab=)로 들어올 때만 기본 탭(요청 조건) 대신 그 탭을 연다.
describe('PgDealRoomBody — initialTab 딥링크', () => {
  const awardedWithSigning = (over: Partial<PgRfpDetailData> = {}) =>
    buildData({
      rfp: { ...baseRfp, status: 'awarded' },
      myBid: submittedBid,
      awardedToMe: true,
      signing: signingView(),
      ...over,
    });

  it("initialTab='contract' 이고 계약이 보이면 계약 탭으로 연다", () => {
    render(<PgDealRoomBody data={awardedWithSigning()} initialTab="contract" />);
    expect(screen.getByRole('tab', { name: /^계약/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('signing-tab')).toBeInTheDocument();
  });

  // 봉인입찰 방어 — 미선정 PG 가 계약 딥링크를 들고 와도 계약 탭이 생기지도 열리지도 않는다.
  it("미선정 PG 는 initialTab='contract' 여도 요청 조건으로 연다", () => {
    render(
      <PgDealRoomBody
        data={awardedWithSigning({ awardedToMe: false, buyerContact: null })}
        initialTab="contract"
      />,
    );
    expect(screen.queryByRole('tab', { name: /^계약/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '요청 조건' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('signing-tab')).not.toBeInTheDocument();
  });

  it("계약이 아직 없으면 initialTab='contract' 여도 요청 조건으로 연다", () => {
    render(<PgDealRoomBody data={awardedWithSigning({ signing: null })} initialTab="contract" />);
    expect(screen.getByRole('tab', { name: '요청 조건' })).toHaveAttribute('aria-selected', 'true');
  });

  it("initialTab='write' 면 견적 작성 탭으로 연다", () => {
    render(<PgDealRoomBody data={buildData()} initialTab="write" />);
    expect(screen.getByRole('tab', { name: '견적 작성' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('bid-wizard')).toBeInTheDocument();
  });
});

describe('PgDealRoomBody — 철회 위치', () => {
  it('미제출 견적에서는 철회를 표시하지 않는다', () => {
    render(<PgDealRoomBody data={buildData()} />);
    openWriteTab();
    expect(screen.queryByRole('button', { name: /철회/ })).not.toBeInTheDocument();
  });
  it('철회는 보낸 견적 안에서 확인 후 실행한다', async () => {
    const { withdrawBidAction } = await import('@/lib/server/actions/bid/withdrawBidAction');
    vi.mocked(withdrawBidAction).mockReset().mockResolvedValue({ ok: true });
    render(<PgDealRoomBody data={buildData({ myBid: submittedBid })} />);
    expect(screen.queryByRole('button', { name: /철회/ })).not.toBeInTheDocument();
    openWriteTab();
    await userEvent.setup().click(screen.getByRole('button', { name: '견적 철회' }));
    expect(withdrawBidAction).not.toHaveBeenCalled();
    await userEvent.setup().click(within(screen.getByRole('dialog')).getByRole('button', { name: '철회' }));
    expect(withdrawBidAction).toHaveBeenCalledWith({ bidId: 'b1' });
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });
});

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
    openWriteTab();
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
    openWriteTab();
    // BidWizard 는 '견적 작성' 탭의 콘텐츠 — 소형 화면에서도 보여야 한다.
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
    openWriteTab();
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
    openWriteTab();
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
    openWriteTab();
    expect(screen.getByText('이번엔 선정되지 않았어요')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /buyer@buy\.com/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /010-1111-2222/ })).not.toBeInTheDocument();
  });

  it('선정 전(sent)에는 결과 헤더를 렌더하지 않는다', () => {
    render(<PgDealRoomBody data={buildData({ myBid: submittedBid })} />);
    openWriteTab();
    expect(screen.queryByText('이 견적이 선정됐어요')).not.toBeInTheDocument();
    expect(screen.queryByText('이번엔 선정되지 않았어요')).not.toBeInTheDocument();
  });

  it('미제출 상태로 마감되면 견적 작성 대신 마감 안내를 보여준다', () => {
    render(<PgDealRoomBody data={buildData({
      rfp: { ...baseRfp, status: 'closed' },
      bidWindowOpen: false,
    })} />);
    openWriteTab();
    expect(screen.getByText('견적 요청이 마감됐어요')).toBeInTheDocument();
    expect(screen.queryByTestId('bid-wizard')).not.toBeInTheDocument();
  });

  it('상태 전이가 늦은 sent 요청도 마감일이 지났으면 마감 안내를 보여준다', () => {
    render(<PgDealRoomBody data={buildData({
      rfp: { ...baseRfp, status: 'sent' },
      bidWindowOpen: false,
    })} />);
    openWriteTab();
    expect(screen.getByText('견적 요청이 마감됐어요')).toBeInTheDocument();
    expect(screen.queryByTestId('bid-wizard')).not.toBeInTheDocument();
  });

  it('딜룸을 열어 둔 채 재요청 마감 시각이 되면 작성기를 닫는다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T00:00:00Z'));
    render(<PgDealRoomBody data={buildData({
      rfp: { ...baseRfp, deadline: '2026-09-20T00:00:00Z' },
      pendingRequote: {
        message: '조건을 조정해 주세요',
        deadline: '2026-09-14T00:00:01Z',
        round: 2,
      },
      myBid: submittedBid,
      bidWindowOpen: true,
    })} />);
    expect(screen.getByTestId('brief')).toHaveTextContent('2026-09-14T00:00:01Z');
    openWriteTab();
    expect(screen.getByTestId('bid-wizard')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(1_001); });

    expect(screen.queryByTestId('bid-wizard')).not.toBeInTheDocument();
    expect(screen.getByText('견적 요청이 마감됐어요')).toBeInTheDocument();
    expect(navigation.refresh).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: /보낸 내용 보기/ }));
    expect(screen.getByText('2026. 09. 14.')).toBeInTheDocument();
    expect(screen.queryByText('2026. 09. 20.')).not.toBeInTheDocument();
  });

  it('이미 견적을 보낸 요청도 접수 기간이 끝나면 마감 안내와 보낸 견적을 함께 보여준다', () => {
    render(<PgDealRoomBody data={buildData({
      rfp: { ...baseRfp, status: 'sent' },
      bidWindowOpen: false,
      myBid: submittedBid,
    })} />);
    openWriteTab();
    expect(screen.getByText('견적 요청이 마감됐어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /\uBCF4낸 내용 보기/ }));
    expect(screen.getByText('정산 주기')).toBeInTheDocument();
    expect(screen.queryByText('✓ 견적을 보냈어요')).not.toBeInTheDocument();
  });

  it('취소되면 견적 작성 대신 취소 안내를 보여준다', () => {
    render(<PgDealRoomBody data={buildData({
      rfp: { ...baseRfp, status: 'cancelled' },
      bidWindowOpen: false,
    })} />);
    openWriteTab();
    expect(screen.getByText('견적 요청이 취소됐어요')).toBeInTheDocument();
    expect(screen.queryByTestId('bid-wizard')).not.toBeInTheDocument();
  });

  it('이미 견적을 보낸 요청이 취소되면 취소 안내와 보낸 견적을 함께 보여준다', () => {
    render(<PgDealRoomBody data={buildData({
      rfp: { ...baseRfp, status: 'cancelled' },
      bidWindowOpen: false,
      myBid: submittedBid,
    })} />);
    openWriteTab();
    expect(screen.getByText('견적 요청이 취소됐어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /\uBCF4낸 내용 보기/ }));
    expect(screen.getByText('정산 주기')).toBeInTheDocument();
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

  it('선정 + signing 이어도 요청 조건이 맨 앞·기본이고, 계약 탭은 그 다음에 온다', () => {
    render(<PgDealRoomBody data={awarded({ signing: signingView() })} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      '요청 조건',
      '계약 · 계약서 보내기 전',
      '견적 결과',
      '첨부',
    ]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    // 계약 탭은 열기 전엔 마운트하지 않는다(지연 마운트).
    expect(screen.queryByTestId('signing-tab')).not.toBeInTheDocument();
  });

  it('계약 탭을 열면 pg side + 올바른 rfpCode 로 렌더된다', () => {
    render(<PgDealRoomBody data={awarded({ signing: signingView() })} />);
    openContractTab();
    const signingTab = screen.getByTestId('signing-tab');
    expect(signingTab).toHaveAttribute('data-side', 'pg');
    expect(signingTab).toHaveAttribute('data-rfp', baseRfp.code);
  });

  // 기본 탭이 요청 조건이 되면서 "계약 탭을 열었다가 요청 조건으로 돌아가는" 이동이
  // 흔해졌다 — 그때 SigningTab 이 언마운트되면 스노우싸인 임베드 작업물이 날아간다.
  it('계약 탭을 한 번 열면 요청 조건으로 돌아가도 SigningTab 이 남아 있다', () => {
    render(<PgDealRoomBody data={awarded({ signing: signingView() })} />);
    openContractTab();
    const signingTab = screen.getByTestId('signing-tab');
    fireEvent.click(screen.getByRole('tab', { name: '요청 조건' }));
    expect(screen.getByRole('tab', { name: '요청 조건' })).toHaveAttribute('aria-selected', 'true');
    // 같은 노드여야 한다 — 재마운트면 임베드 iframe 이 새로 뜬다.
    expect(screen.getByTestId('signing-tab')).toBe(signingTab);
  });

  it('signing 이 없으면 계약 탭이 없고 요청 조건이 기본이다', () => {
    render(<PgDealRoomBody data={awarded()} />);
    expect(screen.queryByRole('tab', { name: /계약/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '요청 조건' })).toHaveAttribute('aria-selected', 'true');
  });

  it('견적 결과 탭의 요약 스트립을 누르면 계약 탭으로 간다', async () => {
    const user = userEvent.setup();
    render(<PgDealRoomBody data={awarded({ signing: signingView() })} />);
    await user.click(screen.getByRole('tab', { name: '견적 결과' }));
    // SigningTab 은 목이지만 SigningSummaryStrip 은 실제 컴포넌트라 side='pg' 로
    // 파생된 실제 상태 라벨(awaiting_pg_template → '계약서 보내기 전')을 그린다 —
    // side 배선의 두 번째(무료) 검증. 스트립 버튼으로 범위를 좁혀 조회한다.
    const strip = screen.getByRole('button', { name: /전자서명/ });
    expect(strip).toHaveTextContent('계약서 보내기 전');
    await user.click(strip);
    expect(screen.getByRole('tab', { name: /^계약/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('signing-tab')).toHaveAttribute('data-side', 'pg');
  });

  it('계약 탭 상단 줄에 구매사 워크스페이스 id 를 상대로 전달한다', () => {
    render(<PgDealRoomBody data={awarded({ signing: signingView() })} />);
    openContractTab();
    const ctx = screen.getByTestId('award-context');
    expect(ctx).toHaveAttribute('data-counterparty', baseRfp.buyerWsId);
    expect(ctx).toHaveAttribute('data-ws-name', '(주)테스트');
  });

  it('계약 상태는 상단 탭에 텍스트로 표시하고 작업 레일에는 중복 계약 버튼이나 색상 점을 두지 않는다', () => {
    render(<PgDealRoomBody data={awarded({ signing: signingView('awaiting_pg_template') })} />);

    expect(screen.getByRole('tab', { name: '계약 · 계약서 보내기 전' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '견적 작업' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('rail-dot')).not.toBeInTheDocument();
  });

  it('미선정 PG 는 signing 이 (오류로) 채워져 있어도 계약 탭을 보지 못한다(봉인입찰 방어)', () => {
    render(
      <PgDealRoomBody
        data={awarded({ awardedToMe: false, buyerContact: null, signing: signingView() })}
      />,
    );
    expect(screen.queryByRole('tab', { name: /계약/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('signing-tab')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '요청 조건' })).toHaveAttribute('aria-selected', 'true');
  });
});

// 로더 → PgDealRoomBody → buildContractTabEntries → SigningTab 배선.
// 이 배선이 끊기면 임베드 패널이 구매사 서명 담당자를 못 띄우고, PG 가 수신자를
// 직접 타이핑하는 구조라 그대로 오발송으로 이어진다. 배선을 주장하는 테스트가
// 없으면 전 스위트가 초록인 채로 조용히 퇴행한다.
describe('PgDealRoomBody — 구매사 서명 담당자 배선', () => {
  const awarded = (over: Partial<PgRfpDetailData> = {}) =>
    buildData({
      rfp: { ...baseRfp, status: 'awarded' },
      myBid: submittedBid,
      awardedToMe: true,
      ...over,
    });

  // 임베드 안에서 PG 가 수신자를 직접 타이핑한다 — 정확한 주소가 화면에 있어야 한다.
  it('계약 탭에 구매사 서명 담당자를 실어 보낸다', () => {
    render(
      <PgDealRoomBody
        data={awarded({
          signing: signingView(),
          buyerContact: {
            workspaceName: '토스',
            name: '김구매',
            email: 'buyer@corp.com',
            phone: null,
          },
        })}
      />,
    );
    openContractTab();
    expect(screen.getByTestId('signing-tab')).toHaveAttribute(
      'data-buyer-signer',
      'buyer@corp.com',
    );
  });

  // 로더가 낙찰 견적에 연결된 템플릿 이름을 실어 보내면, 계약 탭도 그걸 받아야
  // '연결된 템플릿으로 보내기' 지름길이 뜬다 — 배선이 끊기면 이 필드가 조용히
  // 사라지고 PG 는 매번 임베드를 거쳐야 한다.
  it('공통 합의서 전환 후 신규 발송에는 옛 템플릿 지름길을 노출하지 않는다', () => {
    render(
      <PgDealRoomBody
        data={awarded({
          signing: signingView(),
          linkedSigningTemplate: { id: 't1', name: '표준 계약서', kind: 'pdf' },
        })}
      />,
    );
    openContractTab();
    expect(screen.getByTestId('signing-tab')).toHaveAttribute('data-linked-template', '');
  });
});

// ── 드리프트 가드: 로더 프리페치 조건 === 화면 렌더 ─────────────────────────
//
// `loadPgRfpDetail` 은 계약서 템플릿 목록을 `pgDealRoomShowsBidWizard` 가 true 일
// 때만 조회한다(불필요 쿼리 제거). 그 판정이 화면과 어긋나면 **덜 가져오는 방향에서
// 조용히 망가진다** — 위저드는 렌더되는데 목록이 비어 픽커가 사라지고, 초안에 담긴
// 템플릿 선택은 '삭제된 템플릿'으로 오인돼 해제된다. 두 곳이 같은 함수를 쓰는지
// 눈으로 확인하는 것으로는 부족해서, 상태 조합마다 실제 렌더와 대조한다.
describe('PgDealRoomBody — BidWizard 노출이 로더 프리페치 조건과 일치한다', () => {
  const awardedRfp = { ...baseRfp, status: 'awarded' as const };
  const requote = { message: '조건을 조정해 주세요', deadline: new Date().toISOString(), round: 2 };

  const cases: { name: string; over: Partial<PgRfpDetailData> }[] = [
    { name: '미제출·진행중', over: {} },
    {
      name: '미제출·마감',
      over: { rfp: { ...baseRfp, status: 'closed' }, bidWindowOpen: false },
    },
    {
      name: '미제출·상태 전이 전 마감',
      over: { rfp: { ...baseRfp, status: 'sent' }, bidWindowOpen: false },
    },
    { name: '제출 완료', over: { myBid: submittedBid } },
    { name: '선정 완료(낙찰)', over: { rfp: awardedRfp, myBid: submittedBid, awardedToMe: true } },
    { name: '선정 완료(탈락)', over: { rfp: awardedRfp, myBid: submittedBid, awardedToMe: false } },
    { name: '재요청(미제출)', over: { pendingRequote: requote } },
    { name: '재요청(제출 이력 있음)', over: { pendingRequote: requote, myBid: submittedBid } },
    {
      name: '만료된 재요청',
      over: { pendingRequote: requote, myBid: submittedBid, bidWindowOpen: false },
    },
  ];

  for (const c of cases) {
    it(`${c.name}`, () => {
      const data = buildData(c.over);
      render(<PgDealRoomBody data={data} />);
      openWriteTab();
      // BidWizard 는 이 파일에서 목킹돼 있다 — 목의 마커로 존재를 판정한다.
      const rendered = screen.queryByTestId('bid-wizard') !== null;
      const predicted = pgDealRoomShowsBidWizard({
        hasPendingRequote: !!data.pendingRequote,
        bidWindowOpen: data.bidWindowOpen,
        hasMyBid: !!data.myBid,
      });
      expect(rendered).toBe(predicted);
    });
  }
});

it('첨부가 없는 요청도 첨부 탭에서 빈 이유를 알린다', () => {
  render(<PgDealRoomBody data={buildData()} />);
  fireEvent.click(screen.getByRole('tab', { name: '첨부' }));
  expect(screen.getByText('구매사가 첨부한 파일이 없어요.')).toBeInTheDocument();
});
