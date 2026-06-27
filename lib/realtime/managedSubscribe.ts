import type { Centrifuge, PublicationContext, Subscription } from 'centrifuge';

export type ManagedHandlers = {
  onPublication?: (ctx: PublicationContext) => void;
  onSubscribed?: () => void;
  onJoin?: () => void;
  onLeave?: () => void;
};

export type ManagedSubscribeResult = {
  sub: Subscription;
  dispose: () => void;
};

// Shared-ownership refcount keyed by the underlying Subscription object. When
// two callers manage the SAME channel — e.g. PresenceClient self-broadcasting to
// presence:ws:<ownWs> AND WorkspacePresenceProvider reading per-user online on
// that same own-workspace channel (teammate/self identity cards) — getSubscription
// hands both the one Subscription. Tearing it down on the FIRST dispose would kill
// the other owner (the user's self-presence would stop the moment they close a
// teammate card). Refcounting defers unsubscribe()+removeSubscription() to the last
// owner. Keyed by object identity (not channel string) so each test's fresh mock
// sub is isolated, and a Provider dispose+reacquire of a counterparty channel gets
// a brand-new Subscription with a fresh count.
const subRefcounts = new WeakMap<object, number>();

/**
 * Subscribe to one channel and return `{ sub, dispose }`. Single source for
 * the subtle lifecycle: getSubscription-or-new, register only the handlers
 * given, and on dispose (of the LAST owner) unsubscribe() + removeSubscription()
 * so a remount of the same channel gets a fresh handler set (otherwise
 * onPublication fires twice). Shared by useCentrifugoSubscription (1 channel),
 * WorkspacePresenceProvider (N), and PresenceClient (self-broadcast). Multiple
 * owners of one channel are refcounted (see subRefcounts above).
 *
 * Returning `sub` lets callers (e.g. useCentrifugoSubscription) skip their own
 * duplicate getSubscription-or-new call for subRef assignment.
 */
export function managedSubscribe(
  client: Centrifuge,
  channel: string,
  handlers: ManagedHandlers,
): ManagedSubscribeResult {
  const sub: Subscription =
    client.getSubscription(channel) ?? client.newSubscription(channel);
  if (handlers.onPublication) sub.on('publication', (ctx) => handlers.onPublication!(ctx));
  if (handlers.onSubscribed) sub.on('subscribed', () => handlers.onSubscribed!());
  if (handlers.onJoin) sub.on('join', () => handlers.onJoin!());
  if (handlers.onLeave) sub.on('leave', () => handlers.onLeave!());
  subRefcounts.set(sub, (subRefcounts.get(sub) ?? 0) + 1);
  sub.subscribe();
  let disposed = false;
  return {
    sub,
    dispose: () => {
      if (disposed) return; // idempotent — double-dispose must not decrement twice
      disposed = true;
      const next = (subRefcounts.get(sub) ?? 1) - 1;
      if (next > 0) {
        // Another owner still holds this channel. Leave the subscription (and
        // this owner's now-orphaned handlers, which downstream consumers guard
        // against by checking live interest) in place.
        subRefcounts.set(sub, next);
        return;
      }
      subRefcounts.delete(sub);
      sub.unsubscribe();
      client.removeSubscription(sub);
    },
  };
}
