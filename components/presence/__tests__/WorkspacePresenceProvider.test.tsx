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
});
