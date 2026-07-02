import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { useSessionAuthed } from '../use-session-authed';

function Harness({ onValue }: { onValue: (v: boolean) => void }) {
  const authed = useSessionAuthed();
  onValue(authed);
  return null;
}

describe('useSessionAuthed', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts false (static-safe default) before the session fetch resolves', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})), // never resolves
    );
    const values: boolean[] = [];
    render(<Harness onValue={(v) => values.push(v)} />);
    expect(values[0]).toBe(false);
  });

  it('flips to true once /api/auth/session resolves with a user', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ user: { id: 'u1' }, expires: '2099-01-01' }),
      }),
    );
    const values: boolean[] = [];
    render(<Harness onValue={(v) => values.push(v)} />);
    await waitFor(() => expect(values.at(-1)).toBe(true));
    expect(fetch).toHaveBeenCalledWith('/api/auth/session');
  });

  it('stays false when the session response has no user (empty object)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }),
    );
    const values: boolean[] = [];
    const { unmount } = render(<Harness onValue={(v) => values.push(v)} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    unmount();
    expect(values.every((v) => v === false)).toBe(true);
  });

  // 실제 로컬 next dev 서버에서 비로그인 시 /api/auth/session이 `{}`가 아닌
  // bare `null` 바디를 반환하는 것을 확인했다 — 그 실제 형태를 회귀로 고정한다.
  it('stays false when the session response body is bare null (observed unauth shape)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => null,
      }),
    );
    const values: boolean[] = [];
    const { unmount } = render(<Harness onValue={(v) => values.push(v)} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    unmount();
    expect(values.every((v) => v === false)).toBe(true);
  });

  it('stays false when the fetch rejects (network error)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    );
    const values: boolean[] = [];
    render(<Harness onValue={(v) => values.push(v)} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(values.every((v) => v === false)).toBe(true);
  });
});
