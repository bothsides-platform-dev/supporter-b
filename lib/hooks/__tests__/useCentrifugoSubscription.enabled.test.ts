// useCentrifugoSubscription({ enabled }) — 랜딩 데모가 비로그인으로 실제 스레드
// 뷰를 그리므로, 인증되지 않은 WS 연결·비공개 채널 구독을 여기서 끊는다.
// 회귀 경계: 기본값(미지정)은 true 여야 한다 — 실제 앱은 이 옵션을 주지 않는다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── centrifuge mock (useCentrifugoSubscription.test.ts 와 동일 형태) ────────
type Handler = (ctx: unknown) => void;

function makeSub() {
  const handlers: Record<string, Handler[]> = {};
  return {
    state: 'unsubscribed',
    handlers,
    on: vi.fn((event: string, cb: Handler) => {
      (handlers[event] ??= []).push(cb);
    }),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    off: vi.fn(),
    publish: vi.fn().mockResolvedValue(undefined),
    presenceStats: vi.fn().mockResolvedValue({ numClients: 1, numUsers: 1 }),
    __fire(event: string, ctx: unknown) {
      for (const h of handlers[event] ?? []) h(ctx);
    },
  };
}

type MockSub = ReturnType<typeof makeSub>;
let mockSub: MockSub;
const mockClientHandlers: Record<string, Handler[]> = {};
const mockClient = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  newSubscription: vi.fn((): MockSub => mockSub),
  getSubscription: vi.fn((): MockSub | null => null),
  removeSubscription: vi.fn(),
  off: vi.fn(),
  on: vi.fn((event: string, cb: Handler) => {
    (mockClientHandlers[event] ??= []).push(cb);
  }),
};
vi.mock('centrifuge', () => ({
  Centrifuge: vi.fn(function Centrifuge(this: unknown) {
    return mockClient;
  }),
}));
vi.mock('@/lib/http', () => ({ http: { post: vi.fn() } }));

const CHANNEL = 'chat:conversation:abc';

beforeEach(() => {
  vi.resetModules();
  Object.keys(mockClientHandlers).forEach((k) => delete mockClientHandlers[k]);
  mockSub = makeSub();
  mockClient.newSubscription.mockImplementation(() => mockSub);
  mockClient.getSubscription.mockReturnValue(null);
  vi.stubEnv('NEXT_PUBLIC_CENTRIFUGO_WS_URL', 'wss://example.test/connection/websocket');
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('useCentrifugoSubscription — enabled', () => {
  it('enabled: false 면 연결도 구독도 하지 않는다', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { useCentrifugoSubscription } = await import('@/lib/hooks/useCentrifugoSubscription');

    const { result } = renderHook(() =>
      useCentrifugoSubscription(CHANNEL, { enabled: false }),
    );

    expect(mockClient.connect).not.toHaveBeenCalled();
    expect(mockClient.newSubscription).not.toHaveBeenCalled();
    expect(mockSub.subscribe).not.toHaveBeenCalled();
    expect(result.current.connected).toBeNull();
  });

  it('enabled 미지정은 기본 true — 실제 앱 동작이 그대로다 (회귀 가드)', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { useCentrifugoSubscription } = await import('@/lib/hooks/useCentrifugoSubscription');

    renderHook(() => useCentrifugoSubscription(CHANNEL, {}));

    expect(mockClient.newSubscription).toHaveBeenCalledWith(CHANNEL);
    expect(mockSub.subscribe).toHaveBeenCalled();
  });

  it('enabled: true 를 명시해도 구독한다', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { useCentrifugoSubscription } = await import('@/lib/hooks/useCentrifugoSubscription');

    renderHook(() => useCentrifugoSubscription(CHANNEL, { enabled: true }));

    expect(mockSub.subscribe).toHaveBeenCalled();
  });

  it('false → true 로 켜지면 그때 구독한다', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { useCentrifugoSubscription } = await import('@/lib/hooks/useCentrifugoSubscription');

    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useCentrifugoSubscription(CHANNEL, { enabled }),
      { initialProps: { enabled: false } },
    );
    expect(mockSub.subscribe).not.toHaveBeenCalled();

    rerender({ enabled: true });

    expect(mockSub.subscribe).toHaveBeenCalled();
  });

  it('true → false 로 꺼지면 기존 구독을 정리한다', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { useCentrifugoSubscription } = await import('@/lib/hooks/useCentrifugoSubscription');

    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useCentrifugoSubscription(CHANNEL, { enabled }),
      { initialProps: { enabled: true } },
    );
    expect(mockSub.subscribe).toHaveBeenCalled();

    rerender({ enabled: false });

    expect(mockSub.unsubscribe).toHaveBeenCalled();
  });
});

describe('useChatChannel — enabled 전달', () => {
  it('enabled: false 면 구독하지 않고 sendTyping 도 안전하게 무시된다', async () => {
    const { renderHook, act } = await import('@testing-library/react');
    const { useChatChannel } = await import('@/lib/hooks/useChatChannel');

    const { result } = renderHook(() => useChatChannel('abc', { enabled: false }));

    expect(mockClient.newSubscription).not.toHaveBeenCalled();
    expect(result.current.typingUserIds).toEqual([]);
    // 구독 핸들이 없으므로 publish 시도가 던지지 않아야 한다.
    act(() => {
      result.current.sendTyping();
    });
    expect(mockSub.publish).not.toHaveBeenCalled();
  });

  it('enabled 미지정이면 평소처럼 채널을 구독한다 (회귀 가드)', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { useChatChannel } = await import('@/lib/hooks/useChatChannel');

    renderHook(() => useChatChannel('abc', {}));

    expect(mockClient.newSubscription).toHaveBeenCalledWith('chat:conversation:abc');
    expect(mockSub.subscribe).toHaveBeenCalled();
  });
});
