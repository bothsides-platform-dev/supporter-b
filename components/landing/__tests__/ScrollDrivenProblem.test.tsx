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

it('집중형은 현재 문제만 노출하고 빠른 이동과 역스크롤에도 진행 표시를 맞춘다', () => {
  render(<ScrollDrivenProblem heading={<h2>PG 계약의 어려움</h2>} items={items} {...{ presentation: 'focus' as const }} />);
  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1);
  expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('수수료');
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');

  act(() => { (scroll.progress as ReturnType<typeof motionValue<number>>).set(1); });
  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1);
  expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('정산');
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4');

  act(() => { (scroll.progress as ReturnType<typeof motionValue<number>>).set(0.3); });
  expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('견적');
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('PG 계약의 어려움');
});

it('기존 PG 랜딩의 기본 누적형은 유지한다', () => {
  render(<ScrollDrivenProblem heading={<h2>PG 영업</h2>} items={items} />);
  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(4);
});

it('진행 막대를 선택하면 해당 문제의 스크롤 구간으로 이동한다', () => {
  const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const { container } = render(<ScrollDrivenProblem heading={<h2>PG 계약</h2>} items={items} presentation="focus" />);
  const track = container.firstElementChild as HTMLElement;
  Object.defineProperty(track, 'offsetHeight', { value: 2600 });
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ top: 500 } as DOMRect);
  vi.stubGlobal('innerHeight', 1000);
  vi.stubGlobal('scrollY', 200);

  fireEvent.click(screen.getByRole('button', { name: '03. 심사' }));
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 1700, behavior: 'smooth' });
  act(() => { (scroll.progress as ReturnType<typeof motionValue<number>>).set(0.625); });
  expect(screen.getByRole('button', { name: '03. 심사' })).toHaveAttribute('aria-current', 'step');
  expect(screen.getByRole('button', { name: '01. 수수료' })).not.toHaveAttribute('aria-current');

  fireEvent.click(screen.getByRole('button', { name: '01. 수수료' }));
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 900, behavior: 'smooth' });
  scrollTo.mockRestore();
  vi.unstubAllGlobals();
});
