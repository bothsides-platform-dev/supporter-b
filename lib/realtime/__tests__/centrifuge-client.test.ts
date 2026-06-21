import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Each constructed Centrifuge returns a fresh disconnect-spy mock so we can
// assert disconnectCentrifuge() both disconnects the live client and drops the
// singleton (a subsequent getCentrifuge() must build a NEW instance).
const constructed: { disconnect: ReturnType<typeof vi.fn> }[] = [];
vi.mock('centrifuge', () => ({
  Centrifuge: vi.fn(function Centrifuge(this: unknown) {
    const inst = { disconnect: vi.fn() };
    constructed.push(inst);
    return inst;
  }),
}));
vi.mock('@/lib/http', () => ({ http: { post: vi.fn() } }));

beforeEach(() => {
  vi.resetModules();
  constructed.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('disconnectCentrifuge', () => {
  it('현재 클라이언트를 disconnect 하고 싱글턴을 비워 다음 getCentrifuge 가 새 인스턴스를 만든다', async () => {
    vi.stubEnv('NEXT_PUBLIC_CENTRIFUGO_WS_URL', 'wss://example.test/connection/websocket');
    const { getCentrifuge, disconnectCentrifuge } = await import('@/lib/realtime/centrifuge-client');

    const first = getCentrifuge();
    expect(first).not.toBeNull();
    expect(constructed).toHaveLength(1);

    disconnectCentrifuge();
    expect(constructed[0].disconnect).toHaveBeenCalled();

    // singleton + resolved flag were reset → a fresh client is built.
    const second = getCentrifuge();
    expect(constructed).toHaveLength(2);
    expect(second).not.toBe(first);
  });

  it('클라이언트가 없을 때 호출해도 throw 하지 않는다', async () => {
    vi.stubEnv('NEXT_PUBLIC_CENTRIFUGO_WS_URL', '');
    const { disconnectCentrifuge } = await import('@/lib/realtime/centrifuge-client');
    expect(() => disconnectCentrifuge()).not.toThrow();
  });
});
