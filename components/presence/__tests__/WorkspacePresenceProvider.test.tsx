import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── centrifuge mock (mirrors lib/hooks/__tests__/useCentrifugoSubscription.test.ts) ──
// The Provider calls sub.presence() for the snapshot, so the mock sub exposes a
// configurable presence() resolving Centrifuge's PresenceResult shape:
//   { clients: Record<clientId, ClientInfo> } with ClientInfo.connInfo carrying
//   { workspaceId, state }.
type Handler = (ctx: unknown) => void;

type PresenceClients = Record<
  string,
  { client: string; user: string; connInfo?: { workspaceId?: string; state?: string } }
>;

function makeSub() {
  const handlers: Record<string, Handler[]> = {};
  let clients: PresenceClients = {};
  return {
    handlers,
    on: vi.fn((event: string, cb: Handler) => {
      (handlers[event] ??= []).push(cb);
    }),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    presence: vi.fn(async () => ({ clients })),
    __setPresence(next: PresenceClients) {
      clients = next;
    },
    __fire(event: string, ctx: unknown) {
      for (const h of handlers[event] ?? []) h(ctx);
    },
  };
}

type MockSub = ReturnType<typeof makeSub>;

// One sub instance per channel — the Provider subscribes N channels.
let subsByChannel: Record<string, MockSub>;
const mockClientHandlers: Record<string, Handler[]> = {};
const mockClient = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  newSubscription: vi.fn((channel: string): MockSub => {
    return (subsByChannel[channel] ??= makeSub());
  }),
  getSubscription: vi.fn((channel: string): MockSub | null => subsByChannel[channel] ?? null),
  removeSubscription: vi.fn(),
  off: vi.fn(),
  on: vi.fn((event: string, cb: Handler) => {
    (mockClientHandlers[event] ??= []).push(cb);
  }),
  __fire(event: string, ctx: unknown) {
    for (const h of mockClientHandlers[event] ?? []) h(ctx);
  },
};

vi.mock('centrifuge', () => ({
  Centrifuge: vi.fn(function Centrifuge(this: unknown) {
    return mockClient;
  }),
}));
vi.mock('@/lib/http', () => ({ http: { post: vi.fn() } }));

function ownerEntry(wsId: string, state?: string): PresenceClients {
  return {
    [`c-${wsId}`]: { client: `c-${wsId}`, user: `u-${wsId}`, connInfo: { workspaceId: wsId, state } },
  };
}

