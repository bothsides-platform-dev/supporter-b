'use client';

/**
 * buildContractTabEntries — buyer/PG 딜룸 바디가 공유하는 "계약 탭 + 레일 액션" 조립.
 *
 * signing 이 있을 때만 계약 탭(AwardContextLine + SigningTab)과 레일 액션(FileSignature
 * 아이콘 + buildSigningSummary 도트)을 만들어 돌려준다. 없으면 둘 다 빈 배열이라
 * 호출부의 `...spread` 는 그대로 no-op 이 된다. 두 바디의 유일한 차이는
 * side·contact·counterpartyWsId 뿐 — 배치(계약 탭이 항상 첫 번째, 계약 액션이 항상
 * 첫 번째)는 이 함수가 못박는다. PG 쪽은 봉인입찰 방어를 위해 `signing` 자체가 아니라
 * 컴포넌트가 이미 걸러낸 `contractVisible`(미선정 PG 에겐 null)을 넘겨야 한다 — 그
 * 게이트는 호출부(PgDealRoomBody)의 책임으로 남는다.
 */
import { FileSignature } from 'lucide-react';

import type { DealRoomTab } from '@/components/deal-room/DealRoomCenter';
import type { RailAction } from '@/components/deal-room/DealRoomActionRail';
import { AwardContextLine } from '@/components/deal-room/signing/AwardContextLine';
import { SigningTab } from '@/components/deal-room/signing/SigningTab';
import {
  buildSigningSummary,
  type SigningSide,
} from '@/components/deal-room/signing/signing-view-model';
import type { SigningView } from '@/lib/types/signing';

export function buildContractTabEntries(args: {
  rfpCode: string;
  /** null 이면 계약 탭/액션 둘 다 생략 — PG 쪽은 `contractVisible` 을 넘길 것. */
  signing: SigningView | null;
  side: SigningSide;
  contact: { workspaceName: string; name: string } | null;
  counterpartyWsId?: string;
  /**
   * PG 전용 — 발송 임베드에서 수신자로 넣어야 할 구매사 담당자. buyer 호출부는 넘기지
   * 않는다(넘겨도 `contact` 와 달리 상대편이 아니라 자기 자신이라 의미가 없다).
   */
  buyerSigner?: { name: string; email: string } | null;
  onSelect: () => void;
}): { tabs: DealRoomTab[]; actions: RailAction[] } {
  const {
    rfpCode,
    signing,
    side,
    contact,
    counterpartyWsId,
    buyerSigner,
    onSelect,
  } = args;
  if (!signing) return { tabs: [], actions: [] };

  const summary = buildSigningSummary(signing, side);

  return {
    tabs: [
      {
        id: 'contract',
        label: '계약',
        content: (
          <>
            {contact && (
              <AwardContextLine
                workspaceName={contact.workspaceName}
                contactName={contact.name}
                counterpartyWsId={counterpartyWsId}
              />
            )}
            <SigningTab
              rfpCode={rfpCode}
              signing={signing}
              side={side}
              buyerSigner={buyerSigner}
            />
          </>
        ),
      },
    ],
    actions: [
      {
        id: 'contract',
        label: '계약',
        icon: <FileSignature />,
        dot: summary.dot,
        dotLabel: summary.label,
        onSelect,
      },
    ],
  };
}
