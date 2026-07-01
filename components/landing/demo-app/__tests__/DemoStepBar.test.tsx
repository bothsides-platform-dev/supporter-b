import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DemoStepBar } from '../DemoStepBar';

const noop = () => {};
const base = { intervalMs: 4500, onSelect: noop, onReplay: noop };

describe('DemoStepBar', () => {
  it('4개 단계를 번호+이름으로 렌더한다', () => {
    render(<DemoStepBar current={1} autoplaying {...base} />);
    for (const name of ['1 홈', '2 견적 요청', '3 견적 비교·선정', '4 새 견적 요청']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('현재 단계를 aria-current=step으로 표시한다', () => {
    render(<DemoStepBar current={3} autoplaying {...base} />);
    expect(screen.getByRole('button', { name: '3 견적 비교·선정' })).toHaveAttribute(
      'aria-current',
      'step',
    );
  });

  it('단계 클릭이 onSelect를 그 번호로 호출한다', () => {
    const onSelect = vi.fn();
    render(<DemoStepBar current={1} autoplaying intervalMs={4500} onSelect={onSelect} onReplay={noop} />);
    fireEvent.click(screen.getByRole('button', { name: '4 새 견적 요청' }));
    expect(onSelect).toHaveBeenCalledWith(4);
  });

  it('재생 중에는 다시 보기를 숨기고, 멈추면 노출해 onReplay를 호출한다', () => {
    const onReplay = vi.fn();
    const { rerender } = render(
      <DemoStepBar current={2} autoplaying intervalMs={4500} onSelect={noop} onReplay={onReplay} />,
    );
    expect(screen.queryByRole('button', { name: '처음부터 다시 보기' })).toBeNull();
    rerender(
      <DemoStepBar current={4} autoplaying={false} intervalMs={4500} onSelect={noop} onReplay={onReplay} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '처음부터 다시 보기' }));
    expect(onReplay).toHaveBeenCalled();
  });
});
