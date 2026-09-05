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

  // 저장된 초안이 pgList 의 상위집합이 될 수 있다 — 테스트 PG 숨김(v0.4.53.0)이
  // 생기기 전에는 도달 불가능한 상태였다. 초안에 남은 항목이 목록에서 사라져도
  // 화면이 깨지지 않고, 전체 선택이 현재 목록으로 정규화하는 것을 못박는다.
  describe('초안에 pgList 밖 항목이 남아 있을 때', () => {
    const STALE = { id: 'pg-hidden', displayName: '테스트 PG사', logoUpdatedAt: null };

    it('목록에 없는 항목은 칩으로 그리지 않고 나머지는 정상 렌더한다', () => {
      useRfpDraftStore.setState({ allowedPgWorkspaceIds: [STALE] });
      render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
      expect(screen.queryByRole('button', { name: '테스트 PG사' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '나이스페이먼츠' })).toBeInTheDocument();
    });

    it('전체 선택이 초안을 현재 pgList 로 정규화한다 (남은 항목 제거)', async () => {
      const user = userEvent.setup();
      useRfpDraftStore.setState({ allowedPgWorkspaceIds: [STALE] });
      render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: '전체 선택' }));
      expect(useRfpDraftStore.getState().allowedPgWorkspaceIds.map((w) => w.id)).toEqual([
        'pg-1',
        'pg-2',
      ]);
    });

    it('보이는 칩을 전부 골라도 남은 항목 때문에 전체 해제로 바뀌지 않는다', async () => {
      const user = userEvent.setup();
      useRfpDraftStore.setState({ allowedPgWorkspaceIds: [STALE] });
      render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: '나이스페이먼츠' }));
      await user.click(screen.getByRole('button', { name: 'KG이니시스' }));
      expect(screen.getByRole('button', { name: '전체 선택' })).toBeInTheDocument();
    });
  });

  it('다음 버튼에 튜토리얼 코치마크 앵커가 있다', () => {
    render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByRole('button', { name: '다음' })).toHaveAttribute(
      'data-coachmark',
      'tutorial-wizard-next-3',
    );
  });

  // ── 선택 상태 명시성 ────────────────────────────────────────────────
  // 사용자 피드백: "각 PG사가 선택이 되었는지 헷갈린다". 화면에 있는 문제는 둘이다 —
  // (a) 로고 타일이 고를 수 있는 물건으로 안 읽히고(커서·hover·포커스가 전부 없다),
  // (b) 골랐을 때 표시가 색 채움 하나뿐이다(WCAG 1.4.1 색 단독 전달).
  describe('선택 상태 명시성', () => {
    it('모든 칩에 aria-pressed 가 실리고 클릭하면 뒤집힌다', async () => {
      const user = userEvent.setup();
      render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
      expect(screen.getByRole('button', { name: '나이스페이먼츠' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      await user.click(screen.getByRole('button', { name: '나이스페이먼츠' }));
      expect(screen.getByRole('button', { name: '나이스페이먼츠' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    // DESIGN.md:367 — raw <button> 은 상호작용 값을 직접 실어야 한다.
    // Tailwind v4 Preflight 가 button { cursor: default } 를 깔아두므로 빠지면
    // 커서가 화살표로 남고 hover 가 끊기고 포커스 표시가 사라진다.
    it('칩이 raw button 상호작용 3종 세트를 싣는다', () => {
      render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
      const chip = screen.getByRole('button', { name: '나이스페이먼츠' });
      expect(chip.className).toContain('cursor-pointer');
      expect(chip.className).toContain('transition-colors');
      expect(chip.className).toContain('focus-visible:ring-2');
    });

    // 인디케이터가 선택 시에만 붙으면 칩 폭이 변해 커서 아래에서 다음 타깃이 움직인다.
    // 빈 박스는 미선택 상태에서도 "여긴 고르는 자리"라고 말한다 — (a) 를 닫는 것이 이쪽이다.
    it('체크 인디케이터가 선택/미선택 양쪽 모두에 존재한다', async () => {
      const user = userEvent.setup();
      render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
      expect(screen.getAllByTestId('pg-chip-check')).toHaveLength(PG_LIST.length);
      expect(
        screen.getAllByTestId('pg-chip-check').every((el) => el.dataset.state === 'unchecked'),
      ).toBe(true);

      await user.click(screen.getByRole('button', { name: '나이스페이먼츠' }));

      const marks = screen.getAllByTestId('pg-chip-check');
      expect(marks).toHaveLength(PG_LIST.length);
      expect(marks.filter((el) => el.dataset.state === 'checked')).toHaveLength(1);
    });

    it('0개 선택 상태에서도 카운터가 보인다', () => {
      render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
      expect(screen.getByTestId('pg-select-count')).toHaveTextContent('0/2 선택');
    });

    it('선택하면 카운터가 올라간다', async () => {
      const user = userEvent.setup();
      render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: '나이스페이먼츠' }));
      expect(screen.getByTestId('pg-select-count')).toHaveTextContent('1/2 선택');
    });

    // 선택 필드의 완료 라벨은 '입력 완료'가 아니라 '선택됨'이다 (#528 의 filledLabel).
    it('PG 를 고르면 필수 마커가 선택됨으로 바뀐다', async () => {
      const user = userEvent.setup();
      render(
        <RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} showFieldErrors />,
      );
      expect(screen.getByText('필수')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '나이스페이먼츠' }));
      expect(screen.getByText('선택됨')).toBeInTheDocument();
    });

    // 전체 선택도 같은 raw <button> 이라 같은 값이 필요하다.
    it('전체 선택 버튼이 커서와 포커스 링을 싣는다', () => {
      render(<RfpStep3PgSelect pgList={PG_LIST} onBack={vi.fn()} onNext={vi.fn()} />);
      const toggleAll = screen.getByRole('button', { name: '전체 선택' });
      expect(toggleAll.className).toContain('cursor-pointer');
      expect(toggleAll.className).toContain('focus-visible:ring-2');
    });
  });
});
