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

  // Value: protects=채널톡 SDK 미로딩(광고 차단·로드 실패) 시 랜딩 문의 버튼 클릭이 예외 없이 무시됨; fails_when=window.ChannelIO 옵셔널 호출이 직접 호출로 바뀌어 클릭이 TypeError 를 던질 때; why_new=기존 테스트는 모두 ChannelIO 를 mock 으로 주입해 SDK 부재 분기를 실행하지 않음; seam=none; no_claim=메신저가 실제로 열리는지·폴백 안내 노출 여부
  it('채널톡 SDK 가 없으면 클릭해도 예외 없이 무시한다', async () => {
    const user = userEvent.setup();
    window.ChannelIO = undefined as unknown as typeof window.ChannelIO;
    const onError = vi.fn();
    window.addEventListener('error', onError);
    try {
      render(<ConsultButton>파트너 상담 신청</ConsultButton>);
      await user.click(screen.getByRole('button', { name: '파트너 상담 신청' }));
      expect(onError).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('error', onError);
    }
  });

  it('href를 주면 채널톡 버튼 대신 내부 링크로 렌더한다', () => {
    render(<ConsultButton href="/signup/pg">파트너로 시작하기</ConsultButton>);
    const link = screen.getByRole('link', { name: '파트너로 시작하기' });
    expect(link).toHaveAttribute('href', '/signup/pg');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('variant 에 따라 다른 클래스를 입힌다', () => {
    const { rerender } = render(<ConsultButton variant="primary">A</ConsultButton>);
    const primaryCls = screen.getByRole('button').className;
    rerender(<ConsultButton variant="on-dark">A</ConsultButton>);
    expect(screen.getByRole('button').className).not.toBe(primaryCls);
  });
});
