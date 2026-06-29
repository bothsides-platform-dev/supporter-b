import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { RfpStep4Review } from '../RfpStep4Review';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

beforeEach(() => {
  useRfpDraftStore.setState({
    title: '테스트 제안건',
    deadline: '',
    allowedPgWorkspaceIds: [],
    websiteUrl: 'https://example.com',
    annualPgVolume: '10억',
    currentSolution: 'cafe24',
    currentSettlementCycle: '',
    deliveryServicePeriod: '',
    boardVisible: true,
    currentFeeRate: '',
    currentFeeVisibleToPg: true,
    contractType: null,
    memo: '',
    rfpFiles: [],
  });
});

describe('RfpStep4Review — open board disabled (flag off)', () => {
  it('오픈 게시판 노출 체크박스를 렌더하지 않는다', () => {
    render(
      <RfpStep4Review
        onBack={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        submitting={false}
        serverError=""
      />,
    );
    expect(screen.queryByRole('checkbox', { name: /오픈 게시판/ })).not.toBeInTheDocument();
  });
});
