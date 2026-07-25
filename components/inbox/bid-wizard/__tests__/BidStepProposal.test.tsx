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

  // 회귀: v0.4.12.0 이 `outline` 을 텍스트에서 걷어내면서 지시문과 힌트가 같은
  // 톤·크기(`md-label-small` + on-surface-variant)로 붙어 위계가 사라졌다.
  // DESIGN.md §2 — 보조 텍스트 아래 위계는 색이 아니라 타입스케일로 만든다.
  it('업로드 지시문과 용량 힌트는 크기·톤이 서로 다르다', () => {
    renderStep();
    const instruction = screen.getByText('PDF 업로드 (클릭)');
    const hint = screen.getByText('20MB 이내');

    expect(instruction).toHaveClass('md-label-large');
    expect(instruction).toHaveClass('text-[var(--md-sys-color-on-surface)]');
    expect(hint).toHaveClass('md-label-small');
    expect(hint).toHaveClass('text-[var(--md-sys-color-on-surface-variant)]');
    expect(
      instruction.className,
      '지시문과 힌트가 같은 표기로 다시 붙었다',
    ).not.toBe(hint.className);
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
