import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PgLanding } from '../PgLanding';

describe('PgLanding — PG 전용 랜딩', () => {
  it('PG 랜딩화면 텍스트를 렌더한다', () => {
    render(<PgLanding />);
    expect(screen.getByText('PG 랜딩화면')).toBeInTheDocument();
  });
});
