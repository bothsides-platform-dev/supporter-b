// ComposerAttachmentChips — 컴포저 하단 첨부 칩 줄(uploading/error/ready 3상태).
// ThreadView·TeamThreadView 가 글자 단위로 복제하던 블록의 단일 출처.
// 계약: 빈 목록이면 아무것도 안 그림 / 업로드 중엔 제거 불가 / error·ready 는 제거 버튼.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { ComposerAttachmentChips } from '../ComposerAttachmentChips';
import type { ComposerAttachment } from '../useComposerAttachments';

afterEach(() => cleanup());

const row = (over: Partial<ComposerAttachment>): ComposerAttachment => ({
  id: 'a1',
  name: '명세.pdf',
  status: 'ready',
  ...over,
});

describe('ComposerAttachmentChips', () => {
  it('빈 목록이면 아무것도 렌더하지 않는다', () => {
    const { container } = render(<ComposerAttachmentChips rows={[]} onRemove={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('업로드 중 행은 이름 + 진행 표시만, 제거 버튼은 없다', () => {
    render(<ComposerAttachmentChips rows={[row({ status: 'uploading', name: 'a.png' })]} onRemove={vi.fn()} />);
    expect(screen.getByLabelText('a.png 업로드 중')).toBeInTheDocument();
    expect(screen.queryByLabelText('a.png 첨부 제거')).toBeNull();
  });

  it('업로드 실패 행은 실패 라벨 + 에러 title + 제거 버튼을 갖는다', () => {
    render(
      <ComposerAttachmentChips
        rows={[row({ status: 'error', name: 'big.pdf', error: '파일이 너무 큽니다' })]}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('big.pdf 업로드 실패')).toHaveAttribute('title', '파일이 너무 큽니다');
    expect(screen.getByLabelText('big.pdf 첨부 제거')).toBeInTheDocument();
  });

  it('ready 행의 제거 버튼 클릭 시 onRemove(id) 를 호출한다', () => {
    const onRemove = vi.fn();
    render(<ComposerAttachmentChips rows={[row({ id: 'rdy', name: 'ok.pdf' })]} onRemove={onRemove} />);
    fireEvent.click(screen.getByLabelText('ok.pdf 첨부 제거'));
    expect(onRemove).toHaveBeenCalledWith('rdy');
  });

  it('여러 행을 모두 렌더한다', () => {
    render(
      <ComposerAttachmentChips
        rows={[row({ id: 'a', name: 'a.pdf' }), row({ id: 'b', name: 'b.pdf', status: 'uploading' })]}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText('a.pdf')).toBeInTheDocument();
    expect(screen.getByText('b.pdf')).toBeInTheDocument();
  });
});
