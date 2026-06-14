import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PgCustomerCarousel } from '../PgCustomerCarousel';

const ITEMS = [
  { title: '카드1 제목', desc: '카드1 설명' },
  { title: '카드2 제목', desc: '카드2 설명' },
  { title: '카드3 제목', desc: '카드3 설명' },
];

describe('PgCustomerCarousel — 좌우 캐러셀', () => {
  it('처음에는 첫 카드를 보여준다', () => {
    render(<PgCustomerCarousel items={ITEMS} />);
    expect(screen.getByText('카드1 제목')).toBeInTheDocument();
    expect(screen.getByText('카드1 설명')).toBeInTheDocument();
  });

  it('다음 버튼을 누르면 다음 카드로 전환된다', async () => {
    const user = userEvent.setup();
    render(<PgCustomerCarousel items={ITEMS} />);
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('카드2 제목')).toBeInTheDocument();
  });

  it('첫 카드에서 이전을 누르면 마지막 카드로 wrap 된다', async () => {
    const user = userEvent.setup();
    render(<PgCustomerCarousel items={ITEMS} />);
    await user.click(screen.getByRole('button', { name: '이전' }));
    expect(screen.getByText('카드3 제목')).toBeInTheDocument();
  });

  it('마지막 카드에서 다음을 누르면 첫 카드로 wrap 된다', async () => {
    const user = userEvent.setup();
    render(<PgCustomerCarousel items={ITEMS} />);
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('카드1 제목')).toBeInTheDocument();
  });

  it('dot 을 누르면 해당 카드로 점프한다', async () => {
    const user = userEvent.setup();
    render(<PgCustomerCarousel items={ITEMS} />);
    await user.click(screen.getByRole('button', { name: '3번째 카드 보기' }));
    expect(screen.getByText('카드3 제목')).toBeInTheDocument();
  });
});
