import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { TierContextHeader } from '../TierContextHeader';
import { MERCHANT_TIER_LABELS, MERCHANT_TIERS } from '@/lib/types/bid';

describe('TierContextHeader', () => {
  it('다른 구간을 조회해도 구매사 등급은 바뀌지 않았음을 안내한다', () => {
    const { rerender } = render(<TierContextHeader tier="general" buyerGrade="sme2" onTierChange={vi.fn()} />);
    expect(screen.getByText('내 등급: 중소2')).toBeInTheDocument();
    expect(screen.getByText(/다른 구간의 요율을 보고 있어요/)).toBeInTheDocument();
    rerender(<TierContextHeader tier="sme2" buyerGrade="sme2" onTierChange={vi.fn()} />);
    expect(screen.getByText('내 등급: 중소2')).toBeInTheDocument();
    expect(screen.queryByText(/다른 구간의 요율을 보고 있어요/)).not.toBeInTheDocument();
  });

  it('"기준 구간" 라벨이 렌더된다', () => {
    render(<TierContextHeader tier="general" onTierChange={vi.fn()} />);
    expect(screen.getByText('기준 구간')).toBeInTheDocument();
  });

  it('5개 구간 버튼이 MERCHANT_TIER_LABELS 텍스트로 렌더된다', () => {
    render(<TierContextHeader tier="general" onTierChange={vi.fn()} />);
    for (const t of MERCHANT_TIERS) {
      expect(screen.getByText(MERCHANT_TIER_LABELS[t])).toBeInTheDocument();
    }
  });

  it('tier prop에 해당하는 버튼만 aria-pressed=true', () => {
    render(<TierContextHeader tier="sme1" onTierChange={vi.fn()} />);
    const pressed = screen.getAllByRole('button').filter(
      (b) => b.getAttribute('aria-pressed') === 'true',
    );
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveTextContent(MERCHANT_TIER_LABELS['sme1']);
  });

  it('버튼 클릭 시 onTierChange(해당 tier) 호출', async () => {
    const onTierChange = vi.fn();
    render(<TierContextHeader tier="general" onTierChange={onTierChange} />);
    await userEvent.click(screen.getByText(MERCHANT_TIER_LABELS['sole']));
    expect(onTierChange).toHaveBeenCalledWith('sole');
  });
});
