// components/rfp/__tests__/RfpStep3PgSelect.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RfpStep3PgSelect } from '../RfpStep3PgSelect';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

const PG_LIST = [
  { id: 'pg-1', name: '나이스페이먼츠', displayName: '나이스페이먼츠', logoUpdatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'pg-2', name: 'KG이니시스', displayName: 'KG이니시스', logoUpdatedAt: null },
];

function resetStore() {
  useRfpDraftStore.setState({ allowedPgWorkspaceIds: [] });
}

describe('RfpStep3PgSelect', () => {
  beforeEach(resetStore);

  it('pgList 항목이 버튼으로 렌더링된다', () => {
    render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByRole('button', { name: '나이스페이먼츠' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'KG이니시스' })).toBeInTheDocument();
  });

  it('로고가 있는 PG 칩은 워크스페이스 로고 이미지를 렌더한다', () => {
    const { container } = render(
      <RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />,
    );
    expect(
      container.querySelector('img[src*="/api/workspace/pg-1/avatar"]'),
    ).not.toBeNull();
  });

  it('칩 클릭 시 store 항목에 logoUpdatedAt 가 함께 저장된다', async () => {
    const user = userEvent.setup();
    render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '나이스페이먼츠' }));
    expect(useRfpDraftStore.getState().allowedPgWorkspaceIds[0].logoUpdatedAt).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('칩 클릭 시 store에 추가된다', async () => {
    const user = userEvent.setup();
    render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '나이스페이먼츠' }));
    expect(useRfpDraftStore.getState().allowedPgWorkspaceIds).toEqual([
      { id: 'pg-1', displayName: '나이스페이먼츠', logoUpdatedAt: '2026-01-01T00:00:00.000Z' },
    ]);
  });

  it('선택된 칩 클릭 시 store에서 제거된다', async () => {
    const user = userEvent.setup();
    useRfpDraftStore.setState({
      allowedPgWorkspaceIds: [{ id: 'pg-1', displayName: '나이스페이먼츠', logoUpdatedAt: null }],
    });
    render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '나이스페이먼츠' }));
    expect(useRfpDraftStore.getState().allowedPgWorkspaceIds).toHaveLength(0);
  });

  it('전체 선택 버튼 클릭 시 pgList 전체가 store에 추가된다', async () => {
    const user = userEvent.setup();
    render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '전체 선택' }));
    expect(useRfpDraftStore.getState().allowedPgWorkspaceIds).toEqual([
      { id: 'pg-1', displayName: '나이스페이먼츠', logoUpdatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'pg-2', displayName: 'KG이니시스', logoUpdatedAt: null },
    ]);
  });

  it('전체 선택 후 버튼 라벨이 "전체 해제"로 바뀐다', async () => {
    const user = userEvent.setup();
    render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '전체 선택' }));
    expect(screen.getByRole('button', { name: '전체 해제' })).toBeInTheDocument();
  });

  it('전체 해제 버튼 클릭 시 store가 빈 배열이 된다', async () => {
    const user = userEvent.setup();
    useRfpDraftStore.setState({
      allowedPgWorkspaceIds: [
        { id: 'pg-1', displayName: '나이스페이먼츠', logoUpdatedAt: null },
        { id: 'pg-2', displayName: 'KG이니시스', logoUpdatedAt: null },
      ],
    });
    render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '전체 해제' }));
    expect(useRfpDraftStore.getState().allowedPgWorkspaceIds).toHaveLength(0);
  });

  it('이전/다음 버튼 클릭 시 onBack/onNext가 호출된다', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onNext = vi.fn();
    render(<RfpStep3PgSelect pgList={PG_LIST} onBack={onBack} onNext={onNext} />);
    await user.click(screen.getByRole('button', { name: '이전' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
  });

  describe('PG 미선택 인라인 에러 (attempted)', () => {
    it('다음 클릭 전에는 PG 미선택이어도 에러 메시지가 표시되지 않는다', () => {
      render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
      expect(screen.queryByText('PG를 1개 이상 선택해주세요')).not.toBeInTheDocument();
    });

    it('다음 클릭 후 PG 미선택 시 에러 메시지가 표시된다', async () => {
      const user = userEvent.setup();
      render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: '다음' }));
      expect(screen.getByText('PG를 1개 이상 선택해주세요')).toBeInTheDocument();
    });

    it('다음 클릭 후 PG 선택하면 에러 메시지가 사라진다', async () => {
      const user = userEvent.setup();
      render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: '다음' }));
      await user.click(screen.getByRole('button', { name: '나이스페이먼츠' }));
      expect(screen.queryByText('PG를 1개 이상 선택해주세요')).not.toBeInTheDocument();
    });

    it('showFieldErrors=true 이면 다음 클릭 없이도 PG 미선택 에러가 표시된다', () => {
      render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} showFieldErrors />);
      expect(screen.getByText('PG를 1개 이상 선택해주세요')).toBeInTheDocument();
    });
  });

  it('pgList가 비어있으면 칩이 렌더링되지 않고 전체 선택 버튼은 클릭해도 store가 변하지 않는다', async () => {
    const user = userEvent.setup();
    render(<RfpStep3PgSelect pgList={[]} onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '나이스페이먼츠' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '전체 선택' }));
    expect(useRfpDraftStore.getState().allowedPgWorkspaceIds).toHaveLength(0);
  });
});
