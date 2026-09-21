'use client';

import { useState } from 'react';
import { DealRoomCenter, type DealRoomTab } from '@/components/deal-room/DealRoomCenter';
import { RfpBriefPanel } from '@/components/inbox/RfpBriefPanel';
import { BidWizard } from '@/components/inbox/bid-wizard/BidWizard';
import { demoPgDealRfp, demoPgBuyer } from './pg-demo-fixtures';

// 데모 딜룸 — 실제 PG 딜룸처럼 탭만 사용한다.
// 요청 조건=RfpBriefPanel(기본) / 견적 작성=BidWizard guest 를 fixture로 보여준다.
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

  return (
    <div className="h-full min-h-0">
      <DealRoomCenter tabs={tabs} activeId={tab} onChange={setTab} />
    </div>
  );
}
