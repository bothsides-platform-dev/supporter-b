// /pg-landing — partner(PG) 호스트 "/" 가 proxy.ts rewrite 로 도달하는 정적 페이지.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/landing/PgLanding', () => ({
  PgLanding: () => <div>PG_LANDING</div>,
}));

import PgLandingPage from '../page';

describe('PgLandingPage', () => {
  it('PG 랜딩화면을 렌더한다', () => {
    render(<PgLandingPage />);
    expect(screen.getByText('PG_LANDING')).toBeInTheDocument();
  });
});
