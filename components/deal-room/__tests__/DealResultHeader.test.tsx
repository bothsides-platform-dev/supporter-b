import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DealResultHeader } from '../DealResultHeader';

afterEach(cleanup);

describe('DealResultHeader', () => {
  it('award 톤은 tertiary(초록) 제목 + subtitle + children 슬롯을 렌더한다', () => {
    render(
      <DealResultHeader tone="award" title="이 견적이 선정됐어요" subtitle="보낸 시각 어제">
        <div data-testid="slot" />
      </DealResultHeader>,
    );
    const h = screen.getByRole('heading', { name: /이 견적이 선정됐어요/ });
    expect(h.className).toContain('--md-sys-color-tertiary');
    expect(screen.getByText('보낸 시각 어제')).toBeInTheDocument();
    expect(screen.getByTestId('slot')).toBeInTheDocument();
  });

  it('neutral 톤은 tertiary(초록)·error(빨강) 색 클래스를 쓰지 않는다', () => {
    render(<DealResultHeader tone="neutral" title="이번엔 선정되지 않았어요" subtitle="다음 기회에" />);
    const h = screen.getByRole('heading', { name: /이번엔 선정되지 않았어요/ });
    expect(h.className).not.toContain('--md-sys-color-tertiary');
    expect(h.className).not.toContain('--md-sys-color-error');
    expect(screen.getByText('다음 기회에')).toBeInTheDocument();
  });
});
