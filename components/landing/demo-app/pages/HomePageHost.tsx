'use client';

import { HomeDashboard } from '@/components/home/HomeDashboard';
import { demoDashboard, demoInboxItems, demoUnreadCount } from '../demo-app-fixtures';
import { DemoCue } from '../DemoCue';

// 데모 홈 페이지 — 실제 HomeDashboard를 fixture로 구동. 내부 링크는 셸의 클릭 인터셉트가 처리.
export function HomePageHost({ showCue = false }: { showCue?: boolean }) {
  return (
    <div className="relative px-6 py-6">
      <DemoCue show={showCue} label="내 견적 현황을 한눈에 볼 수 있어요" />
      <HomeDashboard
        dashboard={demoDashboard}
        workspaceType="buyer"
        items={demoInboxItems}
        unreadCount={demoUnreadCount}
      />
    </div>
  );
}
