// RfpBriefPanel — PG 측 RFP 상세 좌측 브리프 패널.
// 상호명이 buyerName prop에서 오는지, 하드코딩 가짜값이 없는지 확인.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const counterpartyCapture = vi.fn();
vi.mock('@/components/messages/CounterpartyProfileCard', () => ({
  CounterpartyProfileCard: (props: { counterparty: { name: string } }) => {
    counterpartyCapture(props.counterparty);
    return <div data-testid="msg-btn" />;
  },
}));
vi.mock('@/components/attachments/AttachmentPreviewList', () => ({
  AttachmentPreviewList: () => null,
}));

import { RfpBriefPanel } from '../RfpBriefPanel';
import type { RFP } from '@/lib/types/rfp';

const rfp: RFP = {
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

afterEach(() => {
  cleanup();
  counterpartyCapture.mockClear();
});

describe('RfpBriefPanel', () => {
  it('상호명 행에 buyerName prop 값이 표시된다', () => {
    render(<RfpBriefPanel rfp={rfp} buyerName="(주)진짜상사" />);
    expect(screen.getByText('(주)진짜상사')).toBeInTheDocument();
  });

  it('하드코딩 가짜값 "(주)샘플테크"가 화면에 없다', () => {
    render(<RfpBriefPanel rfp={rfp} buyerName="(주)진짜상사" />);
    expect(screen.queryByText('(주)샘플테크')).not.toBeInTheDocument();
  });

  it('CounterpartyProfileCard에 counterparty.name으로 buyerName을 전달한다', () => {
    render(<RfpBriefPanel rfp={rfp} buyerName="(주)진짜상사" />);
    expect(counterpartyCapture).toHaveBeenCalledWith(
      expect.objectContaining({ name: '(주)진짜상사' }),
    );
  });

  it('대표자 행은 "—"를 유지한다(회귀 가드)', () => {
    render(<RfpBriefPanel rfp={rfp} buyerName="(주)진짜상사" />);
    // "대표자" 레이블이 있고 값이 "—" 인지 확인
    expect(screen.getByText('대표자')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('currentSettlementCycle 있을 때 "현재 정산주기" 행이 표시된다', () => {
    render(<RfpBriefPanel rfp={{ ...rfp, currentSettlementCycle: 'D+1' }} buyerName="(주)진짜상사" />);
    expect(screen.getByText('현재 정산주기')).toBeInTheDocument();
    expect(screen.getByText('D+1')).toBeInTheDocument();
  });

  it('currentSettlementCycle 없을 때 "현재 정산주기" 행이 없다', () => {
    render(<RfpBriefPanel rfp={rfp} buyerName="(주)진짜상사" />);
    expect(screen.queryByText('현재 정산주기')).not.toBeInTheDocument();
  });

  it('deliveryServicePeriod 있을 때 "배송 및 서비스 기간" 행이 표시된다', () => {
    render(
      <RfpBriefPanel rfp={{ ...rfp, deliveryServicePeriod: 'D+3' }} buyerName="(주)진짜상사" />,
    );
    expect(screen.getByText('배송 및 서비스 기간')).toBeInTheDocument();
    expect(screen.getByText('D+3')).toBeInTheDocument();
  });

  it('deliveryServicePeriod 없을 때 "배송 및 서비스 기간" 행이 없다', () => {
    render(<RfpBriefPanel rfp={rfp} buyerName="(주)진짜상사" />);
    expect(screen.queryByText('배송 및 서비스 기간')).not.toBeInTheDocument();
  });

  it('currentFeeVisibleToPg가 false면 "현재 카드 수수료" 행이 표시되지 않는다', () => {
    render(
      <RfpBriefPanel
        rfp={{ ...rfp, currentFeeRate: '3.4%', currentFeeVisibleToPg: false }}
        buyerName="(주)진짜상사"
      />,
    );
    expect(screen.queryByText('현재 카드 수수료')).not.toBeInTheDocument();
    expect(screen.queryByText('3.4%')).not.toBeInTheDocument();
  });

  it('currentFeeVisibleToPg가 false여도 다른 현재 조건 행은 표시된다', () => {
    render(
      <RfpBriefPanel
        rfp={{
          ...rfp,
          currentFeeRate: '3.4%',
          currentSettlementCycle: 'D+1',
          currentFeeVisibleToPg: false,
        }}
        buyerName="(주)진짜상사"
      />,
    );
    expect(screen.queryByText('현재 카드 수수료')).not.toBeInTheDocument();
    expect(screen.getByText('현재 정산주기')).toBeInTheDocument();
    expect(screen.getByText('D+1')).toBeInTheDocument();
  });

  it('currentFeeVisibleToPg가 true면 "현재 카드 수수료" 행이 표시된다', () => {
    render(
      <RfpBriefPanel
        rfp={{ ...rfp, currentFeeRate: '3.4%', currentFeeVisibleToPg: true }}
        buyerName="(주)진짜상사"
      />,
    );
    expect(screen.getByText('현재 카드 수수료')).toBeInTheDocument();
    expect(screen.getByText('3.4%')).toBeInTheDocument();
  });

  it('currentFeeVisibleToPg가 undefined(미지정)면 노출로 취급한다(하위호환)', () => {
    render(
      <RfpBriefPanel rfp={{ ...rfp, currentFeeRate: '3.4%' }} buyerName="(주)진짜상사" />,
    );
    expect(screen.getByText('현재 카드 수수료')).toBeInTheDocument();
    expect(screen.getByText('3.4%')).toBeInTheDocument();
  });

  it("contractType 'renewal' 이면 '갱신 계약' Chip이 표시된다", () => {
    render(<RfpBriefPanel rfp={{ ...rfp, contractType: 'renewal' }} buyerName="(주)진짜상사" />);
    expect(screen.getByText('갱신 계약')).toBeInTheDocument();
  });

  it("contractType 'new' 이면 '신규 계약' Chip이 표시된다", () => {
    render(<RfpBriefPanel rfp={{ ...rfp, contractType: 'new' }} buyerName="(주)진짜상사" />);
    expect(screen.getByText('신규 계약')).toBeInTheDocument();
  });

  it('contractType 없으면 계약 유형 Chip이 없다', () => {
    render(<RfpBriefPanel rfp={rfp} buyerName="(주)진짜상사" />);
    expect(screen.queryByText('신규 계약')).not.toBeInTheDocument();
    expect(screen.queryByText('갱신 계약')).not.toBeInTheDocument();
  });
});
