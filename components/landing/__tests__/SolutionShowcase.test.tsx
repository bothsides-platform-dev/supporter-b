import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/components/landing/OfferComparisonTable', () => ({ OfferComparisonTable: () => null }));
import { SolutionShowcase } from '../SolutionShowcase';
const points = ['수수료', '조건', '협의', '선택'].map(title => ({ title, description: title + ' 설명' }));
describe('SolutionShowcase', () => {
  it('선택 버튼은 클릭과 키보드로 단계 이동을 요청한다', async () => {
    const select = vi.fn();
    const user = userEvent.setup();
    render(<SolutionShowcase points={points} activeStep={0} onSelect={select} />);
    const buttons = screen.getAllByRole('button');
    await user.click(buttons[1]);
    expect(select).toHaveBeenLastCalledWith(1);
    buttons[2].focus();
    await user.keyboard('{Enter}');
    expect(select).toHaveBeenLastCalledWith(2);
    buttons[3].focus();
    await user.keyboard(' ');
    expect(select).toHaveBeenLastCalledWith(3);
  });
  it('역스크롤 단계 변경에도 선택 상태와 설명이 함께 바뀐다', () => {
    const { rerender } = render(<SolutionShowcase points={points} activeStep={3} />);
    expect(screen.getByRole('button', { name: '선택' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('선택 설명')).toBeVisible();
    rerender(<SolutionShowcase points={points} activeStep={0} />);
    expect(screen.getByRole('button', { name: '수수료' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('수수료 설명')).toBeVisible();
    expect(screen.getByText('선택 설명')).not.toBeVisible();
  });
});
