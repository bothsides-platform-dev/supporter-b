import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RfpStep2Content } from '../RfpStep2Content';
import { RfpStep3PgSelect } from '../RfpStep3PgSelect';
import { getWizardValidity } from '../wizard-validation';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

vi.mock('../RfpAttachmentDropzone', () => ({ RfpAttachmentDropzone: () => null }));

const groups = [{ id: 'shopping', name: '쇼핑', pgWorkspaceIds: ['pg-1'] }];
const pgList = [
  { id: 'pg-1', name: '추천 PG', displayName: '추천 PG', logoUpdatedAt: null },
  { id: 'pg-2', name: '다른 PG', displayName: '다른 PG', logoUpdatedAt: null },
];

describe('업종별 PG 추천', () => {
  beforeEach(() => useRfpDraftStore.getState().reset());

  it('구매사가 업종을 직접 선택하고 작성 초안에 보관한다', async () => {
    render(<RfpStep2Content onBack={vi.fn()} onNext={vi.fn()} industryGroups={groups} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '쇼핑' }));
    expect(useRfpDraftStore.getState().industryGroupId).toBe('shopping');
  });

  it('등록된 업종이 있으면 작성 단계에서 업종 선택을 요구한다', () => {
    const draft = { ...useRfpDraftStore.getState(), title: '견적 요청', websiteUrl: 'https://example.com', contractType: 'new' as const, mainProducts: '의류', requiredPaymentMethods: ['card'] as const };
    expect(getWizardValidity(draft, groups)[1].complete).toBe(false);
    expect(getWizardValidity(draft, groups)[1].hint).toBe('업종을 선택해주세요');
    expect(getWizardValidity({ ...draft, industryGroupId: 'shopping' }, groups)[1].complete).toBe(true);
  });

  it('추천 PG를 먼저 보여주고 구매사가 직접 선택한다', async () => {
    useRfpDraftStore.setState({ industryGroupId: 'shopping' });
    render(<RfpStep3PgSelect pgList={pgList} recommendedPgIds={['pg-1']} industryName="쇼핑" />);
    expect(screen.getByText('쇼핑 업종에 맞는 PG사')).toBeInTheDocument();
    expect(screen.getByText('다른 PG사')).toBeInTheDocument();
    expect(useRfpDraftStore.getState().allowedPgWorkspaceIds).toEqual([]);
    await userEvent.setup().click(screen.getByRole('button', { name: '추천 PG' }));
    expect(useRfpDraftStore.getState().allowedPgWorkspaceIds.map((pg) => pg.id)).toEqual(['pg-1']);
  });
});
