'use client';

import { HomeDashboard } from '@/components/home/HomeDashboard';
import { PageEnter } from '@/components/primitives/PageEnter';
import { demoDashboard, demoInboxItems, demoUnreadCount } from '../demo-app-fixtures';

// 데모 홈 페이지 — 실제 HomeDashboard를 fixture로 구동. 내부 링크는 셸의 클릭 인터셉트가 처리.
// 래퍼·여백은 실제 BuyerHome(PageEnter + px-8 py-10)과 같게 맞춘다.
export function HomePageHost() {
  return (
    <PageEnter className="relative px-8 py-10">
      <HomeDashboard
        dashboard={demoDashboard}
        workspaceType="buyer"
        items={demoInboxItems}
        unreadCount={demoUnreadCount}
      />
    </PageEnter>
  );
}
