import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { RfpMatchingSelection } from '../RfpMatchingSelection';

const mocks = vi.hoisted(() => ({ business: vi.fn(), recommend: vi.fn() }));
vi.mock('@/lib/server/actions/rfp/matching', () => ({ matchingBusinessAction: mocks.business, recommendPgAction: mocks.recommend }));
const result = { ok: true, recommendation: { risk: 'gray', industryName: '강의', candidates: [
  { pgWorkspaceId: 'pg-1', name: 'Alpha', reason: '강의 서비스 추가 검토', feeMin: 0.8, feeMax: 0.9, feeNote: '부가세 별도' },
  { pgWorkspaceId: 'pg-2', name: 'Beta', reason: '교육 분야 상담', feeMin: null, feeMax: null, feeNote: '' },
] } };
beforeEach(() => {
  useRfpDraftStore.getState().reset();
  useRfpDraftStore.getState().setField('industryGroupId', 'industry-1');
  mocks.business.mockResolvedValue({ ok: true, hasBusinessProfile: true });
  mocks.recommend.mockResolvedValue(result);
});
describe('맞춤 PG 선택', () => {
  it('실제 단계 응답을 기다리며 진행률을 표시하고 추천 중 한 곳만 선택한다', async () => {
    let finish!: (value: unknown) => void;
    mocks.recommend.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<RfpMatchingSelection />);
    await waitFor(() => expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50'));
    await act(async () => finish(result));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('입점 조건을 추가로 확인해야 해요')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: /Alpha/ }));
    await user.click(screen.getByRole('radio', { name: /Beta/ }));
    expect(useRfpDraftStore.getState().allowedPgWorkspaceIds).toEqual([{ id: 'pg-2', displayName: 'Beta', logoUpdatedAt: null }]);
    expect(screen.getByText('견적에서 안내해요')).toBeInTheDocument();
  });
  it('차단 업종은 PG 선택을 제공하지 않고 문의 경로를 안내한다', async () => {
    mocks.recommend.mockResolvedValue({ ok: true, recommendation: { risk: 'black', industryName: '제한 업종', candidates: [] } });
    render(<RfpMatchingSelection />);
    expect(await screen.findByText('입력한 사업은 현재 신청을 진행하기 어려워요')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '운영팀에 문의해요' })).toHaveAttribute('href', 'mailto:help@support-b.com');
  });
  it('연결 실패를 완료로 꾸미지 않고 다시 시도할 수 있다', async () => {
    mocks.recommend.mockRejectedValueOnce(new Error('network'));
    render(<RfpMatchingSelection />);
    await userEvent.setup().click(await screen.findByRole('button', { name: '다시 확인해요' }));
    expect(await screen.findByRole('radio', { name: /Alpha/ })).toBeInTheDocument();
  });
  it('업종 설정이 없을 때 운영팀에 문의할 수 있다', async () => {
    mocks.recommend.mockResolvedValue({ ok: false, error: 'MATCHING_REQUIRED' });
    render(<RfpMatchingSelection />);
    await screen.findByRole('alert');
    expect(screen.getByRole('link', { name: '운영팀에 문의해요' })).toHaveAttribute('href', 'mailto:help@support-b.com');
  });
});
