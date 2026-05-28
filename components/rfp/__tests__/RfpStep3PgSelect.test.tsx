// components/rfp/__tests__/RfpStep3PgSelect.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RfpStep3PgSelect } from '../RfpStep3PgSelect';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

vi.mock('@/hooks/useLazyPgWorkspaces', () => ({
  useLazyPgWorkspaces: () => ({
    pgList: [
      { id: 'pg-1', displayName: '나이스페이먼츠' },
      { id: 'pg-2', displayName: 'KG이니시스' },
    ],
    loading: false,
    error: null,
    load: vi.fn(),
  }),
}));

function resetStore() {
  useRfpDraftStore.setState({ allowedPgWorkspaceIds: [] });
}

describe('RfpStep3PgSelect', () => {
  beforeEach(resetStore);

  it('PG가 없으면 다음 버튼이 비활성화된다', () => {
    render(<RfpStep3PgSelect onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
  });

  it('PG 추가 후 다음 버튼이 활성화된다', () => {
    useRfpDraftStore.setState({
      allowedPgWorkspaceIds: [{ id: 'pg-1', displayName: '나이스페이먼츠' }],
    });
    render(<RfpStep3PgSelect onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByRole('button', { name: '다음' })).not.toBeDisabled();
  });

  it('선택된 PG 이름이 목록에 표시된다', () => {
    useRfpDraftStore.setState({
      allowedPgWorkspaceIds: [{ id: 'pg-1', displayName: '나이스페이먼츠' }],
    });
    render(<RfpStep3PgSelect onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByText('나이스페이먼츠')).toBeInTheDocument();
  });

  it('제거 버튼 클릭 시 store에서 해당 PG가 제거된다', async () => {
    const user = userEvent.setup();
    useRfpDraftStore.setState({
      allowedPgWorkspaceIds: [{ id: 'pg-1', displayName: '나이스페이먼츠' }],
    });
    render(<RfpStep3PgSelect onBack={vi.fn()} onNext={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '제거' }));
    expect(useRfpDraftStore.getState().allowedPgWorkspaceIds).toHaveLength(0);
  });

  it('이전 버튼 클릭 시 onBack이 호출된다', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<RfpStep3PgSelect onBack={onBack} onNext={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '이전' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
