import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { motionValue } from 'motion/react';
import { ScrollDrivenProblem } from '../scroll-pinned/ScrollDrivenProblem';

const scroll = vi.hoisted(() => ({ progress: null as unknown }));
vi.mock('motion/react', async (importOriginal) => ({
  ...await importOriginal<typeof import('motion/react')>(),
  useScroll: () => ({ scrollYProgress: scroll.progress }),
}));

const items = [
  { num: '01', title: '수수료', desc: '계약 전에 확인해요.' },
  { num: '02', title: '견적', desc: '조건을 확인해요.' },
  { num: '03', title: '심사', desc: '승인을 확인해요.' },
  { num: '04', title: '정산', desc: '주기를 확인해요.' },
];
beforeEach(() => { scroll.progress = motionValue(0); });

it('질문은 모두 읽을 수 있고 스크롤과 역스크롤에 따라 현재 질문이 바뀐다', () => {
  render(<ScrollDrivenProblem heading={<h2>PG 계약의 어려움</h2>} items={items} {...{ presentation: 'focus' as const }} />);
  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(4);
  expect(screen.getByText('계약 전에 확인해요.')).toBeVisible();
  expect(screen.getByRole('button', { name: '수수료' })).toHaveAttribute('aria-current', 'step');
  expect(screen.queryByText(/0[1-4]/)).not.toBeInTheDocument();

  act(() => { (scroll.progress as ReturnType<typeof motionValue<number>>).set(1); });
  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(4);
  expect(screen.getByText('주기를 확인해요.')).toBeVisible();
  expect(screen.getByRole('button', { name: '정산' })).toHaveAttribute('aria-current', 'step');

  act(() => { (scroll.progress as ReturnType<typeof motionValue<number>>).set(0.3); });

  expect(screen.getByRole('button', { name: '견적' })).toHaveAttribute('aria-current', 'step');
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('PG 계약의 어려움');
});

it('기존 PG 랜딩의 기본 누적형은 유지한다', () => {
  render(<ScrollDrivenProblem heading={<h2>PG 영업</h2>} items={items} />);
  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(4);
});

it('질문을 선택하면 그 질문을 화면 중앙으로 이동한다', () => {
  const scrollIntoView = vi.fn();
  render(<ScrollDrivenProblem heading={<h2>PG 계약</h2>} items={items} presentation="focus" />);
  const question = screen.getByRole('button', { name: '심사' });
  const article = question.closest('article')!;
  article.scrollIntoView = scrollIntoView;
  fireEvent.click(question);
  expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
});
