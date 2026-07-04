'use client';

import { HomeDashboard } from '@/components/home/HomeDashboard';
import { demoDashboard, demoInboxItems, demoUnreadCount } from '../demo-app-fixtures';

// 데모 홈 페이지 — 실제 HomeDashboard를 fixture로 구동. 내부 링크는 셸의 클릭 인터셉트가 처리.
export function HomePageHost() {
  return (
    <div className="relative px-6 py-6">
      <HomeDashboard
        dashboard={demoDashboard}
        workspaceType="buyer"
        items={demoInboxItems}
        unreadCount={demoUnreadCount}
      />
    </div>
  );
}
