// components/rfp/__tests__/RfpCreateWizard.sampleSubmit.test.tsx
// 가상 샘플(buyer 튜토리얼) 종결 "보내기" — onSampleSubmit이 있으면 실제
// createRfpAction/draft 핸드오프/router.push를 전부 우회하고 콜백만 호출한다.
// BidWizard의 onSampleSubmit(components/inbox/bid-wizard/BidWizard.tsx)과 대칭.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RfpCreateWizard } from '../RfpCreateWizard';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

vi.mock('../RfpStep1BizProfile', () => ({
  RfpStep1BizProfile: ({ onNext }: { onNext: () => void }) => (
    <button type="button" onClick={onNext}>다음</button>
  ),
}));
vi.mock('../RfpStep2Content', () => ({
  RfpStep2Content: ({ onNext }: { onNext: () => void }) => (
    <button type="button" onClick={onNext}>다음</button>
  ),
}));
vi.mock('../RfpStep3PgSelect', () => ({
  RfpStep3PgSelect: ({ onNext }: { onNext: () => void }) => (
    <button type="button" onClick={onNext}>다음</button>
  ),
}));
vi.mock('../RfpStep4Review', () => ({
  RfpStep4Review: ({ onSubmit }: { onSubmit: () => Promise<void> }) => (
    <button type="button" onClick={onSubmit}>발송</button>
  ),
}));

vi.mock('@/lib/server/actions/rfp', () => ({
  createRfpAction: vi.fn(),
  verifyDraftFilesAction: vi.fn(),
}));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

import { createRfpAction } from '@/lib/server/actions/rfp';

function resetStore() {
  useRfpDraftStore.setState({
    title: '테스트',
    deadline: '2099-01-01T00:00:00Z',
    allowedPgWorkspaceIds: [{ id: 'pg-1', displayName: '나이스', logoUpdatedAt: null }],
    rfpFiles: [],
    websiteUrl: 'https://example.com',
    requiredPaymentMethods: ['card'],
    customPaymentMethods: [],
    mainProducts: '의류',
    annualPgVolume: '1000000000',
    contractType: 'new',
    pgSelectionInitialized: true,
  });
}

describe('RfpCreateWizard onSampleSubmit (가상 샘플 온보딩 — buyer 튜토리얼)', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('onSampleSubmit이 있으면 서버 제출 액션 대신 콜백만 호출한다', async () => {
    const onSampleSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <RfpCreateWizard pgList={[]} step={4} onStepChange={vi.fn()} onSampleSubmit={onSampleSubmit} />,
    );
    await user.click(screen.getByRole('button', { name: '발송' }));

    await waitFor(() => expect(onSampleSubmit).toHaveBeenCalledTimes(1));
    expect(createRfpAction).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('샘플 모드에서는 마운트 stale-draft 정리를 건너뛴다 (실 draft 오염 방지)', async () => {
    // React는 자식 effect를 부모보다 먼저 실행한다 — 튜토리얼(부모)의 격리 스냅샷 전에
    // 위저드(자식)의 PG 재조정이 fixture pgList 기준으로 실제 draft를 훼손하면 안 된다.
    useRfpDraftStore.setState({
      allowedPgWorkspaceIds: [{ id: 'real-pg-uuid', displayName: '실PG', logoUpdatedAt: null }],
      pgSelectionInitialized: true,
    });
    render(
      <RfpCreateWizard
        pgList={[{ id: 'tutorial-pg-a', name: '튜토리얼페이 A', displayName: '튜토리얼페이 A', logoUpdatedAt: null }]}
        step={1}
        onStepChange={vi.fn()}
        onSampleSubmit={vi.fn()}
      />,
    );

    // 정리 로직이 돌았다면 real-pg-uuid는 pgList에 없어 제거됐을 것.
    await waitFor(() =>
      expect(useRfpDraftStore.getState().allowedPgWorkspaceIds.map((w) => w.id)).toEqual([
        'real-pg-uuid',
      ]),
    );
  });
});
