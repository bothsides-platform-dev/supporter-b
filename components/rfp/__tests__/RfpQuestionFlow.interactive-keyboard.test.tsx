import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RfpQuestionFlow } from '../RfpQuestionFlow';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';

beforeEach(() => useRfpDraftStore.getState().reset());

it('첨부 파일 선택 영역의 Enter는 파일 선택만 실행하고 질문을 이동하지 않는다', () => {
  useRfpDraftStore.setState({ contentQuestion: 'attachments' });
  render(<RfpQuestionFlow onBack={vi.fn()} onNext={vi.fn()} onQuestionChange={vi.fn()} />);
  const dropzone = screen.getByRole('button', { name: /파일을 끌어다 놓거나 클릭하여 첨부/ });
  const input = dropzone.parentElement!.querySelector('input[type="file"]') as HTMLInputElement;
  const click = vi.spyOn(input, 'click').mockImplementation(() => {});

  fireEvent.keyDown(dropzone, { key: 'Enter' });
  fireEvent.keyDown(dropzone, { key: 'Enter', shiftKey: true });

  expect(click).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('heading', { name: '함께 보낼 자료가 있나요?' })).toBeInTheDocument();
});
