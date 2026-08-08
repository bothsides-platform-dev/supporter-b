// PgDealRoomBody — 계약서 템플릿 kill switch 가 꺼진 상태(출고 기본값).
//
// 주의: @/lib/features/contract-templates 를 mock 하지 않음 — 실제 플래그를 사용.
// 플래그를 true 로 re-enable 할 때는 이 파일을 삭제하고,
// PgDealRoomBody.test.tsx 의 vi.mock('.../contract-templates', …) 행도 제거한다.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// 두 하류 컴포넌트가 **무엇을 받았는지**가 이 테스트의 전부다 — prop 을 속성으로 노출한다.
vi.mock('@/components/deal-room/signing/SigningTab', () => ({
  SigningTab: (p: { linkedSigningTemplateName?: string | null }) => (
    <div data-testid="signing-tab" data-linked-template={p.linkedSigningTemplateName ?? ''} />
  ),
}));
vi.mock('@/components/inbox/bid-wizard/BidWizard', () => ({
  BidWizard: (p: { signingTemplates?: { id: string; name: string }[] }) => (
    <div
      data-testid="bid-wizard"
      // undefined 와 [] 를 구분해야 한다 — BidWizard 의 피커 게이트는 truthy 검사라
      // 빈 배열을 넘기면 '저장된 템플릿이 없어요 + 템플릿 관리 링크' 카드가 그대로 뜬다.
      data-signing-templates={p.signingTemplates === undefined ? 'undefined' : String(p.signingTemplates.length)}
    />
  ),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/components/inbox/RfpBriefPanel', () => ({ RfpBriefPanel: () => <div data-testid="brief" /> }));
vi.mock('@/components/inbox/RequoteBanner', () => ({ RequoteBanner: () => <div data-testid="requote-banner" /> }));
vi.mock('@/components/attachments/AttachmentPreviewList', () => ({ AttachmentPreviewList: () => <div data-testid="attachments" /> }));
vi.mock('@/lib/server/actions/bid/withdrawBidAction', () => ({ withdrawBidAction: vi.fn() }));
vi.mock('@/lib/hooks/useIsLgUp', () => ({ useIsLgUp: () => true }));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Element.prototype.scrollIntoView = vi.fn();

import { PgDealRoomBody } from '../PgDealRoomBody';
import type { PgRfpDetailData } from '@/lib/server/rfp-detail-loader';
import type { RFP } from '@/lib/types/rfp';
import type { Bid } from '@/lib/types/bid';
import type { PgSigningTemplate, SigningView } from '@/lib/types/signing';

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
    signingTemplates: [],
    linkedSigningTemplateName: null,
    ...over,
  };
}

function signingView(): SigningView {
  return {
    contract: {
      id: 'c1',
      rfpId: 'r1',
      status: 'awaiting_pg_template',
      round: 1,
      createdBy: 'u',
      createdAt: '2026-07-20T04:40:00Z',
    },
    participants: [],
  };
}

afterEach(cleanup);

const template: PgSigningTemplate = {
  id: 't1',
  workspaceId: 'ws-pg',
  snowsignTemplateId: 'sn-1',
  name: '표준 계약서',
  createdBy: 'pg-u',
  createdAt: '2026-07-20T04:40:00Z',
};

describe('PgDealRoomBody — contract templates disabled (flag off)', () => {
  it('BidWizard 에 signingTemplates 를 넘기지 않는다 (빈 배열이 아니라 undefined)', () => {
    render(<PgDealRoomBody data={buildData({ signingTemplates: [template] })} />);
    expect(screen.getByTestId('bid-wizard')).toHaveAttribute('data-signing-templates', 'undefined');
  });

  it('낙찰 딜룸 계약 탭에 연결된 템플릿 이름을 넘기지 않는다', () => {
    render(
      <PgDealRoomBody
        data={buildData({
          rfp: { ...baseRfp, status: 'awarded' },
          myBid: submittedBid,
          awardedToMe: true,
          signing: signingView(),
          linkedSigningTemplateName: '표준 계약서',
        })}
      />,
    );
    expect(screen.getByTestId('signing-tab')).toHaveAttribute('data-linked-template', '');
  });
});