beforeEach(() => {
  vi.resetModules();
  Object.keys(mockClientHandlers).forEach((k) => delete mockClientHandlers[k]);
  subsByChannel = {};
  mockClient.newSubscription.mockImplementation(
    (channel: string) => (subsByChannel[channel] ??= makeSub()),
  );
  mockClient.getSubscription.mockImplementation((channel: string) => subsByChannel[channel] ?? null);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('WorkspacePresenceProvider — graceful no-op (realtime 미설정)', () => {
  it('URL 미설정이면 구독을 전혀 하지 않고 offline 을 반환한다', async () => {
    vi.stubEnv('NEXT_PUBLIC_CENTRIFUGO_WS_URL', '');
    const { renderHook } = await import('@testing-library/react');
    const { WorkspacePresenceProvider, useWorkspacePresence } = await import(
      '@/components/presence/WorkspacePresenceProvider'
    );

    const { result } = renderHook(() => useWorkspacePresence('ws-1'), {
      wrapper: WorkspacePresenceProvider,
    });

    expect(result.current).toEqual({ online: false, activity: 'offline' });
    expect(mockClient.newSubscription).not.toHaveBeenCalled();
    expect(mockClient.connect).not.toHaveBeenCalled();
  });

  it('wsId 가 falsy 면 (설정돼 있어도) 구독하지 않고 offline 을 반환한다', async () => {
    vi.stubEnv('NEXT_PUBLIC_CENTRIFUGO_WS_URL', 'wss://example.test/connection/websocket');
    const { renderHook } = await import('@testing-library/react');
    const { WorkspacePresenceProvider, useWorkspacePresence } = await import(
      '@/components/presence/WorkspacePresenceProvider'
    );

    const { result } = renderHook(() => useWorkspacePresence(undefined), {
      wrapper: WorkspacePresenceProvider,
    });

    expect(result.current).toEqual({ online: false, activity: 'offline' });
    expect(mockClient.newSubscription).not.toHaveBeenCalled();
  });
});

describe('WorkspacePresenceProvider — 라이브 (realtime 설정)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_CENTRIFUGO_WS_URL', 'wss://example.test/connection/websocket');
  });

  it('snapshot 에 owner 항목이 있으면 subscribed 후 online:true 가 된다', async () => {
    const { renderHook, act, waitFor } = await import('@testing-library/react');
    const { WorkspacePresenceProvider, useWorkspacePresence } = await import(
      '@/components/presence/WorkspacePresenceProvider'
    );

    const { result } = renderHook(() => useWorkspacePresence('ws-1'), {
      wrapper: WorkspacePresenceProvider,
    });

    const channel = 'presence:ws:ws-1';
    expect(mockClient.newSubscription).toHaveBeenCalledWith(channel);

    // snapshot for ws-1 → active owner
    subsByChannel[channel].__setPresence(ownerEntry('ws-1', 'active'));
    act(() => {
      subsByChannel[channel].__fire('subscribed', {});
    });

    await waitFor(() => {
      expect(result.current).toEqual({ online: true, activity: 'active' });
    });
  });

  it('owner 가 빠지는 leave 는 4s 디바운스 후에야 offline 으로 내린다 (rejoin 이면 취소)', async () => {
    vi.useFakeTimers();
    const { renderHook, act } = await import('@testing-library/react');
    const { WorkspacePresenceProvider, useWorkspacePresence } = await import(
      '@/components/presence/WorkspacePresenceProvider'
    );

    const { result } = renderHook(() => useWorkspacePresence('ws-1'), {
      wrapper: WorkspacePresenceProvider,
    });

    const channel = 'presence:ws:ws-1';

    // 1) online via subscribed snapshot
    subsByChannel[channel].__setPresence(ownerEntry('ws-1', 'idle'));
    await act(async () => {
      subsByChannel[channel].__fire('subscribed', {});
      await Promise.resolve();
    });
    expect(result.current.online).toBe(true);

    // 2) owner leaves → empty snapshot, fire leave
    subsByChannel[channel].__setPresence({});
    await act(async () => {
      subsByChannel[channel].__fire('leave', {});
      await Promise.resolve();
    });
    // still online — offline is debounced
    expect(result.current.online).toBe(true);

    // 3) advance < debounce → still online
    await act(async () => {
      vi.advanceTimersByTime(3999);
      await Promise.resolve();
    });
    expect(result.current.online).toBe(true);

    // 4) past the debounce → offline
    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(result.current).toEqual({ online: false, activity: 'offline' });
  });

  it('디바운스 창 안에서 owner 가 다시 join 하면 offline 강등이 취소된다', async () => {
    vi.useFakeTimers();
    const { renderHook, act } = await import('@testing-library/react');
    const { WorkspacePresenceProvider, useWorkspacePresence } = await import(
      '@/components/presence/WorkspacePresenceProvider'
    );

    const { result } = renderHook(() => useWorkspacePresence('ws-1'), {
      wrapper: WorkspacePresenceProvider,
    });
    const channel = 'presence:ws:ws-1';

    subsByChannel[channel].__setPresence(ownerEntry('ws-1', 'active'));
    await act(async () => {
      subsByChannel[channel].__fire('subscribed', {});
      await Promise.resolve();
    });
    expect(result.current.online).toBe(true);

    // leave → schedule offline
    subsByChannel[channel].__setPresence({});
    await act(async () => {
      subsByChannel[channel].__fire('leave', {});
      await Promise.resolve();
    });

    // half-way through, owner rejoins
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    subsByChannel[channel].__setPresence(ownerEntry('ws-1', 'active'));
    await act(async () => {
      subsByChannel[channel].__fire('join', {});
      await Promise.resolve();
    });
    expect(result.current.online).toBe(true);

    // run past the original window — must remain online (cancelled)
    await act(async () => {
      vi.advanceTimersByTime(4000);
      await Promise.resolve();
    });
    expect(result.current).toEqual({ online: true, activity: 'active' });
  });

  it('같은 wsId 를 보는 컴포넌트가 둘이어도 채널 구독은 한 번만 생성한다', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { WorkspacePresenceProvider, useWorkspacePresence } = await import(
      '@/components/presence/WorkspacePresenceProvider'
    );

    renderHook(
      () => {
        useWorkspacePresence('ws-dup');
        useWorkspacePresence('ws-dup');
      },
      { wrapper: WorkspacePresenceProvider },
    );

    const channel = 'presence:ws:ws-dup';
    const created = mockClient.newSubscription.mock.calls.filter((c) => c[0] === channel);
    expect(created).toHaveLength(1);
  });

  it('관심 wsId 가 INTEREST_CAP 을 넘으면 초과분은 구독하지 않고 offline 으로 읽힌다', async () => {
    const React = await import('react');
    const { render } = await import('@testing-library/react');
    const { WorkspacePresenceProvider, useWorkspacePresence, INTEREST_CAP } = await import(
      '@/components/presence/WorkspacePresenceProvider'
    );

    const ids = Array.from({ length: INTEREST_CAP + 5 }, (_, i) => `ws-${i}`);
    const seen: Record<string, { online: boolean; activity: string }> = {};

    // One component per id → the hook is called exactly once per render (no loop).
    function Probe({ id }: { id: string }) {
      seen[id] = useWorkspacePresence(id);
      return null;
    }

    render(
      React.createElement(
        WorkspacePresenceProvider,
        null,
        ids.map((id) => React.createElement(Probe, { key: id, id })),
      ),
    );

    // exactly INTEREST_CAP channels subscribed, overflow not subscribed
    const subscribedChannels = new Set(
      mockClient.newSubscription.mock.calls.map((c) => c[0] as string),
    );
    expect(subscribedChannels.size).toBe(INTEREST_CAP);

    // overflow ids read offline
    const overflow = ids[INTEREST_CAP + 1];
    expect(seen[overflow]).toEqual({ online: false, activity: 'offline' });
  });

  it('관심이 0 으로 떨어지면(컴포넌트 언마운트) 그 채널을 dispose 한다', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { WorkspacePresenceProvider, useWorkspacePresence } = await import(
      '@/components/presence/WorkspacePresenceProvider'
    );

    const { unmount } = renderHook(() => useWorkspacePresence('ws-gc'), {
      wrapper: WorkspacePresenceProvider,
    });
    const channel = 'presence:ws:ws-gc';
    const sub = subsByChannel[channel];
    expect(sub).toBeDefined();

    unmount();

    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(mockClient.removeSubscription).toHaveBeenCalledWith(sub);
  });

  // ── A. REGRESSION: in-flight presence() race after sub is disposed ────────
  // The provider stays mounted (a keeper consumer watches 'ws-keeper'). Only
  // ws-race's interest drops to 0 mid-flight. If the guard is missing, the
  // late .then() calls setPresence and the provider's map ends up with an
  // orphan { online:true } for ws-race — visible when a NEW consumer registers
  // and reads the shared state.
  it('presence() 가 in-flight 인 동안 sub 가 dispose 되면 늦은 resolve 는 무시된다 (온라인 상태가 남지 않는다)', async () => {
    const React = await import('react');
    const { render, screen, act, waitFor } = await import('@testing-library/react');
    const { WorkspacePresenceProvider, useWorkspacePresence } = await import(
      '@/components/presence/WorkspacePresenceProvider'
    );

    // Render results that components write out so we can assert them.
    const results: Record<string, string> = {};
    function Probe({ id }: { id: string }) {
      const s = useWorkspacePresence(id);
      results[id] = `${s.online}:${s.activity}`;
      return React.createElement('span', { 'data-testid': id }, results[id]);
    }

    // Mount the provider with a keeper consumer (keeps provider alive) and the
    // race consumer (will be torn down mid-flight).
    function App({ showRace }: { showRace: boolean }) {
      return React.createElement(
        WorkspacePresenceProvider,
        null,
        React.createElement(Probe, { id: 'ws-keeper' }),
        showRace ? React.createElement(Probe, { id: 'ws-race' }) : null,
      );
    }

    const { rerender } = render(React.createElement(App, { showRace: true }));

    const raceChannel = 'presence:ws:ws-race';
    const raceSub = subsByChannel[raceChannel];
    expect(raceSub).toBeDefined();

    // Set up a deferred presence() so we can control when it resolves.
    let resolvePresence!: (val: { clients: PresenceClients }) => void;
    const deferredPresence = new Promise<{ clients: PresenceClients }>((r) => {
      resolvePresence = r;
    });
    raceSub.presence.mockReturnValue(deferredPresence);

    // Trigger recompute → presence() is now in-flight (deferred).
    act(() => {
      raceSub.__fire('subscribed', {});
    });

    // Drop interest to 0 by removing the race consumer while the provider stays up.
    act(() => {
      rerender(React.createElement(App, { showRace: false }));
    });
    // Confirm sub was disposed (interest == 0).
    expect(raceSub.unsubscribe).toHaveBeenCalled();

    // NOW resolve the in-flight presence() with an online snapshot.
    await act(async () => {
      resolvePresence({ clients: ownerEntry('ws-race', 'active') });
      await Promise.resolve();
      await Promise.resolve();
    });

    // Re-add the race consumer — it should read offline, not the orphan online.
    act(() => {
      rerender(React.createElement(App, { showRace: true }));
    });

    await waitFor(() => {
      const el = screen.queryByTestId('ws-race');
      // Must be offline — stale online resolve was discarded.
      expect(el?.textContent).toBe('false:offline');
    });
  });

  // ── B. focus-reconcile POSITIVE: disconnected then focus re-runs presence() ──
  it('disconnected 이벤트 후 window focus 가 오면 live sub 의 presence() 를 다시 호출한다', async () => {
    const { renderHook, act, waitFor } = await import('@testing-library/react');
    const { WorkspacePresenceProvider, useWorkspacePresence } = await import(
      '@/components/presence/WorkspacePresenceProvider'
    );

    const { result } = renderHook(() => useWorkspacePresence('ws-focus'), {
      wrapper: WorkspacePresenceProvider,
    });

    const channel = 'presence:ws:ws-focus';
    const sub = subsByChannel[channel];
    expect(sub).toBeDefined();

    // Bring the workspace online first.
    sub.__setPresence(ownerEntry('ws-focus', 'active'));
    await act(async () => {
      sub.__fire('subscribed', {});
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.online).toBe(true));

    const callsBefore = sub.presence.mock.calls.length;

    // Simulate a disconnection (sets missedEventsRef).
    act(() => {
      mockClient.__fire('disconnected', {});
    });

    // Fire a window focus — the sweep should re-run presence().
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });

    expect(sub.presence.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  // ── C. focus-reconcile NO-OP: no disconnect + tab not hidden long ────────
  it('disconnected 없이 focus 만 오고 tab 이 30s 미만 hidden 이었다면 presence() 를 재호출하지 않는다', async () => {
    vi.useFakeTimers();
    const { renderHook, act } = await import('@testing-library/react');
    const { WorkspacePresenceProvider, useWorkspacePresence } = await import(
      '@/components/presence/WorkspacePresenceProvider'
    );

    renderHook(() => useWorkspacePresence('ws-noop'), {
      wrapper: WorkspacePresenceProvider,
    });

    const channel = 'presence:ws:ws-noop';
    const sub = subsByChannel[channel];
    expect(sub).toBeDefined();

    // Bring online synchronously via fake timers.
    sub.__setPresence(ownerEntry('ws-noop', 'active'));
    await act(async () => {
      sub.__fire('subscribed', {});
      await Promise.resolve();
    });

    const callsBefore = sub.presence.mock.calls.length;

    // Tab goes hidden for LESS than HIDDEN_RESYNC_MS (10s < 30s threshold).
    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(10_000);
    });

    // Tab becomes visible again → triggers sweep.
    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Also fire focus — no disconnect was flagged and hidden < 30s.
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    // presence() call count must not have increased — sweep was skipped.
    expect(sub.presence.mock.calls.length).toBe(callsBefore);
  });
});
