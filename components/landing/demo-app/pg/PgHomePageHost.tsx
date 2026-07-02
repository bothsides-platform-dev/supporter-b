'use client';

import { HomeDashboard } from '@/components/home/HomeDashboard';
import { demoPgDashboard, demoPgInboxItems, demoPgUnread } from './pg-demo-fixtures';

// 데모 PG 홈 — 실제 HomeDashboard(workspaceType="pg")를 fixture로 구동. 내부 링크는 셸이 인터셉트.
export function PgHomePageHost() {
  return (
    <div className="relative px-6 py-6">
      <HomeDashboard
        dashboard={demoPgDashboard}
        workspaceType="pg"
        items={demoPgInboxItems}
        unreadCount={demoPgUnread}
      />
    </div>
  );
}
