import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// InfoTip (rendered when infoTerm is passed) mounts a base-ui Popover.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

import { PercentInput, CurrencyInput } from '../inputs';

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
    await user.type(screen.getByRole('textbox'), '7');
    expect(onChange).toHaveBeenCalledWith('7');
  });

  it('displays comma-formatted value for large numbers', () => {
    render(<CurrencyInput label="정산한도" value="1000000" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveValue('1,000,000');
  });

  it('shows a Korean-readable amount hint when value > 0', () => {
    render(<CurrencyInput label="정산한도" value="50000000" onChange={() => {}} />);
    expect(screen.getByText('= 5천만 원')).toBeInTheDocument();
  });

  it('shows no hint for empty or zero value', () => {
    const { rerender } = render(<CurrencyInput label="정산한도" value="" onChange={() => {}} />);
    expect(screen.queryByText(/^=/)).toBeNull();
    rerender(<CurrencyInput label="정산한도" value="0" onChange={() => {}} />);
    expect(screen.queryByText(/^=/)).toBeNull();
  });
});

describe('infoTerm', () => {
  it('PercentInput renders an info icon button when infoTerm is given', () => {
    render(<PercentInput label="수수료" value="" onChange={() => {}} infoTerm="수수료율" />);
    expect(screen.getByRole('button', { name: /설명/ })).toBeInTheDocument();
  });

  it('CurrencyInput renders an info icon button when infoTerm is given', () => {
    render(<CurrencyInput label="정산한도" value="" onChange={() => {}} infoTerm="정산한도" />);
    expect(screen.getByRole('button', { name: /설명/ })).toBeInTheDocument();
  });

  it('renders no info icon when infoTerm is omitted', () => {
    render(<CurrencyInput label="정산한도" value="" onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: /설명/ })).toBeNull();
  });
});
