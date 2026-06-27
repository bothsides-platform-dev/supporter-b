import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { TierContextHeader } from '../TierContextHeader';
import { MERCHANT_TIER_LABELS, MERCHANT_TIERS } from '@/lib/types/bid';

describe('TierContextHeader', () => {
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
