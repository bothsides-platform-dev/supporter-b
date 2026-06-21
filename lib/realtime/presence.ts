// Pure presence derivation. No time, no DOM, no Centrifuge — trivially testable.
// "Online" = a presence:ws:<V> map has >=1 entry whose connInfo.workspaceId === V.
// Observers also appear in the map (their own workspaceId); the V-filter excludes
// them. connInfo is server-signed (the connection token), so workspaceId can't be
// spoofed for a workspace you aren't a member of.

export type PresenceEntry = {
  connInfo?: { workspaceId?: string };
  data?: { state?: string };
};

const ACTIVITY = new Set(['active', 'idle']);

/** workspaceIds that currently have at least one live owner connection. */
export function onlineWorkspaceIds(entries: PresenceEntry[]): Set<string> {
  const out = new Set<string>();
  for (const e of entries) {
    const ws = e.connInfo?.workspaceId;
    if (ws) out.add(ws);
  }
  return out;
}

/**
 * Activity for one workspace V from its channel's presence entries.
 * - no owner entry → 'offline'
 * - owner entry with a validated 'active' publication → 'active'
 * - owner entry otherwise (unknown/idle/garbage state) → 'idle'
 * Only owner entries (connInfo.workspaceId === V) count — spoofing bound.
 * M1 surfaces treat idle as online (binary); M2 renders the 3rd state.
 */
export function deriveActivity(
  entries: PresenceEntry[],
  workspaceId: string,
): 'active' | 'idle' | 'offline' {
  const owners = entries.filter((e) => e.connInfo?.workspaceId === workspaceId);
  if (owners.length === 0) return 'offline';
  const anyActive = owners.some((e) => {
    const s = e.data?.state;
    return s !== undefined && ACTIVITY.has(s) && s === 'active';
  });
  return anyActive ? 'active' : 'idle';
}
