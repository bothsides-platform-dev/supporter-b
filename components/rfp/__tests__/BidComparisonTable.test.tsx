import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

// base-ui Menu needs these in jsdom.
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

// MessageComposeButton imports 'use server' chat actions whose transitive
// next-auth → next/server chain fails to resolve in the jsdom env (collection
// error). Stub it to a recognizable profile button and capture the wired
// counterparty so we can still assert the embed without the real action chain.
const counterpartyCapture = vi.fn();
vi.mock('@/components/messages/MessageComposeButton', () => ({
  MessageComposeButton: (props: { counterparty: { name: string } }) => {
    counterpartyCapture(props.counterparty);
    return (
      <button type="button" aria-label={`${props.counterparty.name} 프로필`}>
        {props.counterparty.name}
      </button>
    );
  },
}));

afterEach(() => {
  cleanup();
  counterpartyCapture.mockClear();
});

import { BidComparisonTable } from '../BidComparisonTable';
import type { Bid, CustomPaymentMethod, PaymentMethod } from '@/lib/types/bid';
import type { MerchantGrade } from '@/lib/types/biz-profile';

const bid: Bid = {
  id: 'bid-toss',
  rfpId: 'P-2604-0001',
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
  submittedAt: '2026-05-01T00:00:00Z',
};

const pgWsNameMap = { 'ws-toss': '에이페이먼츠' };

type TableOverrides = {
  bids?: Bid[];
  grade?: MerchantGrade | undefined;
  requiredPaymentMethods?: PaymentMethod[];
  customPaymentMethods?: CustomPaymentMethod[];
};

function renderTable(overrides: TableOverrides = {}) {
  return render(
    <BidComparisonTable
      rfpId="P-2604-0001"
      bids={overrides.bids ?? [bid]}
      grade={'grade' in overrides ? overrides.grade : 'sme1'}
      rfpStatus="sent"
      requiredPaymentMethods={overrides.requiredPaymentMethods ?? ['bank_transfer']}
      customPaymentMethods={overrides.customPaymentMethods ?? []}
      pgWsNameMap={pgWsNameMap}
    />,
  );
}

describe('BidComparisonTable — PG 프로필 채팅 진입', () => {
  it('각 제출 PG가 클릭 가능한 프로필(아바타+이름)로 표시된다', () => {
    renderTable();
    expect(screen.getByRole('button', { name: '에이페이먼츠 프로필' })).toBeInTheDocument();
    expect(screen.getByText('에이페이먼츠')).toBeInTheDocument();
  });

  it('각 행의 MessageComposeButton에 해당 PG의 counterparty(name·type·workspaceId)를 전달한다', () => {
    renderTable();
    expect(counterpartyCapture).toHaveBeenCalledWith(
      expect.objectContaining({ name: '에이페이먼츠', type: 'pg', workspaceId: 'ws-toss' }),
    );
  });
});

describe('BidComparisonTable — 결제수단 동적 컬럼', () => {
  it('요청된 결제수단마다 헤더 컬럼을 렌더한다', () => {
    renderTable({ requiredPaymentMethods: ['card', 'bank_transfer'], grade: 'general' });
    expect(screen.getByRole('columnheader', { name: '카드' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '계좌이체' })).toBeInTheDocument();
  });

  it('커스텀 결제수단 헤더는 라벨로 표시된다', () => {
    renderTable({ customPaymentMethods: [{ id: 'c1', label: '포인트결제' }] });
    expect(screen.getByRole('columnheader', { name: '포인트결제' })).toBeInTheDocument();
  });

  it('capped 등급이면 카드 컬럼은 bid값이 아닌 법정값(1.10%)을 표시한다', () => {
    const b: Bid = { ...bid, paymentFees: { card: 0.99 } };
    renderTable({ bids: [b], requiredPaymentMethods: ['card'], grade: 'sme1' });
    expect(screen.getByText('1.10%')).toBeInTheDocument();
    expect(screen.queryByText('99.00%')).toBeNull();
  });

  it('일반 등급이면 카드 컬럼은 bid의 paymentFees.card를 표시한다', () => {
    const b: Bid = { ...bid, paymentFees: { card: 0.03 } };
    renderTable({ bids: [b], requiredPaymentMethods: ['card'], grade: 'general' });
    expect(screen.getByText('3.00%')).toBeInTheDocument();
  });

  it('요율 미입력 결제수단은 — 로 표시한다', () => {
    const b: Bid = { ...bid, paymentFees: {} };
    renderTable({ bids: [b], requiredPaymentMethods: ['bank_transfer'], grade: 'general' });
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('커스텀 요율을 formatPct로 표시한다', () => {
    const b: Bid = { ...bid, customFees: { c1: 0.02 } };
    renderTable({
      bids: [b],
      customPaymentMethods: [{ id: 'c1', label: '포인트결제' }],
      grade: 'general',
    });
    expect(screen.getByText('2.00%')).toBeInTheDocument();
  });
});
