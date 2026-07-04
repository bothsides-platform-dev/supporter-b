// Single source of truth for which lifecycle columns encode the buyer↔PG
// protocol. These are the columns where one workspace's action changes the
// other's board state (send→received, submit→active, award→won/lost,
// close→lost, withdraw→lost). They are mandatory (non-deletable) by user
// directive. The 작성중(draft/drafting) skeleton stages were removed.
//
// Pure, no DB import — usable from client components.
export const CROSS_SIDE_LIFECYCLE_KEYS: ReadonlySet<string> = new Set([
  // buyer side
  'active',
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

// Retained for the release-card pathway (resolveBoardDrop / releaseCardAction):
// a card placed on a column with this lifecycleKey is released back to
// auto-classification. No longer seeded as of rfp_bids removal — value reserved
// for future default-landing use.
export const DEFAULT_LANDING_KEY = 'inbox';
