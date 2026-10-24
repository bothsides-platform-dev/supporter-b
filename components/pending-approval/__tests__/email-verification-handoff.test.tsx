import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { EmailVerifySection } from '../EmailVerifySection';
import AuthVerifyPage from '@/app/(public)/auth/verify/page';

const check = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('token=proof') }));
vi.mock('@/lib/server/actions/auth', () => ({
  sendMyEmailVerificationAction: async () => ({ ok: true }),
  checkMyEmailVerifiedAction: check,
  verifyEmailAction: async () => ({ ok: true, email: 'me@example.com' }),
}));
vi.mock('@/lib/analytics/funnel', () => ({ trackFunnel: vi.fn(), flushFunnel: async () => {} }));

class Channel {
  static all = new Set<Channel>();
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(readonly name: string) { Channel.all.add(this); }
  postMessage(data: unknown) {
    for (const peer of Channel.all) if (peer !== this && peer.name === this.name) {
      queueMicrotask(() => peer.onmessage?.({ data }));
    }
  }
  close() { Channel.all.delete(this); this.onmessage = null; }
}
const assign = vi.fn();
beforeEach(() => {
  vi.stubGlobal('BroadcastChannel', Channel);
  Object.defineProperty(window, 'location', { configurable: true, value: { assign } });
  assign.mockReset();
  check.mockReset().mockResolvedValue({ verified: true });
});
afterEach(() => { Channel.all.clear(); vi.unstubAllGlobals(); });

it('메일 탭은 서버 재확인을 마친 원래 탭에 이어쓰기를 맡긴다', async () => {
  const originalContinued = vi.fn();
  render(<EmailVerifySection email="me@example.com" initialVerified={false} onVerified={originalContinued} />);
  render(<AuthVerifyPage />);
  await waitFor(() => expect(originalContinued).toHaveBeenCalledTimes(1));
  expect(check).toHaveBeenCalledWith('me@example.com');
  expect(await screen.findByText(/작성하던 화면에서 계속/)).toBeInTheDocument();
  expect(assign).not.toHaveBeenCalled();
});
it('원래 탭이 인증을 확인하지 못하면 메일 탭이 직접 이어간다', async () => {
  check.mockResolvedValue({ verified: false });
  const originalContinued = vi.fn();
  render(<EmailVerifySection email="me@example.com" initialVerified={false} onVerified={originalContinued} />);
  render(<AuthVerifyPage />);
  await waitFor(() => expect(assign).toHaveBeenCalledWith('/home'));
  expect(originalContinued).not.toHaveBeenCalled();
});
it('로그인 세션이 사라진 원래 탭에는 복구 동작을 표시한다', async () => {
  check.mockResolvedValue({ verified: false, reauthenticate: true });
  render(<EmailVerifySection email="me@example.com" initialVerified={false} />);
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  expect(screen.getByRole('link', { name: /로그인하고 계속/ })).toBeInTheDocument();
});
