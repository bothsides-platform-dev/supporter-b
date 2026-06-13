import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// InfoTip (rendered when infoTerm is passed) mounts a base-ui Popover.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

import { PercentInput, CurrencyInput, FeeRateCell } from '../inputs';

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
    await user.type(screen.getByRole('textbox'), '5');
    expect(onChange).toHaveBeenCalledWith('5');
  });

  it('숫자가 아닌 글자는 입력되지 않는다', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PercentInput label="수수료" value="" onChange={onChange} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.type(input, 'abc');
    expect(input.value).toBe('');
    expect(onChange).not.toHaveBeenCalledWith(expect.stringMatching(/[a-z]/i));
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
    expect(screen.getByText('= 5,000만원')).toBeInTheDocument();
  });

  it('shows no hint for empty or zero value', () => {
    const { rerender } = render(<CurrencyInput label="정산한도" value="" onChange={() => {}} />);
    expect(screen.queryByText(/^=/)).toBeNull();
    rerender(<CurrencyInput label="정산한도" value="0" onChange={() => {}} />);
    expect(screen.queryByText(/^=/)).toBeNull();
  });
});

describe('FeeRateCell', () => {
  it('testId·aria-label을 입력에 전달한다', () => {
    render(
      <FeeRateCell
        value=""
        onChange={() => {}}
        testId="fee-cell-card-sole"
        ariaLabel="카드 영세 수수료"
      />,
    );
    const input = screen.getByTestId('fee-cell-card-sole');
    expect(input).toHaveAttribute('aria-label', '카드 영세 수수료');
  });

  it('값이 비어 있으면 포커스해도 환산 툴팁을 보여주지 않는다', () => {
    render(<FeeRateCell value="" onChange={() => {}} testId="c" />);
    fireEvent.focusIn(screen.getByTestId('c'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('값 입력 후 포커스하면 1만원 결제 환산 툴팁을 보여준다', () => {
    render(<FeeRateCell value="1.25" onChange={() => {}} testId="c" />);
    fireEvent.focusIn(screen.getByTestId('c'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('1만원 결제 시 125원');
  });

  it('마우스를 올리면 환산 툴팁을 보여준다', () => {
    render(<FeeRateCell value="0.8" onChange={() => {}} testId="c" />);
    fireEvent.mouseEnter(screen.getByTestId('c'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('1만원 결제 시 80원');
  });

  it('포커스가 빠지면 툴팁을 감춘다', () => {
    render(<FeeRateCell value="1.25" onChange={() => {}} testId="c" />);
    const input = screen.getByTestId('c');
    fireEvent.focusIn(input);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.focusOut(input);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('onChange를 raw 문자열로 호출한다', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FeeRateCell value="" onChange={onChange} testId="c" />);
    await user.type(screen.getByTestId('c'), '5');
    expect(onChange).toHaveBeenCalledWith('5');
  });

  it('숫자가 아닌 글자는 입력되지 않는다', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FeeRateCell value="" onChange={onChange} testId="c" />);
    const input = screen.getByTestId('c') as HTMLInputElement;
    await user.type(input, 'abc');
    expect(input.value).toBe('');
    expect(onChange).not.toHaveBeenCalledWith(expect.stringMatching(/[a-z]/i));
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
