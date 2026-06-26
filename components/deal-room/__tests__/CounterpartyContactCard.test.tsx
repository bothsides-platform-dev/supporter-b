import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CounterpartyContactCard } from '../CounterpartyContactCard';

afterEach(cleanup);

const withPhone = { workspaceName: '토스페이먼츠', name: '김영업', email: 'sales@toss.im', phone: '010-1234-5678' };

describe('CounterpartyContactCard', () => {
  it('제목·회사명·이름·이메일(mailto)을 렌더한다', () => {
    render(<CounterpartyContactCard title="선정한 PG 담당자 연락처" contact={withPhone} />);
    expect(screen.getByText('선정한 PG 담당자 연락처')).toBeInTheDocument();
    expect(screen.getByText('토스페이먼츠')).toBeInTheDocument();
    expect(screen.getByText('김영업')).toBeInTheDocument();
    const mail = screen.getByRole('link', { name: /sales@toss\.im/ });
    expect(mail).toHaveAttribute('href', 'mailto:sales@toss.im');
  });

  it('전화가 있으면 tel 링크를 렌더한다', () => {
    render(<CounterpartyContactCard title="t" contact={withPhone} />);
    const tel = screen.getByRole('link', { name: /010-1234-5678/ });
    expect(tel).toHaveAttribute('href', 'tel:010-1234-5678');
  });

  it('전화가 null 이면 tel 링크를 렌더하지 않는다', () => {
    render(<CounterpartyContactCard title="t" contact={{ ...withPhone, phone: null }} />);
    expect(screen.queryByRole('link', { name: /010-1234-5678/ })).not.toBeInTheDocument();
    // 이메일은 여전히 노출.
    expect(screen.getByRole('link', { name: /sales@toss\.im/ })).toBeInTheDocument();
  });
});
