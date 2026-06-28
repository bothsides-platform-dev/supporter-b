import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));

import { ContactBlock } from '../ContactBlock';

afterEach(cleanup);

const withPhone = { workspaceName: '토스페이먼츠', name: '김영업', email: 'sales@toss.im', phone: '010-1234-5678' };

describe('ContactBlock', () => {
  it('이름·회사칩(상대 구분)·이메일(mailto)·전화(tel)를 렌더한다', () => {
    render(<ContactBlock contact={withPhone} counterpartyKind="pg" />);
    expect(screen.getByText('김영업')).toBeInTheDocument();
    expect(screen.getByText(/PG · 토스페이먼츠/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sales@toss\.im/ })).toHaveAttribute('href', 'mailto:sales@toss.im');
    expect(screen.getByRole('link', { name: /010-1234-5678/ })).toHaveAttribute('href', 'tel:010-1234-5678');
  });

  it('counterpartyKind=buyer 면 칩 라벨이 구매사다', () => {
    render(<ContactBlock contact={withPhone} counterpartyKind="buyer" />);
    expect(screen.getByText(/구매사 · 토스페이먼츠/)).toBeInTheDocument();
  });

  it('전화가 null 이면 tel 링크와 그 복사 버튼을 렌더하지 않는다(이메일은 유지)', () => {
    render(<ContactBlock contact={{ ...withPhone, phone: null }} counterpartyKind="pg" />);
    expect(screen.queryByRole('link', { name: /010-1234-5678/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '전화 복사' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sales@toss\.im/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이메일 복사' })).toBeInTheDocument();
  });
});
