// Unified kanban domain types. Mirrors the `columns` + *_placements schema.
// Pure declarations — usable from both server and client.

export type ColumnKind = 'pipeline' | 'rfp_bids';

// Mirrors the MD3 Chip color roles (chip_color enum).
export type ChipColorRole = 'primary' | 'tertiary' | 'warning' | 'error' | 'surface';

// Discriminator for which card a placement references. Derivable from the board
// kind (pipeline → rfp|invitation by workspace type; rfp_bids → bid) but carried
// explicitly through the action layer for an unambiguous cross-kind guard.
export type CardType = 'rfp' | 'invitation' | 'bid';

export type BoardColumn = {
  id: string;
  workspaceId: string;
  kind: ColumnKind;
  title: string;
  position: string;
  color: ChipColorRole | null;
  // Bound lifecycle state/action; null = custom or default-landing column.
  lifecycleKey: string | null;
  // Non-deletable (cross-side protocol / lifecycle skeleton / default landing).
  isSystem: boolean;
};

export type Placement = {
  columnId: string;
  cardId: string;
  position: string;
};

// A card placed on a board. `cardId` is the uuid (placement + actions);
// `payload` is the display object (BuyerKanbanCard | PgKanbanCard | Bid).
// `position` is set only for explicitly-placed cards (custom columns).
export type BoardCard = {
  cardType: CardType;
  cardId: string;
  columnId: string;
  position: string | null;
  payload: unknown;
};

export type BoardData = {
  columns: BoardColumn[];
  cards: BoardCard[];
};
