import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── centrifuge mock (mirrors WorkspacePresenceProvider.test.tsx) ────────────
// PresenceClient subscribes its own presence:ws:<id> channel and eagerly calls
// client.connect(). The real getCentrifuge/managedSubscribe/presenceWsChannel are
// exercised; only the transport (Centrifuge + http token POST) is mocked.
type Handler = (ctx: unknown) => void;

function makeSub() {
  const handlers: Record<string, Handler[]> = {};
  return {
    handlers,
    on: vi.fn((event: string, cb: Handler) => {
      (handlers[event] ??= []).push(cb);
    }),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    presence: vi.fn(async () => ({ clients: {} })),
  };
}

type MockSub = ReturnType<typeof makeSub>;
let subsByChannel: Record<string, MockSub>;
const mockClient = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  newSubscription: vi.fn((channel: string): MockSub => (subsByChannel[channel] ??= makeSub())),
  getSubscription: vi.fn((channel: string): MockSub | null => subsByChannel[channel] ?? null),
  removeSubscription: vi.fn(),
  off: vi.fn(),
  on: vi.fn(),
};

vi.mock('centrifuge', () => ({
  Centrifuge: vi.fn(function Centrifuge(this: unknown) {
    return mockClient;
  }),
}));
vi.mock('@/lib/http', () => ({ http: { post: vi.fn() } }));

beforeEach(() => {
  vi.resetModules();
  subsByChannel = {};
  mockClient.newSubscription.mockImplementation(
    (channel: string) => (subsByChannel[channel] ??= makeSub()),
  );
  mockClient.getSubscription.mockImplementation((channel: string) => subsByChannel[channel] ?? null);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('PresenceClient', () => {
  it('realtime 설정이면 presence:ws:<id> 를 구독하고 connect 한다', async () => {
    vi.stubEnv('NEXT_PUBLIC_CENTRIFUGO_WS_URL', 'wss://example.test/connection/websocket');
    const { render } = await import('@testing-library/react');
    const { PresenceClient } = await import('@/components/presence/PresenceClient');

    const { container } = render(<PresenceClient workspaceId="ws-1" />);

    const channel = 'presence:ws:ws-1';
    expect(mockClient.newSubscription).toHaveBeenCalledWith(channel);
    expect(subsByChannel[channel].subscribe).toHaveBeenCalled();
    expect(mockClient.connect).toHaveBeenCalled();
    // Renders nothing.
    expect(container).toBeEmptyDOMElement();
  });

  it('realtime 미설정이면 구독하지 않고 throw 하지 않는다', async () => {
    vi.stubEnv('NEXT_PUBLIC_CENTRIFUGO_WS_URL', '');
    const { render } = await import('@testing-library/react');
    const { PresenceClient } = await import('@/components/presence/PresenceClient');

    expect(() => render(<PresenceClient workspaceId="ws-1" />)).not.toThrow();
    expect(mockClient.newSubscription).not.toHaveBeenCalled();
    expect(mockClient.connect).not.toHaveBeenCalled();
  });
});
