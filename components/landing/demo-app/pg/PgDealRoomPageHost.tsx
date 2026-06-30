'use client';

import { useState } from 'react';
import { Pencil, FileText } from 'lucide-react';
import { DealRoomActionRail, type RailAction } from '@/components/deal-room/DealRoomActionRail';
import { DealRoomCenter, type DealRoomTab } from '@/components/deal-room/DealRoomCenter';
import { RfpBriefPanel } from '@/components/inbox/RfpBriefPanel';
import { BidWizard } from '@/components/inbox/bid-wizard/BidWizard';
import { DemoCue } from '../DemoCue';
import { demoPgDealRfp, demoPgBuyerName } from './pg-demo-fixtures';

// 데모 딜룸 — 실제 액션레일 + 탭(견적 작성=BidWizard guest / 요청 조건=RfpBriefPanel)을 fixture로.
// 게스트 제출은 서버 액션 대신 onGuestSubmit(가입 유도)로 빠진다.
export function PgDealRoomPageHost({
  onGuestSubmit,
  showCue = false,
}: {
  onGuestSubmit: () => void;
  showCue?: boolean;
}) {
  const [tab, setTab] = useState('write');

  const tabs: DealRoomTab[] = [
    {
      id: 'write',
      label: '견적 작성',
      content: (
        <BidWizard rfp={demoPgDealRfp} buyerName={demoPgBuyerName} onGuestSubmit={onGuestSubmit} />
      ),
    },
    {
      id: 'request',
      label: '요청 조건',
      content: <RfpBriefPanel rfp={demoPgDealRfp} buyerName={demoPgBuyerName} />,
    },
  ];

  const actions: RailAction[] = [
    { id: 'write', label: '견적 작성', icon: <Pencil />, primary: true, onSelect: () => setTab('write') },
    { id: 'request', label: '요청 보기', icon: <FileText />, onSelect: () => setTab('request') },
  ];

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <DemoCue show={showCue} label="조건을 입력하고 견적을 제출해요" />
      <div className="flex min-h-0 flex-1 max-lg:flex-col">
        <DealRoomActionRail actions={actions} />
        <div className="min-w-0 flex-1">
          <DealRoomCenter tabs={tabs} activeId={tab} onChange={setTab} />
        </div>
      </div>
    </div>
  );
}
