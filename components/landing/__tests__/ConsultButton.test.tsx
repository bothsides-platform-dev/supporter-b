import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsultButton } from '../ConsultButton';

const mockChannelIO = vi.fn();

describe('ConsultButton — 채널톡 상담 CTA', () => {
  beforeEach(() => {
    mockChannelIO.mockClear();
    window.ChannelIO = mockChannelIO as unknown as typeof window.ChannelIO;
  });

  it('자식 라벨을 버튼으로 렌더한다', () => {
    render(<ConsultButton>파트너 상담 신청</ConsultButton>);
    expect(screen.getByRole('button', { name: '파트너 상담 신청' })).toBeInTheDocument();
  });

  it('클릭하면 채널톡 메신저를 연다', async () => {
    const user = userEvent.setup();
    render(<ConsultButton>파트너 상담 신청</ConsultButton>);
    await user.click(screen.getByRole('button', { name: '파트너 상담 신청' }));
    expect(mockChannelIO).toHaveBeenCalledWith('showMessenger');
  });

  it('variant 에 따라 다른 클래스를 입힌다', () => {
    const { rerender } = render(<ConsultButton variant="primary">A</ConsultButton>);
    const primaryCls = screen.getByRole('button').className;
    rerender(<ConsultButton variant="on-dark">A</ConsultButton>);
    expect(screen.getByRole('button').className).not.toBe(primaryCls);
  });
});
