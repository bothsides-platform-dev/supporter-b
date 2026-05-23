// Unified kanban domain types. Mirrors the `columns` table + the card tables'
// `board_column_id`. Pure declarations — usable from both server and client.

export type ColumnKind = 'pipeline' | 'rfp_bids';

// Mirrors the MD3 Chip color roles (chip_color enum).
export type ChipColorRole = 'primary' | 'tertiary' | 'warning' | 'error' | 'surface';

// Discriminator for which card table a board card lives in. Derivable from the
// board kind (pipeline → rfp|invitation by workspace type; rfp_bids → bid) but
// carried explicitly through the action layer for an unambiguous cross-kind guard.
export type CardType = 'rfp' | 'invitation' | 'bid';

export type BoardColumn = {
  id: string;
  workspaceId: string;
  kind: ColumnKind;
  title: string;
  position: string;
  color: ChipColorRole | null;
  // Bound lifecycle state/action; null = custom column.
  lifecycleKey: string | null;
};

// "system" columns are non-deletable (lifecycle-bound, incl. the rfp_bids
// default-landing). Derived from lifecycle_key — there is no stored is_system.
export function isSystemColumn(c: Pick<BoardColumn, 'lifecycleKey'>): boolean {
  return c.lifecycleKey != null;
}

// A card placed on a board. `cardId` is the uuid (card.id, used by actions);
// `columnId` is the resolved column (explicit board_column_id or classifier);
// `payload` is the display object (BuyerKanbanCard | PgKanbanCard | Bid).
export type BoardCard = {
  cardType: CardType;
  cardId: string;
  columnId: string;
  payload: unknown;
};

export type BoardData = {
  columns: BoardColumn[];
  cards: BoardCard[];
};
