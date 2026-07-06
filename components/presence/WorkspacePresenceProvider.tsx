'use client';

/**
 * WorkspacePresenceProvider — one place that owns every live presence
 * subscription for the tab, plus the `useWorkspacePresence(wsId)` read hook.
 *
 * Why a provider (not a hook per consumer): many surfaces ask about the same
 * workspace's online state (the inbox list, a card, a header avatar). Each must
 * NOT open its own presence:ws:<id> subscription — Centrifugo would multiply the
 * channels and presence() round-trips. Instead consumers register *interest*;
 * the provider keeps exactly one subscription per distinct workspaceId with
 * interest > 0, fans the derived state back through context, and tears the
 * subscription down when the last interested consumer unmounts.
 *
 * Graceful no-op (load-bearing, mirrors centrifuge-client): getCentrifuge()
 * returns null when NEXT_PUBLIC_CENTRIFUGO_WS_URL is unset (dev + every test).
 * In that case the provider NEVER subscribes/connects/throws — the map stays
 * empty and every read returns `{ online:false, activity:'offline' }`.
 *
 * Asymmetric debounce: going online is applied immediately (a join should light
 * up instantly); going offline is delayed by OFFLINE_DEBOUNCE_MS so a brief
 * reconnect/tab-switch blip doesn't flicker the dot — cancelled if the workspace
 * comes back online within the window.
 *
 * Conditional focus reconcile: re-running presence() on every focus is wasteful.
 * We only re-sweep live subscriptions when something might have been missed —
 * either the client fired `disconnected` since the last sweep, or the tab was
 * hidden longer than HIDDEN_RESYNC_MS (join/leave events that arrived while the
 * socket was paused/backgrounded would otherwise be lost).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { getCentrifuge } from '@/lib/realtime/centrifuge-client';
import { managedSubscribe } from '@/lib/realtime/managed-subscribe';
import {
  deriveActivity,
  onlineUserIds,
  onlineWorkspaceIds,
  type PresenceEntry,
} from '@/lib/realtime/presence';
import { presenceWsChannel } from '@/lib/realtime/channels';

/** Max distinct workspaceIds we hold live subscriptions for at once. Beyond this
 *  the overflow simply reads offline — a soft ceiling on socket/channel fanout. */
export const INTEREST_CAP = 50;
/** Offline is applied only after this quiet window (online is immediate). */
export const OFFLINE_DEBOUNCE_MS = 4000;
/** A hidden tab longer than this is resynced on focus (paused socket = missed events). */
export const HIDDEN_RESYNC_MS = 30_000;

export type WorkspaceActivity = 'active' | 'idle' | 'offline';
export type PresenceState = { online: boolean; activity: WorkspaceActivity };

const OFFLINE: PresenceState = { online: false, activity: 'offline' };

type PresenceContextValue = {
  /** Read the current presence for a workspace; OFFLINE if unknown/uninterested. */
  get: (wsId: string) => PresenceState;
  /** Is `userId` currently online in `wsId`'s channel? false if unknown/uninterested. */
  getUserOnline: (wsId: string, userId: string) => boolean;
  /** Register interest in a workspaceId (mount). No-op for falsy id. */
  acquire: (wsId: string) => void;
  /** Drop interest in a workspaceId (unmount). No-op for falsy id. */
  release: (wsId: string) => void;
};

const PresenceContext = createContext<PresenceContextValue | null>(null);

// Centrifuge's presence() resolves { clients: Record<id, ClientInfo> } where
// ClientInfo.connInfo carries the server-signed { workspaceId, state }. Map that
// to the pure PresenceEntry[] our derivation functions consume.
// `user` is the connection's authenticated userId (Centrifugo sets it from the
// JWT `sub` of the connection token — not client-supplied, so trustworthy). We
// keep it so a single person's online dot can be derived from the same channel.
type PresenceClientInfo = { user?: string; connInfo?: { workspaceId?: string; state?: string } };
type PresenceSnapshot = { clients?: Record<string, PresenceClientInfo> };

function snapshotToEntries(snapshot: PresenceSnapshot): PresenceEntry[] {
  const clients = snapshot.clients ?? {};
  return Object.values(clients).map((c) => ({
    connInfo: c.connInfo ? { workspaceId: c.connInfo.workspaceId } : undefined,
    data: c.connInfo?.state !== undefined ? { state: c.connInfo.state } : undefined,
    userId: c.user,
  }));
}

