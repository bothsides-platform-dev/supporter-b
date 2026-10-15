import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, useRef, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GuestSavingsCalculator, type SavingsMemory } from '../GuestSavingsCalculator';

const { run, reset } = vi.hoisted(() => ({ run: vi.fn(), reset: vi.fn() }));
vi.mock('canvas-confetti', () => ({ default: { create: () => Object.assign(run, { reset }) } }));
let visible: () => void;
let reduced = false;
let preferenceChanged: () => void;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ get matches() { return reduced; }, addEventListener: (_: string, listener: () => void) => { preferenceChanged = listener; }, removeEventListener: vi.fn() })));
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { visible = () => callback([{ isIntersecting: true }] as IntersectionObserverEntry[], this as unknown as IntersectionObserver); }
    observe() {} disconnect() {}
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); reduced = false; });
function Harness() {
  const [values, setValues] = useState({ volume: '1000000000', reduction: '0.3' });
  const memory = useRef<SavingsMemory>({ introduced: false, committed: 3000000, lastBurst: -Infinity });
  const [shown, show] = useState(true);
  return <><button onClick={() => show(!shown)}>toggle</button>{shown && <GuestSavingsCalculator values={values} onChange={setValues} memoryRef={memory} />}</>;
}
function advance(ms: number) { act(() => vi.advanceTimersByTime(ms)); }
function enter(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
function reveal() { act(() => visible()); advance(750); }
it('calculates presets and monthly rounding immediately, with zero distinct from empty', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: '1억 원' }));
  expect(screen.getByLabelText('연간 절감 예상액')).toHaveTextContent('30만 원');
  fireEvent.click(screen.getByRole('button', { name: '10억 원' }));
  expect(screen.getByLabelText('연간 절감 예상액')).toHaveTextContent('300만 원');
  expect(screen.getByText(/을 아낄 수 있어요/)).toHaveTextContent('25만 원');
  enter('연간 카드 거래액', '1000');
  enter('수수료 인하 폭', '1');
  expect(screen.getByText(/을 아낄 수 있어요/)).toHaveTextContent('1원');
  enter('수수료 인하 폭', '0');
  expect(screen.getByLabelText('연간 절감 예상액')).toHaveTextContent('0원');
  enter('연간 카드 거래액', '');
  expect(screen.getByLabelText('연간 절감 예상액')).toHaveTextContent('—');
});
it('rejects negative, fractional won, rates over 100 and precision beyond two decimal places', () => {
  render(<Harness />);
  enter('연간 카드 거래액', '-20');
  expect(screen.getByLabelText('연간 카드 거래액')).not.toHaveValue('-20');
  enter('연간 카드 거래액', '123.45');
  expect(screen.getByLabelText('연간 카드 거래액')).not.toHaveValue('123.45');
  enter('수수료 인하 폭', '100.01');
  expect(screen.getByLabelText('수수료 인하 폭')).toHaveValue('0.3');
  enter('수수료 인하 폭', '0.123');
  expect(screen.getByLabelText('수수료 인하 폭')).toHaveValue('0.12');
});
it('waits for visibility, counts up once, then uses smaller bursts only for committed increases', () => {
  render(<Harness />);
  advance(1000);
  expect(run).not.toHaveBeenCalled();
  act(() => visible());
  expect(screen.getByLabelText('연간 절감 예상액')).toHaveTextContent('0원');
  advance(750);
  expect(screen.getByLabelText('연간 절감 예상액')).toHaveTextContent('300만 원');
  expect(run).toHaveBeenCalledTimes(2);
  expect(run.mock.calls[0][0]).toMatchObject({ particleCount: 60, ticks: 90 });
  advance(2000);
  enter('수수료 인하 폭', '0.5');
  expect(screen.getByLabelText('연간 절감 예상액')).toHaveTextContent('500만 원');
  expect(screen.getByLabelText('확정 절감 예상')).toHaveTextContent('300만 원');
  advance(499);
  expect(run).toHaveBeenCalledTimes(2);
  advance(1);
  expect(run).toHaveBeenCalledTimes(4);
  expect(run.mock.calls[2][0]).toMatchObject({ particleCount: 18, ticks: 36 });
  expect(screen.getByLabelText('확정 절감 예상')).toHaveTextContent('500만 원');
  fireEvent.click(screen.getByRole('button', { name: '0.3%p' }));
  fireEvent.click(screen.getByRole('button', { name: '0.3%p' }));
  fireEvent.click(screen.getByRole('button', { name: '0.5%p' }));
  expect(run).toHaveBeenCalledTimes(4);
  advance(2000);
  fireEvent.click(screen.getByRole('button', { name: '10억 원' }));
  expect(run).toHaveBeenCalledTimes(4);
  fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
  fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
  reveal();
  expect(run).toHaveBeenCalledTimes(4);
});
it('cancels intro and pending effects on new input and unmount', () => {
  const view = render(<Harness />);
  act(() => visible()); advance(200);
  enter('연간 카드 거래액', '100000000');
  expect(screen.getByLabelText('연간 절감 예상액')).toHaveTextContent('30만 원');
  advance(600);
  expect(run).not.toHaveBeenCalled();
  enter('수수료 인하 폭', '0.5'); advance(300);
  enter('수수료 인하 폭', '0'); advance(500);
  expect(run).not.toHaveBeenCalled();
  enter('수수료 인하 폭', '0.5');
  view.unmount(); advance(2000);
  expect(run).not.toHaveBeenCalled();
  expect(reset).toHaveBeenCalled();
});
it('shows final amounts immediately with reduced motion and never bursts', () => {
  reduced = true;
  render(<Harness />); reveal();
  expect(screen.getByLabelText('연간 절감 예상액')).toHaveTextContent('300만 원');
  fireEvent.click(screen.getByRole('button', { name: '0.5%p' }));
  advance(3000);
  expect(screen.getByLabelText('확정 절감 예상')).toHaveTextContent('500만 원');
  expect(run).not.toHaveBeenCalled();
});

