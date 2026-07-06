import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SampleExperienceBanner } from '../SampleExperienceBanner';

describe('SampleExperienceBanner', () => {
  it('구매사 variant는 흐름 안내 문구를 보여준다', () => {
    render(<SampleExperienceBanner variant="buyer" />);
    expect(screen.getByText(/요청 1건 작성/)).toBeInTheDocument();
  });

  it('PG variant는 흐름 안내 문구를 보여준다', () => {
    render(<SampleExperienceBanner variant="pg" />);
    expect(screen.getByText(/견적 작성/)).toBeInTheDocument();
  });

  it('완료 전에는 구매사 CTA가 보이지 않는다', () => {
    render(<SampleExperienceBanner variant="buyer" />);
    expect(screen.queryByRole('link', { name: /실제 견적 요청/ })).not.toBeInTheDocument();
  });

  it('완료 후 구매사는 /rfp-create 로 가는 CTA를 보여준다', () => {
    render(<SampleExperienceBanner variant="buyer" completed />);
    const cta = screen.getByRole('link', { name: /실제 견적 요청/ });
    expect(cta).toHaveAttribute('href', '/rfp-create');
  });
});
