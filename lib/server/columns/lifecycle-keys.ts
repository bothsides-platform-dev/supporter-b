// Single source of truth for which lifecycle columns encode the buyer↔PG
// protocol. These are the columns where one workspace's action changes the
// other's board state (send→received, submit→active, award→won/lost,
// close→lost, withdraw→lost). They are mandatory (non-deletable) by user
// directive. The remaining lifecycle stages (draft/drafting) are also
// non-deletable, but as a private skeleton — see deleteColumnAction for the
// distinct error messages.
//
// Pure, no DB import — usable from client components.
export const CROSS_SIDE_LIFECYCLE_KEYS: ReadonlySet<string> = new Set([
  // buyer side
  'active',
  'awarded',
  'closed',
  // pg side
  'received',
  'submitted',
  'won',
  'lost',
]);

export function isCrossSideLifecycleKey(key: string | null | undefined): boolean {
  return key != null && CROSS_SIDE_LIFECYCLE_KEYS.has(key);
}

// The rfp_bids board has no lifecycle classifier — every unplaced bid lands in
// the "진행전" default column, identified by this key. is_system (non-deletable)
// but NOT cross-side. resolveCardColumn returns this key for any rfp_bids card.
export const DEFAULT_LANDING_KEY = 'inbox';
