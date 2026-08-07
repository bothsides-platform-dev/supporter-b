import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

afterEach(() => cleanup());

import { ConfirmDialog } from '../confirm-dialog';

describe('ConfirmDialog', () => {
  it('renders title and confirmLabel', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="정말 삭제할까요?"
        confirmLabel="삭제"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText('정말 삭제할까요?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="삭제"
        description="이 작업은 되돌릴 수 없습니다."
        confirmLabel="삭제"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText('이 작업은 되돌릴 수 없습니다.')).toBeInTheDocument();
  });

  it('shows "닫기" cancel label by default', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="삭제"
        confirmLabel="삭제"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument();
  });

  it('shows custom cancelLabel when provided', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="삭제"
        confirmLabel="삭제"
        cancelLabel="돌아가기"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '돌아가기' })).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="삭제"
        confirmLabel="삭제"
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByRole('button', { name: '삭제' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onOpenChange(false) on cancel and does not call onConfirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="삭제"
        confirmLabel="삭제"
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('applies error color to confirm button for danger variant', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="삭제"
        confirmLabel="삭제"
        variant="danger"
        onConfirm={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button', { name: '삭제' });
    expect(btn.className).toMatch(/error/);
  });

  it('shows 처리 중… on confirm button and disables both when loading', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="삭제"
        confirmLabel="삭제"
        onConfirm={vi.fn()}
        loading
      />,
    );
    expect(screen.getByRole('button', { name: '처리 중…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '닫기' })).toBeDisabled();
  });

  it('shows custom loadingLabel on confirm button when loading', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="저장"
        confirmLabel="저장할게요"
        loadingLabel="저장 중…"
        onConfirm={vi.fn()}
        loading
      />,
    );
    expect(screen.getByRole('button', { name: '저장 중…' })).toBeDisabled();
  });

  it('confirmDataCoachmark 지정 시 확인 버튼에 data-coachmark를 단다', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="견적을 보낼까요?"
        confirmLabel="견적 보내기"
        onConfirm={vi.fn()}
        confirmDataCoachmark="tutorial-bid-confirm"
      />,
    );
    expect(screen.getByRole('button', { name: '견적 보내기' })).toHaveAttribute(
      'data-coachmark',
      'tutorial-bid-confirm',
    );
    // 취소 버튼에는 달리지 않는다.
    expect(screen.getByRole('button', { name: '닫기' })).not.toHaveAttribute('data-coachmark');
  });

  it('confirmDataCoachmark 미지정 시 확인 버튼에 data-coachmark가 없다', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="삭제"
        confirmLabel="삭제"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '삭제' })).not.toHaveAttribute('data-coachmark');
  });
});
