import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen, cleanup } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import userEvent from '@testing-library/user-event';
import { InviteScene } from '../InviteScene';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('InviteScene (pg 튜토리얼 — 초대 수신 연출)', () => {
  it.each([false, true])('동작 줄이기=%s: 서버 HTML을 경고 없이 연결하고 초대 카드를 표시한다', async (reducedMotion) => {
    vi.useFakeTimers();
    const scene = (
      <InviteScene
        buyerName="튜토리얼 쇼핑몰"
        rfpTitle="온라인 쇼핑몰 PG 견적 요청 (튜토리얼)"
        deadline="2026-10-06T00:00:00.000Z"
        onProceed={vi.fn()}
      />
    );
    // SSR에는 window가 없고, 브라우저에만 사용자의 모션 설정이 있다.
    vi.stubGlobal('window', undefined);
    const html = renderToString(scene);
    vi.unstubAllGlobals();
    vi.stubGlobal('matchMedia', vi.fn((media: string) => ({
      matches: reducedMotion,
      media,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);

    render(scene, { container, hydrate: true });
    expect(errors).not.toHaveBeenCalled();
    if (!reducedMotion) {
      await act(async () => { vi.advanceTimersByTime(60); });
    }
    expect(screen.getByText('튜토리얼 쇼핑몰').parentElement).toHaveStyle({ opacity: '1' });
  });

  it('구매사명·제목·마감 정보와 안내 문구를 렌더한다', () => {
    render(
      <InviteScene
        buyerName="튜토리얼 쇼핑몰"
        rfpTitle="온라인 쇼핑몰 PG 견적 요청 (튜토리얼)"
        deadline="2026-07-21T00:00:00.000Z"
        onProceed={vi.fn()}
      />,
    );
    expect(screen.getByText('튜토리얼 쇼핑몰')).toBeInTheDocument();
    expect(screen.getByText('온라인 쇼핑몰 PG 견적 요청 (튜토리얼)')).toBeInTheDocument();
    expect(screen.getByText(/실제로는 이메일과 알림으로 초대를 받아요/)).toBeInTheDocument();
  });

  it('지난 마감일은 마감 문구를 중복하지 않는다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T00:00:00+09:00'));
    render(
      <InviteScene
        buyerName="튜토리얼 쇼핑몰"
        rfpTitle="온라인 쇼핑몰 PG 견적 요청 (튜토리얼)"
        deadline="2026-09-11T23:59:59+09:00"
        onProceed={vi.fn()}
      />,
    );
    expect(screen.getByText('마감 (2026. 09. 11.)')).toBeInTheDocument();
    expect(screen.queryByText(/마감 마감/)).not.toBeInTheDocument();
  });

  it('"요청 확인하기" 클릭 시 onProceed를 호출한다', async () => {
    const onProceed = vi.fn();
    const user = userEvent.setup();
    render(
      <InviteScene
        buyerName="튜토리얼 쇼핑몰"
        rfpTitle="온라인 쇼핑몰 PG 견적 요청 (튜토리얼)"
        deadline="2026-07-21T00:00:00.000Z"
        onProceed={onProceed}
      />,
    );
    await user.click(screen.getByRole('button', { name: '요청 확인하기' }));
    expect(onProceed).toHaveBeenCalledTimes(1);
  });

  it('CTA 버튼에 튜토리얼 코치마크 앵커가 있다', () => {
    render(
      <InviteScene
        buyerName="튜토리얼 쇼핑몰"
        rfpTitle="온라인 쇼핑몰 PG 견적 요청 (튜토리얼)"
        deadline="2026-07-21T00:00:00.000Z"
        onProceed={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '요청 확인하기' })).toHaveAttribute(
      'data-coachmark',
      'tutorial-invite-cta',
    );
  });
});
