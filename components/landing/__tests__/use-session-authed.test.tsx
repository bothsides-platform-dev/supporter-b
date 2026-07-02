import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useSessionAuthed } from '../use-session-authed';

function Harness({ onValue }: { onValue: (v: boolean) => void }) {
  const authed = useSessionAuthed();
  onValue(authed);
  return null;
}

// 각 테스트가 독립된 SWR 캐시를 쓰도록 격리 — 그렇지 않으면 같은 키
// ('/api/auth/session')를 공유해 테스트 간 캐시된 응답이 새어 나간다.
function renderIsolated(node: React.ReactNode) {
  return render(<SWRConfig value={{ provider: () => new Map() }}>{node}</SWRConfig>);
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
    renderIsolated(<Harness onValue={(v) => values.push(v)} />);
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
    renderIsolated(<Harness onValue={(v) => values.push(v)} />);
    await waitFor(() => expect(values.at(-1)).toBe(true));
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/api/auth/session');
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
    const { unmount } = renderIsolated(<Harness onValue={(v) => values.push(v)} />);
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
    const { unmount } = renderIsolated(<Harness onValue={(v) => values.push(v)} />);
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
    renderIsolated(<Harness onValue={(v) => values.push(v)} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(values.every((v) => v === false)).toBe(true);
  });

  // 랜딩 헤더 2개(LandingHeaderNav, PgLandingHeaderNav)가 각각 훅을 마운트할 수 있어
  // SWR의 키 기반 중복 제거로 단일 fetch만 나가는지 검증한다.
  it('dedupes concurrent mounts into a single /api/auth/session fetch (SWR cache sharing)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ user: { id: 'u1' } }),
      }),
    );
    const valuesA: boolean[] = [];
    const valuesB: boolean[] = [];
    renderIsolated(
      <>
        <Harness onValue={(v) => valuesA.push(v)} />
        <Harness onValue={(v) => valuesB.push(v)} />
      </>,
    );
    await waitFor(() => expect(valuesA.at(-1)).toBe(true));
    await waitFor(() => expect(valuesB.at(-1)).toBe(true));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
