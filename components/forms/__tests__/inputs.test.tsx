import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PercentInput, CurrencyInput, TextField } from '../inputs';

afterEach(cleanup);

describe('PercentInput', () => {
  it('renders the label and a % suffix', () => {
    render(<PercentInput label="카드 수수료" value="" onChange={() => {}} />);
    expect(screen.getByText('카드 수수료')).toBeInTheDocument();
    expect(screen.getByText('%')).toBeInTheDocument();
  });

  it('shows the "1만원 결제 시" hint when value > 0', () => {
    render(<PercentInput label="수수료" value="1.25" onChange={() => {}} />);
    // 1.25% of 10,000원 = 125원
    expect(screen.getByText(/1만원 결제 시 125원/)).toBeInTheDocument();
  });

  it('shows no hint for empty or zero value', () => {
    render(<PercentInput label="수수료" value="" onChange={() => {}} />);
    expect(screen.queryByText(/1만원 결제 시/)).not.toBeInTheDocument();
  });

  it('calls onChange with the raw input string', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PercentInput label="수수료" value="" onChange={onChange} />);
    await user.type(screen.getByRole('spinbutton'), '5');
    expect(onChange).toHaveBeenCalledWith('5');
  });
});

describe('CurrencyInput', () => {
  it('renders the label and a 원 suffix', () => {
    render(<CurrencyInput label="정산한도" value="" onChange={() => {}} />);
    expect(screen.getByText('정산한도')).toBeInTheDocument();
    expect(screen.getByText('원')).toBeInTheDocument();
  });

  it('calls onChange with the raw input string', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CurrencyInput label="정산한도" value="" onChange={onChange} />);
    await user.type(screen.getByRole('spinbutton'), '7');
    expect(onChange).toHaveBeenCalledWith('7');
  });
});

describe('TextField', () => {
  it('renders a text input and propagates changes', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TextField value="" onChange={onChange} placeholder="제목" />);
    const input = screen.getByPlaceholderText('제목');
    await user.type(input, 'A');
    expect(onChange).toHaveBeenCalledWith('A');
  });
});
