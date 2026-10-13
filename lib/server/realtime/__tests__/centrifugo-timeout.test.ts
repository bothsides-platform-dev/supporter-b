import { afterEach, describe, expect, it, vi } from 'vitest';

import { presentUserIdsInConversation } from '../centrifugo';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('presence timeout', () => {
  it.each(['request', 'body'] as const)(
    'treats recipients as offline after 3 seconds when the %s stalls',
    async (phase) => {
      vi.stubEnv('CENTRIFUGO_HTTP_API_URL', 'http://centrifugo.test/api');
      vi.stubEnv('CENTRIFUGO_API_KEY', 'test-key');
      vi.useFakeTimers();
      // Node's native AbortSignal.timeout bypasses fake timers. Preserve its
      // abort semantics while letting this test advance the requested delay.
      vi.spyOn(AbortSignal, 'timeout').mockImplementation((delay) => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), delay);
        return controller.signal;
      });

      let requestSignal: AbortSignal | null | undefined;
      vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
        requestSignal = init.signal;
        if (phase === 'request') {
          return new Promise<Response>((_resolve, reject) => {
            requestSignal?.addEventListener('abort', () => reject(requestSignal?.reason), { once: true });
          });
        }
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            requestSignal?.addEventListener('abort', () => controller.error(requestSignal?.reason), { once: true });
            controller.enqueue(new TextEncoder().encode('{"result":{"presence":'));
          },
        });
        return Promise.resolve(new Response(body));
      }));

      let result: Set<string> | undefined;
      const pending = presentUserIdsInConversation('conv-timeout').then((users) => { result = users; });
      await vi.advanceTimersByTimeAsync(2_999);
      expect(result).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);

      expect(requestSignal?.aborted).toBe(true);
      await pending;
      expect(result).toEqual(new Set());
    },
  );
});
