'use client';

// 가상 샘플 온보딩 — PG 딜룸 투어 본문. PgDealRoomBody 와 같은 역할(딜룸 셸의
// children) 이라 이 컴포넌트 자체는 DealRoomFull/DealRoomModal 을 포함하지 않는다 —
// 페이지(app/(app)/inbox/[rfpId], app/(app)/inbox/@modal/(.)[rfpId])가 실제 딜룸과
// 동일하게 감싼다. BidWizard 의 onSampleSubmit 이 실제 submitBidAction 을 완전히
// 우회하고, 제출 즉시 이 컴포넌트가 결과 화면(SamplePgResultScreen)으로 전환한다.
import { useState } from 'react';
import { FileText, Pencil } from 'lucide-react';
import { DealRoomActionRail, type RailAction } from '@/components/deal-room/DealRoomActionRail';
import { DealRoomCenter, type DealRoomTab } from '@/components/deal-room/DealRoomCenter';
import { RfpBriefPanel } from '@/components/inbox/RfpBriefPanel';
import { BidWizard } from '@/components/inbox/bid-wizard/BidWizard';
import { updateOnboardingAction } from '@/lib/server/actions/onboarding/updateOnboardingAction';
import { SampleExperienceBanner } from './SampleExperienceBanner';
import { SamplePgResultScreen } from './SamplePgResultScreen';
import { sampleBuyerName, samplePgRfp } from '@/lib/onboarding/fixtures';

export function SamplePgDealRoom() {
  const [tab, setTab] = useState('write');
  const [submitted, setSubmitted] = useState(false);

  const onSampleSubmit = () => {
    setSubmitted(true);
    // fire-and-forget — 실패해도 로컬 결과 화면(체험)은 그대로 진행한다.
    void updateOnboardingAction({ key: 'pgSample', event: 'completed' }).catch(() => {});
  };

  const tabs: DealRoomTab[] = [
    {
      id: 'write',
      label: '견적 작성',
      content: (
        <BidWizard rfp={samplePgRfp} buyerName={sampleBuyerName} onSampleSubmit={onSampleSubmit} />
      ),
    },
    {
      id: 'request',
      label: '요청 조건',
      content: <RfpBriefPanel rfp={samplePgRfp} buyerName={sampleBuyerName} />,
    },
  ];

  const actions: RailAction[] = [
    { id: 'write', label: '견적 작성', icon: <Pencil />, primary: true, onSelect: () => setTab('write') },
    { id: 'request', label: '요청 보기', icon: <FileText />, onSelect: () => setTab('request') },
  ];

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 px-6 pt-4">
          <SampleExperienceBanner variant="pg" completed={submitted} />
        </div>
        <div className="flex min-h-0 flex-1 max-lg:flex-col">
          <DealRoomActionRail actions={actions} />
          <div className="min-w-0 flex-1">
            <DealRoomCenter tabs={tabs} activeId={tab} onChange={setTab} />
          </div>
        </div>
      </div>
      {submitted && <SamplePgResultScreen buyerName={sampleBuyerName} />}
    </>
  );
}