export function WorkspacePresenceProvider({ children }: { children?: ReactNode }) {
  const [presence, setPresence] = useState<Map<string, PresenceState>>(() => new Map());
  // Per-workspace set of online userIds, refreshed on each presence() recompute.
  // Unlike the workspace dot, a person's dot is not offline-debounced — the card
  // is opened on demand and short-lived, so immediate accuracy beats anti-flicker.
  const [userOnline, setUserOnline] = useState<Map<string, Set<string>>>(() => new Map());

  // Interest registry + live subscriptions live in refs (mutated outside render).
  const interestRef = useRef<Map<string, number>>(new Map());
  const subsRef = useRef<Map<string, { sub: { presence: () => Promise<unknown> }; dispose: () => void }>>(
    new Map(),
  );
  const offlineTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Focus-reconcile bookkeeping.
  const missedEventsRef = useRef(false);
  const lastHiddenAtRef = useRef<number | null>(null);

  // Bumped whenever the interest set changes so the reconcile effect re-runs.
  const [interestVersion, setInterestVersion] = useState(0);
  const bumpInterest = useCallback(() => setInterestVersion((v) => v + 1), []);

  const acquire = useCallback(
    (wsId: string) => {
      if (!wsId) return;
      const m = interestRef.current;
      m.set(wsId, (m.get(wsId) ?? 0) + 1);
      bumpInterest();
    },
    [bumpInterest],
  );

  const release = useCallback(
    (wsId: string) => {
      if (!wsId) return;
      const m = interestRef.current;
      const next = (m.get(wsId) ?? 0) - 1;
      if (next <= 0) m.delete(wsId);
      else m.set(wsId, next);
      bumpInterest();
    },
    [bumpInterest],
  );

  // Apply a recomputed state with the asymmetric debounce. Online → immediate
  // (and cancels any pending offline). Offline → scheduled OFFLINE_DEBOUNCE_MS.
  const applyState = useCallback((wsId: string, next: PresenceState) => {
    const timers = offlineTimersRef.current;
    if (next.online) {
      const pending = timers.get(wsId);
      if (pending) {
        clearTimeout(pending);
        timers.delete(wsId);
      }
      setPresence((prev) => {
        const cur = prev.get(wsId);
        if (cur && cur.online === next.online && cur.activity === next.activity) return prev;
        const m = new Map(prev);
        m.set(wsId, next);
        return m;
      });
      return;
    }
    // next is offline — only act if currently online, and debounce it.
    if (timers.has(wsId)) return; // already scheduled
    const t = setTimeout(() => {
      timers.delete(wsId);
      // Defense-in-depth: if the sub was disposed after this timer was
      // scheduled, skip the state update — the reconcile effect already
      // cleaned up the presence entry.
      if (!subsRef.current.has(wsId)) return;
      setPresence((prev) => {
        const cur = prev.get(wsId);
        if (cur && !cur.online) return prev;
        const m = new Map(prev);
        m.set(wsId, OFFLINE);
        return m;
      });
    }, OFFLINE_DEBOUNCE_MS);
    timers.set(wsId, t);
  }, []);

  // Read presence() for one live sub and fold it into state.
  const recompute = useCallback(
    (wsId: string) => {
      const entry = subsRef.current.get(wsId);
      if (!entry) return;
      void entry.sub
        .presence()
        .then((snapshot) => {
          // Guard: if the sub was disposed while presence() was in-flight,
          // discard the result — applying it would orphan an online entry for
          // a workspace nobody watches and could schedule a timer nobody clears.
          if (!subsRef.current.has(wsId)) return;
          const entries = snapshotToEntries((snapshot as PresenceSnapshot) ?? {});
          const online = onlineWorkspaceIds(entries).has(wsId);
          const activity = deriveActivity(entries, wsId);
          applyState(wsId, online ? { online: true, activity } : OFFLINE);
          // Per-user online set — applied immediately (no offline debounce).
          const users = onlineUserIds(entries, wsId);
          setUserOnline((prev) => {
            const cur = prev.get(wsId);
            if (cur && cur.size === users.size && [...users].every((u) => cur.has(u))) return prev;
            const m = new Map(prev);
            m.set(wsId, users);
            return m;
          });
        })
        .catch(() => {
          // presence() failed (transient) — leave current state untouched.
        });
    },
    [applyState],
  );

  // Reconcile: open subs for interested wsIds (up to the cap), close stale ones.
  useEffect(() => {
    const client = getCentrifuge();
    if (!client) return; // graceful no-op — never subscribe/connect/throw.

    const interest = interestRef.current;
    const subs = subsRef.current;

    // Close subscriptions whose interest dropped to 0.
    for (const wsId of [...subs.keys()]) {
      if (!interest.has(wsId)) {
        subs.get(wsId)!.dispose();
        subs.delete(wsId);
        const t = offlineTimersRef.current.get(wsId);
        if (t) {
          clearTimeout(t);
          offlineTimersRef.current.delete(wsId);
        }
        setPresence((prev) => {
          if (!prev.has(wsId)) return prev;
          const m = new Map(prev);
          m.delete(wsId);
          return m;
        });
        setUserOnline((prev) => {
          if (!prev.has(wsId)) return prev;
          const m = new Map(prev);
          m.delete(wsId);
          return m;
        });
      }
    }

    // Open subscriptions for newly-interested wsIds, respecting the cap. The cap
    // counts distinct live subscriptions — overflow is simply not subscribed and
    // reads offline.
    for (const wsId of interest.keys()) {
      if (subs.has(wsId)) continue;
      if (subs.size >= INTEREST_CAP) break;
      const channel = presenceWsChannel(wsId);
      const { sub, dispose } = managedSubscribe(client, channel, {
        onSubscribed: () => recompute(wsId),
        onJoin: () => recompute(wsId),
        onLeave: () => recompute(wsId),
      });
      subs.set(wsId, { sub: sub as unknown as { presence: () => Promise<unknown> }, dispose });
    }

    client.connect();
  }, [interestVersion, recompute]);

  // Conditional focus reconcile + missed-event tracking on the connection.
  useEffect(() => {
    const client = getCentrifuge();
    if (!client) return; // no-op when unconfigured.

    const onDisconnected = () => {
      missedEventsRef.current = true;
    };
    client.on('disconnected', onDisconnected);

    const sweep = () => {
      const hiddenLong =
        lastHiddenAtRef.current !== null &&
        Date.now() - lastHiddenAtRef.current > HIDDEN_RESYNC_MS;
      if (!missedEventsRef.current && !hiddenLong) return;
      missedEventsRef.current = false;
      lastHiddenAtRef.current = null;
      for (const wsId of subsRef.current.keys()) recompute(wsId);
    };

    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        lastHiddenAtRef.current = Date.now();
      } else {
        sweep();
      }
    };
    const onFocus = () => sweep();

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      client.off('disconnected', onDisconnected);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [recompute]);

  // Tear everything down on provider unmount.
  useEffect(() => {
    const subs = subsRef.current;
    const timers = offlineTimersRef.current;
    return () => {
      for (const { dispose } of subs.values()) dispose();
      subs.clear();
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const value = useMemo<PresenceContextValue>(
    () => ({
      get: (wsId: string) => presence.get(wsId) ?? OFFLINE,
      getUserOnline: (wsId: string, userId: string) => userOnline.get(wsId)?.has(userId) ?? false,
      acquire,
      release,
    }),
    [presence, userOnline, acquire, release],
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

/**
 * Read the live presence of a workspace. Registers interest on mount and drops
 * it on unmount (the provider opens/closes the underlying subscription). Returns
 * `{ online:false, activity:'offline' }` when the wsId is falsy, realtime is
 * unconfigured, or the workspace isn't (yet) known online.
 */
export function useWorkspacePresence(workspaceId: string | undefined): PresenceState {
  const ctx = useContext(PresenceContext);

  useEffect(() => {
    if (!ctx || !workspaceId) return;
    ctx.acquire(workspaceId);
    return () => ctx.release(workspaceId);
  }, [ctx, workspaceId]);

  if (!ctx || !workspaceId) return OFFLINE;
  return ctx.get(workspaceId);
}

/**
 * Is a single person online? Reads `workspaceId`'s presence channel (registering
 * interest like `useWorkspacePresence`) and reports whether `userId` has a live
 * owner connection there. Returns `false` when either id is falsy, realtime is
 * unconfigured, or the user isn't (yet) known online. Best-effort: a person's dot
 * only lights when the provider already watches that workspace's channel.
 */
export function useUserPresence(
  workspaceId: string | undefined,
  userId: string | undefined,
): boolean {
  const ctx = useContext(PresenceContext);

  useEffect(() => {
    if (!ctx || !workspaceId || !userId) return;
    ctx.acquire(workspaceId);
    return () => ctx.release(workspaceId);
  }, [ctx, workspaceId, userId]);

  if (!ctx || !workspaceId || !userId) return false;
  return ctx.getUserOnline(workspaceId, userId);
}
