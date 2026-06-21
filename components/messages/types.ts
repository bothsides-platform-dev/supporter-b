// 메시지 기능 공용 타입.
//
// 실데이터 뷰 타입(인박스 목록·스레드 메시지)은 서버 액션 로더가 단일 진실원천:
// conversationLoaders 의 반환형을 그대로 재노출해 드리프트를 막아요. 풍부한 렌더에
// 필요한 추가 필드(읽음영수증·첨부 등)는 로더가 그 필드를 돌려줄 때 함께 늘려요.
//
// Counterparty/RfpContext 는 컴포즈 진입점(CounterpartyProfileCard·MessageComposeSheet·RecipientCard)이
// 쓰는 표시 전용 타입 — 로더 반환형과 별개로 유지해요.

export type {
  ConversationListItem,
  ThreadMessage,
  LoadThreadResult,
} from '@/lib/server/actions/chat/conversationLoaders';

// 통합 인박스 항목(상대방 대화 + 팀 스레드) — 인박스 로더가 단일 진실원천.
export type { InboxListItem } from '@/lib/server/actions/chat/inboxLoader';

export type CounterpartyType = 'buyer' | 'pg';

export const COUNTERPARTY_TYPE_LABEL: Record<CounterpartyType, string> = {
  buyer: '구매사',
  pg: 'PG',
};

export type Counterparty = {
  name: string;
  type: CounterpartyType;
  workspaceId?: string;
  logoUpdatedAt?: string | null;
};

export type RfpContext = {
  /** 전송용 RFP uuid — 화면에 렌더하지 않음. */
  id: string;
  /** 사람이 읽는 RFP 코드 (e.g. P-2605-0042) — 있을 때만 표시. */
  code?: string;
  /** RFP 제목 — 있을 때만 표시. */
  title?: string;
};
