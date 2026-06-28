import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BidStepProposal } from '../BidStepProposal';

afterEach(cleanup);

function renderStep(over: Partial<React.ComponentProps<typeof BidStepProposal>> = {}) {
  const onMemoChange = vi.fn();
  const onUpload = vi.fn();
  render(
    <BidStepProposal
      proposal={null}
      memo=""
      onUpload={onUpload}
      onClear={vi.fn()}
      onMemoChange={onMemoChange}
      {...over}
    />,
  );
  return { onMemoChange, onUpload };
}

describe('BidStepProposal', () => {
  it('업로드 전에는 PDF 업로드 버튼을 보여준다', () => {
    renderStep();
    expect(screen.getByText(/PDF 업로드/)).toBeInTheDocument();
  });

  it('PDF 파일 선택 시 onUpload 호출', async () => {
    const user = userEvent.setup();
    const { onUpload } = renderStep();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'p.pdf', { type: 'application/pdf' }));
    expect(onUpload).toHaveBeenCalled();
  });

  it('메모 입력 시 onMemoChange 호출', async () => {
    const user = userEvent.setup();
    const { onMemoChange } = renderStep();
    await user.type(screen.getByPlaceholderText(/추가 안내/), 'a');
    expect(onMemoChange).toHaveBeenCalledWith('a');
  });
});
