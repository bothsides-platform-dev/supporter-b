import { expect, it, vi } from 'vitest';
import { managedSubscribe } from '@/lib/realtime/managedSubscribe';

function makeSub() {
  const handlers: Record<string, ((c: unknown) => void)[]> = {};
  return {
    handlers,
    on: vi.fn((e: string, cb: (c: unknown) => void) => { (handlers[e] ??= []).push(cb); }),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };
}

it('subscribes via getSubscription-or-new and registers only provided handlers', () => {
  const sub = makeSub();
  const client = {
    getSubscription: vi.fn().mockReturnValue(null),
    newSubscription: vi.fn().mockReturnValue(sub),
    removeSubscription: vi.fn(),
  };
  const onJoin = vi.fn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  managedSubscribe(client as any, 'presence:ws:v', { onJoin });

  expect(client.newSubscription).toHaveBeenCalledWith('presence:ws:v');
  expect(sub.subscribe).toHaveBeenCalled();
  const events = sub.on.mock.calls.map((c) => c[0]);
  expect(events).toContain('join');
  expect(events).not.toContain('leave');
});

it('disposer unsubscribes AND removes the subscription (no double-handler on remount)', () => {
  const sub = makeSub();
  const client = {
    getSubscription: vi.fn().mockReturnValue(null),
    newSubscription: vi.fn().mockReturnValue(sub),
    removeSubscription: vi.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispose = managedSubscribe(client as any, 'presence:ws:v', {});
  dispose();
  expect(sub.unsubscribe).toHaveBeenCalled();
  expect(client.removeSubscription).toHaveBeenCalledWith(sub);
});
