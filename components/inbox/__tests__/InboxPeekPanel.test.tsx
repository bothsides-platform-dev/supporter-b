import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { mockLoadPgRfpDetail } = vi.hoisted(() => ({
  mockLoadPgRfpDetail: vi.fn(),
}));

vi.mock('@/lib/server/rfp-detail-loader', () => ({
  loadPgRfpDetail: mockLoadPgRfpDetail,
}));
vi.mock('@/components/inbox/PgRfpDetailContent', () => ({
  PgRfpDetailContent: () => <div>PG RFP 상세</div>,
}));
vi.mock('@/components/ui/peek-panel-header', () => ({
  PeekPanelHeader: ({ rfpCode }: { rfpCode: string }) => (
    <div data-testid="panel-header">{rfpCode}</div>
  ),
}));

import { InboxPeekPanel } from '../InboxPeekPanel';

beforeEach(() => {
  mockLoadPgRfpDetail.mockReset();
});

describe('InboxPeekPanel', () => {
  it('데이터 없으면 "찾을 수 없습니다" 표시', async () => {
    mockLoadPgRfpDetail.mockResolvedValue(null);
    const el = await InboxPeekPanel({ rfpCode: 'P-2604-0001', wsId: 'ws-pg-1' });
    render(el);
    expect(screen.getByText(/찾을 수 없어요/)).toBeInTheDocument();
  });

  it('데이터 있으면 PeekPanelHeader + PgRfpDetailContent 렌더', async () => {
    mockLoadPgRfpDetail.mockResolvedValue({ rfp: {}, invitation: {} });
    const el = await InboxPeekPanel({ rfpCode: 'P-2604-0001', wsId: 'ws-pg-1' });
    render(el);
    expect(screen.getByTestId('panel-header')).toBeInTheDocument();
    expect(screen.getByText('PG RFP 상세')).toBeInTheDocument();
  });
});
