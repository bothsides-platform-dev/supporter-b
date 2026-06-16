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

import type { WorkspaceType } from '@/lib/types/workspace';

/**
 * 인박스 목록 아이템 — 상대방 채팅(counterparty)과 팀 내부 채팅(team)의
 * 판별 합집합(discriminated union). key 는 목록 고유 식별자.
 */
export type InboxListItem =
  | {
      kind: 'counterparty';
      key: string;
      conversationId: string;
      counterparty: { workspaceId: string; name: string; type: WorkspaceType; hasLogo: boolean };
      rfpId: string | null;
      rfpCode: string | null;
      rfpTitle: string | null;
      rfpStatus: string | null;
      rfpDeadline: string | null;
      preview: string;
      lastMessageAt: string | null;
      unread: boolean;
    }
  | {
      kind: 'team';
      key: string;
      rfpId: string;
      rfpCode: string;
      rfpTitle: string;
      preview: string;
      lastMessageAt: string | null;
      unread: boolean;
    };

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