it('keeps the first result animation working through StrictMode effect replay', () => {
  render(<StrictMode><Harness /></StrictMode>);
  reveal();
  expect(screen.getByLabelText('연간 절감 예상액')).toHaveTextContent('300만 원');
  expect(run).toHaveBeenCalledTimes(2);
});

it('switches to the latest input when reduced motion is enabled before debounce finishes', () => {
  render(<Harness />); reveal();
  enter('수수료 인하 폭', '0.8');
  act(() => { reduced = true; preferenceChanged(); });
  expect(screen.getByLabelText('연간 절감 예상액')).toHaveTextContent('800만 원');
  advance(3000);
  expect(screen.getByLabelText('연간 절감 예상액')).toHaveTextContent('800만 원');
});

it('uses the latest amount for the first reveal when inputs change before the result is visible', () => {
  render(<Harness />);
  enter('수수료 인하 폭', '0.5'); advance(500);
  expect(run).not.toHaveBeenCalled();
  reveal();
  expect(screen.getByLabelText('연간 절감 예상액')).toHaveTextContent('500만 원');
  expect(run).toHaveBeenCalledTimes(2);
  expect(run.mock.calls[0][0]).toMatchObject({ particleCount: 60 });
});

it('rounds exact half-won savings and monthly values independently without floating point loss', () => {
  render(<Harness />);
  enter('연간 카드 거래액', '250');
  enter('수수료 인하 폭', '64.6');
  expect(screen.getByLabelText('연간 절감 예상액')).toHaveTextContent('162원');
  expect(screen.getByText(/을 아낄 수 있어요/)).toHaveTextContent('13원');
  advance(500);
  expect(screen.getByLabelText('확정 절감 예상')).toHaveTextContent('월평균 13원');
});

it('keeps decimal-only editing safe and resumes calculation as digits arrive', () => {
  render(<Harness />);
  enter('수수료 인하 폭', '');
  enter('수수료 인하 폭', '.');
  expect(screen.getByLabelText('연간 절감 예상액')).toHaveTextContent('—');
  enter('수수료 인하 폭', '.3');
  expect(screen.getByLabelText('연간 절감 예상액')).toHaveTextContent('300만 원');
});
it('does not paint the final number before the first visibility-triggered count-up', () => {
  render(<Harness />);
  expect(screen.getByLabelText('연간 절감 예상액')).not.toBeVisible();
  act(() => visible());
  expect(screen.getByLabelText('연간 절감 예상액')).toBeVisible();
  expect(screen.getByLabelText('연간 절감 예상액')).toHaveTextContent('0원');
});
it('uses the displayed return value as the baseline after leaving during debounce', () => {
  render(<Harness />); reveal(); advance(2500);
  enter('수수료 인하 폭', '0.5'); advance(200);
  fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
  fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
  reveal();
  enter('수수료 인하 폭', '0.4'); advance(500);
  expect(run).toHaveBeenCalledTimes(2);
});
