import { expect, it, vi } from 'vitest';
import { managedSubscribe } from '@/lib/realtime/managed-subscribe';

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
  const result = managedSubscribe(client as any, 'presence:ws:v', { onJoin });

  expect(client.newSubscription).toHaveBeenCalledOnce();
  expect(client.newSubscription).toHaveBeenCalledWith('presence:ws:v');
  expect(result.sub).toBe(sub);
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
  const { dispose } = managedSubscribe(client as any, 'presence:ws:v', {});
  dispose();
  expect(sub.unsubscribe).toHaveBeenCalled();
  expect(client.removeSubscription).toHaveBeenCalledWith(sub);
});

it('shared channel: tears down only after the LAST owner disposes (refcount)', () => {
  // PresenceClient self-broadcast + WorkspacePresenceProvider both manage the
  // SAME presence:ws:<ownWs> channel. Disposing one must NOT kill the other's
  // subscription (else viewing a teammate card would tear down self-presence).
  const sub = makeSub();
  let created = false;
  const client = {
    getSubscription: vi.fn(() => (created ? sub : null)),
    newSubscription: vi.fn(() => {
      created = true;
      return sub;
    }),
    removeSubscription: vi.fn(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = managedSubscribe(client as any, 'presence:ws:own', {});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = managedSubscribe(client as any, 'presence:ws:own', { onJoin: vi.fn() });

  // Both reuse the one underlying subscription.
  expect(client.newSubscription).toHaveBeenCalledOnce();

  // First owner releases — subscription must SURVIVE.
  a.dispose();
  expect(sub.unsubscribe).not.toHaveBeenCalled();
  expect(client.removeSubscription).not.toHaveBeenCalled();

  // Last owner releases — now it tears down.
  b.dispose();
  expect(sub.unsubscribe).toHaveBeenCalledOnce();
  expect(client.removeSubscription).toHaveBeenCalledWith(sub);
});
