'use client';

import { useState } from 'react';
import { Pencil, FileText } from 'lucide-react';
import { DealRoomActionRail, type RailAction } from '@/components/deal-room/DealRoomActionRail';
import { DealRoomCenter, type DealRoomTab } from '@/components/deal-room/DealRoomCenter';
import { RfpBriefPanel } from '@/components/inbox/RfpBriefPanel';
import { BidWizard } from '@/components/inbox/bid-wizard/BidWizard';
import { demoPgDealRfp, demoPgBuyer } from './pg-demo-fixtures';

// 데모 딜룸 — 실제 액션레일 + 탭(요청 조건=RfpBriefPanel, 기본 / 견적 작성=BidWizard guest)을
// fixture로. 실제 딜룸(PgDealRoomBody)과 같은 순서·기본 탭을 따른다.
// 게스트 제출은 서버 액션 대신 onGuestSubmit(가입 유도)로 빠진다.
export function PgDealRoomPageHost({ onGuestSubmit }: { onGuestSubmit: () => void }) {
  const [tab, setTab] = useState('request');

  const tabs: DealRoomTab[] = [
    {
      id: 'request',
      label: '요청 조건',
      content: <RfpBriefPanel rfp={demoPgDealRfp} buyer={demoPgBuyer} />,
    },
    {
      id: 'write',
      label: '견적 작성',
      content: (
        <BidWizard rfp={demoPgDealRfp} buyer={demoPgBuyer} onGuestSubmit={onGuestSubmit} />
      ),
    },
  ];

  const actions: RailAction[] = [
    { id: 'request', label: '요청 보기', icon: <FileText />, onSelect: () => setTab('request') },
    { id: 'write', label: '견적 작성', icon: <Pencil />, primary: true, onSelect: () => setTab('write') },
  ];

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 max-lg:flex-col">
        <DealRoomActionRail actions={actions} />
        <div className="min-w-0 flex-1">
          <DealRoomCenter tabs={tabs} activeId={tab} onChange={setTab} />
        </div>
      </div>
    </div>
  );
}
