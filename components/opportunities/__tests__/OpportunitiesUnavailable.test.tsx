import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OpportunitiesUnavailable } from '../OpportunitiesUnavailable';

describe('OpportunitiesUnavailable', () => {
  it('준비중 안내 문구를 보여준다', () => {
    render(<OpportunitiesUnavailable />);
    expect(screen.getByText('참여 가능한 견적을 잠시 닫았어요')).toBeInTheDocument();
    expect(screen.getByText('곧 다시 열릴 예정이에요.')).toBeInTheDocument();
  });
});
