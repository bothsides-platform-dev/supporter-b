// BuyerDealRoomBody — 구매사 딜룸 본문(레일 + 탭).
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render as rtlRender, screen, cleanup, within, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, type ReactElement } from 'react';
import type { SigningView } from '@/lib/types/signing';

vi.mock('@/components/deal-room/signing/PlatformAgreementPanel', () => ({
  PlatformAgreementPanel: () => (
    <div data-testid="signing-tab" data-side="buyer" />
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

vi.mock('@/lib/hooks/useCelebrationConfetti', () => ({ useCelebrationConfetti: () => ({ canvasRef: { current: null } }) }));

const navigation = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

// 무거운 자식 트리·server-action 정적 임포트(next-auth 체인)는 각자 테스트가 커버 — 목.
vi.mock('@/components/rfp/comparison/FocusComparison', () => ({
  FocusComparison: (p: {
    bids: Bid[];
    onAwarded?: (bid: Bid, tier: 'general') => void;
    invitedPgCount?: number;
    draftPgCount?: number;
    deadline?: string;
    canEditInvitations?: boolean;
    onManageInvitations?: () => void;
  }) => (
    <div
      data-testid="focus-comparison"
      data-invited-pg-count={p.invitedPgCount}
      data-draft-pg-count={p.draftPgCount}
      data-deadline={p.deadline}
      data-can-edit-invitations={p.canEditInvitations}
    >
      {p.bids[0] && <button onClick={() => p.onAwarded?.(p.bids[0], 'general')}>비교 선정 성공 응답</button>}
      {p.bids.length === 0 && p.onManageInvitations && (
        <button type="button" onClick={p.onManageInvitations}>초대 현황 보기</button>
      )}
    </div>
  ),
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
vi.mock('@/components/rfp/comparison/RequoteDialog', () => ({
  RequoteDialog: () => null,
}));
vi.mock('../DeadlineChangeDialog', () => ({ DeadlineChangeDialog: (p: { open: boolean; reopen: boolean }) => p.open ? <div data-testid="deadline-dialog" data-reopen={p.reopen} /> : null }));
vi.mock('@/lib/server/actions/rfp', () => ({
  awardRfpAction: vi.fn().mockResolvedValue({ ok: true }),
  closeRfpAction: vi.fn(),
  cancelRfpAction: vi.fn(),
}));

const mq = vi.hoisted(() => ({ lgUp: true }));
vi.mock('@/lib/hooks/useIsLgUp', () => ({ useIsLgUp: () => mq.lgUp }));

import { BuyerDealRoomBody } from '../BuyerDealRoomBody';
import { ToasterProvider } from '@/components/shell/Toaster';
import { toastManager } from '@/lib/toast';
import { DealRoomProvider, useDealRoom } from '@/components/deal-room/DealRoomContext';
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
    bidHistoryByPg: {},
    bidAuthorNames: {},
    rfpFiles: [],
    companyName: '구매사',
    inviteList: [],
    pgWsById: {},
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
afterEach(() => { toastManager.close(); navigation.refresh.mockClear(); navigation.push.mockClear(); });
afterEach(() => { mq.lgUp = true; });

describe('BuyerDealRoomBody — 소형 화면 레이아웃', () => {
  it('shows a single quote detail with its author and full fees', () => {
    render(<BuyerDealRoomBody data={buildData({
      bidHistoryByPg: { 'ws-toss': [{ ...aBid, paymentFees: { card: { sole: 0, general: 0.02 } } }] },
      bidAuthorNames: { 'bid-1': '견적 담당자' },
      pgWsById: { 'ws-toss': { id: 'ws-toss', name: '토스페이먼츠', type: 'pg', logoUpdatedAt: null } },
    })} />);
    const detail = within(screen.getByRole('region', { name: '견적 상세' }));
    expect(detail.getByRole('heading', { name: '견적' })).toBeInTheDocument();
    expect(detail.getByText('견적 담당자')).toBeInTheDocument();
    expect(detail.getByText('토스페이먼츠')).toBeInTheDocument();
    expect(detail.getByText('0.00%')).toBeInTheDocument();
    expect(detail.queryByRole('combobox')).not.toBeInTheDocument();
  });
  it('shows the focused PG previous rounds beside the current comparison', () => {
    const latest = { ...aBid, id: 'bid-2', round: 2, memo: '개선 견적' };
    render(<BuyerDealRoomBody data={buildData({ bids: [latest], bidHistoryByPg: { 'ws-toss': [latest, aBid] }, bidAuthorNames: { 'bid-1': '처음 담당자', 'bid-2': '수정 담당자' } })} />);
    expect(screen.getByText('견적 수정 이력')).toBeInTheDocument();
    expect(screen.getByText('처음 담당자')).toBeInTheDocument();
  });
  it('keeps the PG name inside its comparison history and compares only that PG’s rounds', () => {
    const latest = { ...aBid, id: 'bid-2', round: 2, signupFee: 100000 };
    render(<BuyerDealRoomBody data={buildData({
      bids: [latest], bidHistoryByPg: { 'ws-toss': [latest, aBid] },
      pgWsById: { 'ws-toss': { id: 'ws-toss', name: '토스페이먼츠', type: 'pg', logoUpdatedAt: null } },
    })} />);
    const history = within(screen.getByRole('region', { name: '견적 수정 이력' }));
    expect(history.getByText('토스페이먼츠')).toBeInTheDocument();
    expect(history.getByRole('combobox', { name: '비교 기준' })).toHaveValue('bid-1');
    expect(history.getByRole('row', { name: /가입비/ })).toHaveTextContent('+100,000원');
  });
  it('lg 미만에서 DealRoomCenter 콘텐츠가 DOM 에 존재한다', () => {
    mq.lgUp = false;
    render(<BuyerDealRoomBody data={buildData()} />);
    // FocusComparison 은 '견적 비교' 탭의 기본 콘텐츠.
    expect(screen.getByTestId('focus-comparison')).toBeInTheDocument();
  });
});

it('유효 마감이 지나면 견적 접수를 다시 여는 작업을 보여준다', async () => {
  render(<BuyerDealRoomBody data={buildData({ rfp: { ...baseRfp, deadline: '2020-01-01T09:00:00.000Z' } })} />);
  await userEvent.setup().click(screen.getByRole('button', { name: '견적 접수 다시 열기' }));
  expect(screen.getByTestId('deadline-dialog')).toHaveAttribute('data-reopen', 'true');
});

it('pending 재요청이 살아 있으면 공용 마감이 지나도 연장으로 표시한다', () => {
  render(<BuyerDealRoomBody data={buildData({ rfp: { ...baseRfp, deadline: '2020-01-01T09:00:00.000Z' }, requoteByPg: { 'pg-1': { status: 'pending', round: 2, deadline: '2099-01-01T09:00:00.000Z' } } })} />);
  expect(screen.getByRole('button', { name: '마감일 연장' })).toBeInTheDocument();
});

it('랜딩 데모(게스트)에서는 연장·재개 작업을 숨긴다', () => {
  render(<BuyerDealRoomBody data={buildData({ rfp: { ...baseRfp, deadline: '2020-01-01T09:00:00.000Z' } })} onGuestAction={vi.fn()} />);
  expect(screen.queryByRole('button', { name: '견적 접수 다시 열기' })).not.toBeInTheDocument();
});

describe('BuyerDealRoomBody — 빈 견적 상태의 정보 구조', () => {
  it.each(['closed', 'cancelled'] as const)('%s 상태의 상담 이력을 빈 탭 대신 보여준다', status => {
    const matching = { industryName: '일반 판매', reviews: [{ id: 'review-1', pgWorkspaceId: 'pg-1', status: 'requested' as const, reason: '', createdAt: '', updatedAt: '', candidate: { pgWorkspaceId: 'pg-1', name: 'Alpha', reason: '판매 상담', feeMin: null, feeMax: null, feeNote: '' } }], recommendation: { risk: 'white' as const, industryName: '일반 판매', candidates: [] } };
    render(<BuyerDealRoomBody data={buildData({ rfp: { ...baseRfp, status }, bids: [], matching })} />);
    expect(screen.getByRole('region', { name: '상담 진행' })).toBeInTheDocument();
    expect(screen.getByText(status === 'closed' ? '상담이 마감됐어요' : '상담이 취소됐어요')).toBeInTheDocument();
  });
  const inviteList: BuyerRfpDetailData['inviteList'] = [
    {
      ws: { id: 'pg-1', name: '토스페이먼츠', type: 'pg', logoUpdatedAt: null },
      status: 'sent',
    },
    {
      ws: { id: 'pg-2', name: 'KG이니시스', type: 'pg', logoUpdatedAt: null },
      status: 'opened',
    },
  ];

  it('초대 수와 마감을 빈 상태에 전달하고 CTA로 PG 관리 탭을 연다', async () => {
    const user = userEvent.setup();
    render(<BuyerDealRoomBody data={buildData({ bids: [], inviteList })} />);

    const comparison = screen.getByTestId('focus-comparison');
    expect(comparison).toHaveAttribute('data-invited-pg-count', '2');
    expect(comparison).toHaveAttribute('data-draft-pg-count', '0');
    expect(comparison).toHaveAttribute('data-deadline', baseRfp.deadline);
    expect(comparison).toHaveAttribute('data-can-edit-invitations', 'true');

    await user.click(screen.getByRole('button', { name: '초대 현황 보기' }));
    expect(screen.getByRole('tab', { name: 'PG 관리' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('invite-manager')).toBeInTheDocument();
  });

  it('발송한 초대와 아직 발송하지 않은 PG를 나눠 전달한다', () => {
    render(
      <BuyerDealRoomBody
        data={buildData({
          bids: [],
          inviteList: [
            inviteList[0],
            {
              ws: { id: 'pg-draft', name: '발송 대기 PG', type: 'pg', logoUpdatedAt: null },
              status: 'draft',
            },
          ],
        })}
      />,
    );

    expect(screen.getByTestId('focus-comparison')).toHaveAttribute('data-invited-pg-count', '1');
    expect(screen.getByTestId('focus-comparison')).toHaveAttribute('data-draft-pg-count', '1');
  });

  it('상단 탭과 겹치는 콘텐츠 이동 버튼은 작업 레일에 두지 않는다', () => {
    render(<BuyerDealRoomBody data={buildData({ bids: [], inviteList })} />);

    expect(screen.queryByRole('button', { name: 'PG 관리' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '요청 조건' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '첨부' })).not.toBeInTheDocument();
  });

  it('견적이 없을 때는 아직 실행할 수 없는 선정과 수정 요청을 작업 레일에서 감춘다', () => {
    render(<BuyerDealRoomBody data={buildData({ bids: [], inviteList })} />);

    expect(screen.queryByRole('button', { name: '선정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '수정 요청' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '선정 없이 종료' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '취소' })).toBeEnabled();
  });

  it('견적이 있으면 선정과 수정 요청 작업을 유지한다', () => {
    render(<BuyerDealRoomBody data={buildData()} />);

    expect(screen.getByRole('button', { name: '선정' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수정 요청' })).toBeEnabled();
  });

  it('편집할 수 없는 상태를 빈 견적 화면에 전달한다', () => {
    render(<BuyerDealRoomBody data={buildData({ bids: [], canEdit: false })} />);

    expect(screen.getByTestId('focus-comparison')).toHaveAttribute(
      'data-can-edit-invitations',
      'false',
    );
  });
});

it('선정 없이 종료하기 전에 선정 불가와 복구 불가를 알리고 닫으면 종료하지 않는다', async () => {
  const { closeRfpAction } = await import('@/lib/server/actions/rfp');
  vi.mocked(closeRfpAction).mockClear();
  render(<BuyerDealRoomBody data={buildData()} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '선정 없이 종료' }));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('받은 견적을 선정하거나 새 견적을 받을 수 없어요');
  expect(dialog).toHaveTextContent('다시 열 수 없어요');
  expect(within(dialog).getByRole('button', { name: '선정 없이 종료할게요' })).toBeEnabled();
  await user.click(within(dialog).getByRole('button', { name: '닫기' }));
  expect(closeRfpAction).not.toHaveBeenCalled();
});

it.each([
  { actionName: 'closeRfpAction' as const, openLabel: '선정 없이 종료', confirmLabel: '선정 없이 종료할게요', title: '선정 없이 견적 요청을 종료할까요?' },
  { actionName: 'cancelRfpAction' as const, openLabel: '취소', confirmLabel: '취소하기', title: '견적 요청을 취소할까요?' },
])('$openLabel 결과를 받지 못해도 진행 잠금을 풀고 닫기와 재시도를 허용한다', async ({ actionName, openLabel, confirmLabel, title }) => {
  const actions = await import('@/lib/server/actions/rfp');
  const action = vi.mocked(actions[actionName]);
  let reject!: (error: Error) => void;
  action.mockReset().mockReturnValueOnce(
    new Promise((_resolve, fail) => { reject = fail; }),
  ).mockResolvedValueOnce({ ok: true });
  render(<ToasterProvider><BuyerDealRoomBody data={buildData()} /></ToasterProvider>);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: openLabel }));
  const dialog = screen.getByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: confirmLabel }));
  expect(within(dialog).getByRole('button', { name: '처리 중…' })).toBeDisabled();
  expect(within(dialog).getByRole('button', { name: '닫기' })).toBeDisabled();

  await act(async () => { reject(new Error('Failed to fetch')); });

  await waitFor(() => expect(within(dialog).getByRole('button', { name: confirmLabel })).toBeEnabled());
  expect(within(dialog).getByRole('button', { name: '닫기' })).toBeEnabled();
  expect(await screen.findByText(/새로고침.*상태를 확인/)).toBeInTheDocument();
  expect(navigation.refresh).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole('button', { name: '닫기' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: title })).not.toBeInTheDocument());

  await user.click(screen.getByRole('button', { name: openLabel }));
  await user.click(within(screen.getByRole('dialog', { name: title })).getByRole('button', { name: confirmLabel }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: title })).not.toBeInTheDocument());
  expect(action).toHaveBeenLastCalledWith({ rfpId: 'P-2605-0042' });
  expect(navigation.refresh).toHaveBeenCalledOnce();
});

describe('BuyerDealRoomBody — 선정 결과', () => {
  const pgWsById = { 'ws-toss': { id: 'ws-toss', name: '토스페이먼츠', type: 'pg' as const, logoUpdatedAt: null } };
  it('연락처 없이 재방문해도 탭 위에서 이메일 절차를 안내하고 완료 화면은 반복하지 않는다', () => {
    render(<BuyerDealRoomBody data={buildData({ rfp: { ...baseRfp, status: 'awarded', awardedBidId: aBid.id }, pgWsById, signing: signingView() })} />);
    const guide = screen.getByRole('region', { name: 'PG사 도입 안내' });
    expect(guide).toHaveTextContent('선정일로부터 영업일 기준 3일 이내');
    expect(guide).toHaveTextContent('토스페이먼츠');
    expect(guide.compareDocumentPosition(screen.getByRole('tablist')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('선정 전에는 도입 안내를 표시하지 않는다', () => {
    render(<BuyerDealRoomBody data={buildData()} />);
    expect(screen.queryByRole('region', { name: 'PG사 도입 안내' })).not.toBeInTheDocument();
  });
  it('선정된 PG 연락처를 유지한다', () => {
    render(<BuyerDealRoomBody data={buildData({ rfp: { ...baseRfp, status: 'awarded' }, awardedPgContact: { workspaceName: '토스페이먼츠', name: '담당자', email: 'sales@example.com', phone: '' } })} />);
    expect(screen.getByRole('link', { name: /sales@example.com/ })).toBeInTheDocument();
  });
  it('레일 선정 실패는 완료 화면을 열지 않고 재시도를 허용한다', async () => {
    const { awardRfpAction } = await import('@/lib/server/actions/rfp');
    vi.mocked(awardRfpAction).mockResolvedValueOnce({ ok: false, error: 'WINNING_BID_OUTDATED' });
    function Focus(){ const { setCounterparty } = useDealRoom(); useEffect(() => { setCounterparty({ workspaceId: 'ws-toss', name: '토스페이먼츠', type: 'pg', logoUpdatedAt: null }); }, [setCounterparty]); return null; }
    render(<><Focus /><BuyerDealRoomBody data={buildData({ pgWsById })} /></>);
    await userEvent.click(screen.getByRole('button', { name: '선정' }));
    await userEvent.click(screen.getByRole('button', { name: '선정할게요' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('최신 견적');
    expect(screen.queryByRole('dialog', { name: '최종 계약 조건 협의를 마쳤어요' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '선정할게요' })).toBeEnabled();
  });
  it.each(['비교', '레일'])('%s의 성공 응답 뒤에만 같은 완료 화면을 표시한다', async (entry) => {
    function Focus(){ const { setCounterparty } = useDealRoom(); useEffect(() => { setCounterparty({ workspaceId: 'ws-toss', name: '토스페이먼츠', type: 'pg', logoUpdatedAt: null }); }, [setCounterparty]); return null; }
    render(<><Focus /><BuyerDealRoomBody data={buildData({ pgWsById })} /></>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    if(entry === '레일'){
      await userEvent.click(screen.getByRole('button', { name: '선정' }));
      expect(screen.queryByRole('dialog', { name: '최종 계약 조건 협의를 마쳤어요' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: '선정할게요' }));
    } else await userEvent.click(screen.getByRole('button', { name: '비교 선정 성공 응답' }));
    expect(screen.getByRole('dialog', { name: '최종 계약 조건 협의를 마쳤어요' })).toHaveTextContent('토스페이먼츠와 계약을 진행해요');
    await userEvent.click(screen.getByRole('button', { name: '선정한 조건 보기' }));
    expect(screen.getByText('D+1')).toBeVisible();
  });
});

function signingView(status: SigningView['contract']['status'] = 'in_progress'): SigningView {
  return {
    contract: {
      kind:'platform_buyer',
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

describe('BuyerDealRoomBody — 계약 탭', () => {
  it('signing 이 없으면 계약 탭이 없고 견적 비교가 기본이다', () => {
    render(<BuyerDealRoomBody data={buildData()} />);
    expect(screen.queryByRole('tab', { name: /계약/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '견적 비교' })).toHaveAttribute('aria-selected', 'true');
  });

  it('signing 이 있으면 계약 탭이 첫 번째이고 기본으로 열리며 buyer side + 올바른 rfpCode 로 렌더된다', async () => {
    render(<BuyerDealRoomBody data={buildData({ signing: signingView() })} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveTextContent('합의서');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    const signingTab = await screen.findByTestId('signing-tab');
    expect(signingTab).toHaveAttribute('data-side', 'buyer');
  });

  it('견적 비교 탭의 요약 스트립을 누르면 계약 탭으로 간다', async () => {
    const user = userEvent.setup();
    render(<BuyerDealRoomBody data={buildData({ signing: signingView() })} />);
    await user.click(screen.getByRole('tab', { name: '견적 비교' }));
    // SigningTab 은 목이지만 SigningSummaryStrip 은 실제 컴포넌트라 side='buyer' 로
    // 파생된 실제 상태 라벨(진행 중 계약 → '서명 진행 중')을 그린다 — side 배선의
    // 두 번째(무료) 검증. 스트립 버튼으로 범위를 좁혀 조회한다.
    const strip = screen.getByRole('button', { name: /전자서명/ });
    expect(strip).toHaveTextContent('서명 진행 중');
    await user.click(strip);
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByTestId('signing-tab')).toHaveAttribute('data-side', 'buyer');
  });

  it('계약 상태는 상단 탭에 텍스트로 표시하고 작업 레일에는 중복 계약 버튼이나 색상 점을 두지 않는다', () => {
    render(
      <BuyerDealRoomBody data={buildData({ signing: signingView('awaiting_pg_template') })} />,
    );

    expect(screen.getByRole('tab', { name: '합의서 작성' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const rail = screen.getByRole('navigation', { name: '견적 작업' });
    expect(within(rail).queryByRole('button', { name: /계약/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('rail-dot')).not.toBeInTheDocument();
  });
});


it('견적이 오기 전에도 현재 상담 PG를 채팅 상대로 연결한다', () => {
  function ChatTarget() { return <div data-testid="chat-target">{useDealRoom().counterparty?.name}</div>; }
  const data = buildData({ bids: [], matching: { industryName: '판매', recommendation: { risk: 'white', industryName: '판매', candidates: [] }, reviews: [{ id: 'review', pgWorkspaceId: 'pg-1', status: 'requested', reason: '', createdAt: '', updatedAt: '', candidate: { pgWorkspaceId: 'pg-1', name: '상담 PG', reason: '판매 상담', feeMin: null, feeMax: null, feeNote: '' } }] } });
  render(<><BuyerDealRoomBody data={data} /><ChatTarget /></>);
  expect(screen.getByTestId('chat-target')).toHaveTextContent('상담 PG');
});

it('선정 후 새 합의서가 생기면 바로 작성 탭을 연다', async () => {
  const {rerender}=render(<BuyerDealRoomBody data={buildData()} />);
  rerender(<BuyerDealRoomBody data={buildData({signing:signingView('awaiting_pg_template')})} />);
  expect(screen.getByRole('tab',{name:'합의서 작성'})).toHaveAttribute('aria-selected','true');
});
it('레거시 계약은 요약과 빈 계약 탭도 노출하지 않는다', () => {
  const legacy=signingView();legacy.contract.kind='pg_buyer';
  render(<BuyerDealRoomBody data={buildData({signing:legacy})} />);
  expect(screen.getByRole('tab',{name:'견적 비교'})).toHaveAttribute('aria-selected','true');
  expect(screen.queryByRole('button',{name:/전자서명/})).not.toBeInTheDocument();
});
