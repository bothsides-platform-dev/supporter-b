import { KpiStrip } from './KpiStrip';
import { ActionQueue } from './ActionQueue';
import { OnboardingActionList } from './OnboardingActionList';
import { ChatPanelPlaceholder } from './ChatPanelPlaceholder';
import { OpportunityList } from '@/components/opportunities/OpportunityList';
import { EmptyState } from '@/components/primitives/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckIcon } from '@/components/icons';
import type { Dashboard } from '@/lib/server/dashboard/buildDashboard';

const EMPTY_DESC: Record<'buyer' | 'pg', string> = {
  buyer: '새 응답이 오거나 마감이 다가오면 여기에 표시됩니다.',
  pg: '구매사가 초대한 RFP가 여기에 표시됩니다.',
};

/** 홈 미리보기에서 보여줄 오픈 RFP 최대 개수. 나머지는 /opportunities 전체 보기. */
const HOME_OPEN_RFP_PREVIEW = 5;

export function HomeDashboard({
  dashboard,
  workspaceType,
}: {
  dashboard: Dashboard;
  workspaceType: 'buyer' | 'pg';
}) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <KpiStrip kpis={dashboard.kpis} />
        {dashboard.groups.length > 0 ? (
          <ActionQueue groups={dashboard.groups} />
        ) : dashboard.onboardingActions ? (
          <OnboardingActionList actions={dashboard.onboardingActions} />
        ) : (
          <EmptyState
            icon={<CheckIcon />}
            title="지금 처리할 일이 없습니다"
            description={EMPTY_DESC[workspaceType]}
          />
        )}
        {workspaceType === 'pg' &&
          dashboard.openRfps != null &&
          dashboard.openRfps.length > 0 && (
            <section>
              <h2 className="mb-1.5 text-[13px] font-medium text-[var(--md-sys-color-on-surface-variant)]">
                탐색 가능한 RFP
              </h2>
              <OpportunityList
                items={dashboard.openRfps}
                limit={HOME_OPEN_RFP_PREVIEW}
                showAllHref="/opportunities"
              />
            </section>
          )}
      </div>
      <div className="lg:w-[360px] lg:shrink-0">
        <ChatPanelPlaceholder />
      </div>
    </div>
  );
}

// Named export (not a static on a 'use client' component) so a Server Component
// Suspense fallback can render it across the RSC boundary.
export function HomeDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[68px] rounded-[var(--md-sys-shape-medium)]" />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>
      <Skeleton className="h-[320px] rounded-[var(--md-sys-shape-medium)] lg:w-[360px] lg:shrink-0" />
    </div>
  );
}
