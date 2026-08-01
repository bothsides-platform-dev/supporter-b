import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
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
    render(<SigningSendEmbed iframeUrl={IFRAME_SRC} onComplete={vi.fn(async () => true)} onClose={vi.fn()} />);
    const frame = screen.getByTitle('스노우싸인 계약서 발송');
    expect(frame).toHaveAttribute('src', IFRAME_SRC);
  });

  it('constrains the third-party frame — sandbox, referrerPolicy', () => {
    render(<SigningSendEmbed iframeUrl={IFRAME_SRC} onComplete={vi.fn(async () => true)} onClose={vi.fn()} />);
    const frame = screen.getByTitle('스노우싸인 계약서 발송');
    // 앱 콘텐츠 영역의 대부분을 서드파티 오리진이 그린다 — 최소 권한으로 가둔다.
    expect(frame.getAttribute('sandbox')).toBeTruthy();
    expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation');
    expect(frame).toHaveAttribute('referrerPolicy', 'no-referrer');
  });

  it('shows the buyer signer so the PG types the right recipient', () => {
    render(
      <SigningSendEmbed
        iframeUrl={IFRAME_SRC}
        buyerSigner={{ name: '김구매', email: 'buyer@corp.com' }}
        onComplete={vi.fn(async () => true)}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('buyer@corp.com')).toBeInTheDocument();
    expect(screen.getByText(/김구매/)).toBeInTheDocument();
  });

  it('reports the contract id when the embed signals completion', async () => {
    const onComplete = vi.fn(async () => true);
    render(<SigningSendEmbed iframeUrl={IFRAME_SRC} onComplete={onComplete} onClose={vi.fn()} />);
    post(completion);
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('ct_abc12345'));
  });

  it('ignores messages from any other origin', async () => {
    const onComplete = vi.fn(async () => true);
    render(<SigningSendEmbed iframeUrl={IFRAME_SRC} onComplete={onComplete} onClose={vi.fn()} />);
    post(completion, 'https://evil.example');
    await new Promise((r) => setTimeout(r, 10));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('ignores every message when the iframe url cannot be parsed (fail-closed)', async () => {
    const onComplete = vi.fn(async () => true);
    // origin 이 '' 로 떨어지면 가드가 통째로 건너뛰어지던 과거 회귀(v0.4.30.0)의 재발 방지.
    render(<SigningSendEmbed iframeUrl="not-a-url" onComplete={onComplete} onClose={vi.fn()} />);
    post(completion, '');
    post(completion);
    await new Promise((r) => setTimeout(r, 10));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('ignores progress chatter that is not a completion event', async () => {
    const onComplete = vi.fn(async () => true);
    render(<SigningSendEmbed iframeUrl={IFRAME_SRC} onComplete={onComplete} onClose={vi.fn()} />);
    post({ type: 'snowsign.embed.resize', height: 900 });
    post({ type: 'snowsign.embed.ready' });
    await new Promise((r) => setTimeout(r, 10));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('reports completion only once even if the embed repeats the event', async () => {
    const onComplete = vi.fn(async () => true);
    render(<SigningSendEmbed iframeUrl={IFRAME_SRC} onComplete={onComplete} onClose={vi.fn()} />);
    post(completion);
    post(completion);
    post(completion);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  // 실패까지 잠가버리면, 계약은 스노우싸인에서 실제로 나갔는데(서명 메일 발송 완료)
  // 우리는 그 id 를 영영 못 받아 고아가 확정된다 — 자동 복구 경로가 없다.
  it('accepts a repeat event after a failed attach', async () => {
    const onComplete = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<SigningSendEmbed iframeUrl={IFRAME_SRC} onComplete={onComplete} onClose={vi.fn()} />);
    post(completion);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    post(completion);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(2));
    // 성공한 뒤로는 다시 잠긴다.
    post(completion);
    await new Promise((r) => setTimeout(r, 10));
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it('closes on the close button', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SigningSendEmbed iframeUrl={IFRAME_SRC} onComplete={vi.fn(async () => true)} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalled();
  });
});
