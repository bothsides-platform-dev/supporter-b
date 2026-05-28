import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { mockLoadBuyerRfpDetail, mockLoadBoard } = vi.hoisted(() => ({
  mockLoadBuyerRfpDetail: vi.fn(),
  mockLoadBoard: vi.fn(),
}));

vi.mock('@/lib/server/rfp-detail-loader', () => ({
  loadBuyerRfpDetail: mockLoadBuyerRfpDetail,
}));
vi.mock('@/lib/server/board/loadBoard', () => ({
  loadBoard: mockLoadBoard,
}));
vi.mock('@/components/rfp/RfpDetailContent', () => ({
  RfpDetailContent: () => <div>RFP 상세 내용</div>,
}));
vi.mock('@/components/ui/peek-panel-header', () => ({
  PeekPanelHeader: ({ rfpCode }: { rfpCode: string }) => (
    <div data-testid="panel-header">{rfpCode}</div>
  ),
}));

import { RfpPeekPanel } from '../RfpPeekPanel';

const mockData = {
  rfp: { id: 'rfp-uuid', buyerWsId: 'ws-1', code: 'P-2604-0001', title: 'Test' },
};
const mockBoard = { columns: [], cards: [] };

beforeEach(() => {
  mockLoadBuyerRfpDetail.mockReset();
  mockLoadBoard.mockReset();
});

describe('RfpPeekPanel', () => {
  it('데이터 없으면 "찾을 수 없습니다" 표시', async () => {
    mockLoadBuyerRfpDetail.mockResolvedValue(null);
    const el = await RfpPeekPanel({ rfpCode: 'P-2604-0001', wsId: 'ws-1', userId: 'u1', userName: 'User' });
    render(el);
    expect(screen.getByText(/찾을 수 없습니다/)).toBeInTheDocument();
  });

  it('데이터 있으면 PeekPanelHeader + RfpDetailContent 렌더', async () => {
    mockLoadBuyerRfpDetail.mockResolvedValue(mockData);
    mockLoadBoard.mockResolvedValue(mockBoard);
    const el = await RfpPeekPanel({ rfpCode: 'P-2604-0001', wsId: 'ws-1', userId: 'u1', userName: 'User' });
    render(el);
    expect(screen.getByTestId('panel-header')).toBeInTheDocument();
    expect(screen.getByText('RFP 상세 내용')).toBeInTheDocument();
  });
});
