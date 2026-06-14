// PgDealRoomBody — PG 딜룸 본문(레일 + 탭). 샘플 견적일 때 상단에 SamplePgRfpBanner
// (삭제 어포던스)를 노출 — 정식 페이지 통일 후 구 PgRfpDetailContent 의 동작 보존.
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
// SamplePgRfpBanner 는 deleteSamplePgRfpAction(→ next-auth 체인)을 정적 임포트해 jsdom 수집을
// 깨뜨린다 — 자체 테스트가 커버. 여기선 마운트 여부만 본다.
vi.mock('@/components/inbox/SamplePgRfpBanner', () => ({
  SamplePgRfpBanner: () => <div data-testid="sample-banner" />,
}));

import { PgDealRoomBody } from '../PgDealRoomBody';
import type { PgRfpDetailData } from '@/lib/server/rfp-detail-loader';
import type { RFP } from '@/lib/types/rfp';

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
    quoteTemplates: [],
    pendingRequote: null,
    ...over,
  };
}

afterEach(cleanup);

describe('PgDealRoomBody — 샘플 배너', () => {
  it('isSample 면 상단에 SamplePgRfpBanner 를 렌더한다', () => {
    render(<PgDealRoomBody data={buildData({ rfp: { ...baseRfp, isSample: true } })} />);
    expect(screen.getByTestId('sample-banner')).toBeInTheDocument();
  });

  it('isSample 이 아니면 SamplePgRfpBanner 를 렌더하지 않는다', () => {
    render(<PgDealRoomBody data={buildData({ rfp: { ...baseRfp, isSample: false } })} />);
    expect(screen.queryByTestId('sample-banner')).not.toBeInTheDocument();
  });
});
