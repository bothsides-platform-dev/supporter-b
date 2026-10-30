'use client';

import { HomeDashboard } from '@/components/home/HomeDashboard';
import { PageEnter } from '@/components/primitives/PageEnter';
import { demoPgDashboard, demoPgInboxItems, demoPgUnread } from './pg-demo-fixtures';

// 데모 PG 홈 — 실제 HomeDashboard(workspaceType="pg")를 fixture로 구동. 내부 링크는 셸이 인터셉트.
// 래퍼·반응형 여백은 실제 PgHome과 같게 맞춘다.
export function PgHomePageHost() {
  return (
    <PageEnter className="relative px-4 py-6 sm:px-8 sm:py-10">
      <HomeDashboard
        dashboard={demoPgDashboard}
        workspaceType="pg"
        items={demoPgInboxItems}
        unreadCount={demoPgUnread}
      />
    </PageEnter>
  );
}
