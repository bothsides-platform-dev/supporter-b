// 메시지 기능 공용 타입 (렌더 전용 — 백엔드 미구현).

export type CounterpartyType = 'buyer' | 'pg';

export const COUNTERPARTY_TYPE_LABEL: Record<CounterpartyType, string> = {
  buyer: '구매사',
  pg: 'PG',
};

export type Counterparty = {
  name: string;
  type: CounterpartyType;
  workspaceId?: string;
  hasLogo?: boolean;
};

export type RfpContext = {
  code: string;
  title: string;
};
