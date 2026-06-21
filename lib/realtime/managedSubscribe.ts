import type { Centrifuge, PublicationContext, Subscription } from 'centrifuge';

export type ManagedHandlers = {
  onPublication?: (ctx: PublicationContext) => void;
  onSubscribed?: () => void;
  onJoin?: () => void;
  onLeave?: () => void;
};

/**
 * Subscribe to one channel and return a disposer. Single source for the subtle
 * lifecycle: getSubscription-or-new, register only the handlers given, and on
 * dispose unsubscribe() + removeSubscription() so a remount of the same channel
 * gets a fresh handler set (otherwise onPublication fires twice). Shared by
 * useCentrifugoSubscription (1 channel) and WorkspacePresenceProvider (N).
 */
export function managedSubscribe(
  client: Centrifuge,
  channel: string,
  handlers: ManagedHandlers,
): () => void {
  const sub: Subscription =
    client.getSubscription(channel) ?? client.newSubscription(channel);
  if (handlers.onPublication) sub.on('publication', (ctx) => handlers.onPublication!(ctx));
  if (handlers.onSubscribed) sub.on('subscribed', () => handlers.onSubscribed!());
  if (handlers.onJoin) sub.on('join', () => handlers.onJoin!());
  if (handlers.onLeave) sub.on('leave', () => handlers.onLeave!());
  sub.subscribe();
  return () => {
    sub.unsubscribe();
    client.removeSubscription(sub);
  };
}
