// RfpBriefPanel — PG 측 RFP 상세 좌측 브리프 패널.
// 상호명이 buyerName prop에서 오는지, 하드코딩 가짜값이 없는지 확인.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const counterpartyCapture = vi.fn();
vi.mock('@/components/messages/MessageComposeButton', () => ({
  MessageComposeButton: (props: { counterparty: { name: string } }) => {
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

  it('MessageComposeButton에 counterparty.name으로 buyerName을 전달한다', () => {
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
});
