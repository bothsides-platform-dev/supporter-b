import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SigningSendEmbed } from '../SigningSendEmbed';

const IFRAME_SRC = 'https://app.snowsign.example/embed/abc';
const EMBED_ORIGIN = 'https://app.snowsign.example';

function post(data: unknown, origin = EMBED_ORIGIN) {
  window.dispatchEvent(new MessageEvent('message', { data, origin }));
}

const completion = { type: 'snowsign.embed.contract.sent', contract_id: 'ct_abc12345' };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SigningSendEmbed', () => {
  it('renders the SnowSign iframe with the issued url', () => {
    render(<SigningSendEmbed iframeUrl={IFRAME_SRC} onComplete={vi.fn(async () => true)} />);
    const frame = screen.getByTitle('스노우싸인 계약서 발송');
    expect(frame).toHaveAttribute('src', IFRAME_SRC);
  });

  it('constrains the third-party frame — sandbox, referrerPolicy', () => {
    render(<SigningSendEmbed iframeUrl={IFRAME_SRC} onComplete={vi.fn(async () => true)} />);
    const frame = screen.getByTitle('스노우싸인 계약서 발송');
    // 앱 콘텐츠 영역의 대부분을 서드파티 오리진이 그린다 — 최소 권한으로 가둔다.
    expect(frame.getAttribute('sandbox')).toBeTruthy();
    expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation');
    expect(frame).toHaveAttribute('referrerPolicy', 'no-referrer');
  });

  it('reports the contract id when the embed signals completion', async () => {
    const onComplete = vi.fn(async () => true);
    render(<SigningSendEmbed iframeUrl={IFRAME_SRC} onComplete={onComplete} />);
    post(completion);
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('ct_abc12345'));
  });

  it('ignores messages from any other origin', async () => {
    const onComplete = vi.fn(async () => true);
    render(<SigningSendEmbed iframeUrl={IFRAME_SRC} onComplete={onComplete} />);
    post(completion, 'https://evil.example');
    await new Promise((r) => setTimeout(r, 10));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('ignores every message when the iframe url cannot be parsed (fail-closed)', async () => {
    const onComplete = vi.fn(async () => true);
    // origin 이 '' 로 떨어지면 가드가 통째로 건너뛰어지던 과거 회귀(v0.4.30.0)의 재발 방지.
    render(<SigningSendEmbed iframeUrl="not-a-url" onComplete={onComplete} />);
    post(completion, '');
    post(completion);
    await new Promise((r) => setTimeout(r, 10));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('ignores progress chatter that is not a completion event', async () => {
    const onComplete = vi.fn(async () => true);
    render(<SigningSendEmbed iframeUrl={IFRAME_SRC} onComplete={onComplete} />);
    post({ type: 'snowsign.embed.resize', height: 900 });
    post({ type: 'snowsign.embed.ready' });
    await new Promise((r) => setTimeout(r, 10));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('reports completion only once even if the embed repeats the event', async () => {
    const onComplete = vi.fn(async () => true);
    render(<SigningSendEmbed iframeUrl={IFRAME_SRC} onComplete={onComplete} />);
    post(completion);
    post(completion);
    post(completion);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  // 실패까지 잠가버리면, 계약은 스노우싸인에서 실제로 나갔는데(서명 메일 발송 완료)
  // 우리는 그 id 를 영영 못 받아 고아가 확정된다 — 자동 복구 경로가 없다.
  it('accepts a repeat event after a failed attach', async () => {
    const onComplete = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<SigningSendEmbed iframeUrl={IFRAME_SRC} onComplete={onComplete} />);
    post(completion);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    post(completion);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(2));
    // 성공한 뒤로는 다시 잠긴다.
    post(completion);
    await new Promise((r) => setTimeout(r, 10));
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  // 서드파티 iframe 이 뜨기 전(혹은 영영 안 뜰 때) 아무 표시가 없으면 빈 560px 영역이
  // '앱이 멈췄다'와 구분되지 않는다. 여기는 사용자가 계약서를 올리러 온 자리다.
  it('shows a loading affordance until the embed loads, then hides it', async () => {
    render(<SigningSendEmbed iframeUrl={IFRAME_SRC} onComplete={vi.fn(async () => true)} />);
    expect(screen.getByRole('status', { name: '계약서 화면을 불러오는 중' })).toBeInTheDocument();

    fireEvent.load(screen.getByTitle('스노우싸인 계약서 발송'));
    await waitFor(() =>
      expect(screen.queryByRole('status', { name: '계약서 화면을 불러오는 중' })).not.toBeInTheDocument(),
    );
  });

  // 진짜 "영영 안 뜨는" 경우는 error 이벤트를 안 준다(세션 만료·차단·무응답). 그래서
  // 타임아웃이 판정 주체다 — 이벤트만 믿으면 사용자는 빈 화면을 무한정 본다.
  it('offers a retry when the embed never loads', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onReload = vi.fn();
      render(
        <SigningSendEmbed
          iframeUrl={IFRAME_SRC}
          onComplete={vi.fn(async () => true)}
          onReload={onReload}
        />,
      );
      await vi.advanceTimersByTimeAsync(15_000);
      expect(await screen.findByText('계약서 화면을 불러오지 못했어요')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '다시 열기' }));
      expect(onReload).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not flip to the failure panel once the embed has loaded', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<SigningSendEmbed iframeUrl={IFRAME_SRC} onComplete={vi.fn(async () => true)} />);
      fireEvent.load(screen.getByTitle('스노우싸인 계약서 발송'));
      await vi.advanceTimersByTimeAsync(30_000);
      expect(screen.queryByText('계약서 화면을 불러오지 못했어요')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
