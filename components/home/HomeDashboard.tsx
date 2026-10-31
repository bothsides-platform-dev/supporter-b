import Link from 'next/link';
import { InboxList } from '@/components/inbox/InboxList';
import { KpiStrip } from './KpiStrip';
import { ActionQueue } from './ActionQueue';
import { RecentMessagesPanel } from './RecentMessagesPanel';
import { HomeHeaderActionsRegistrar } from './HomeHeaderActionsRegistrar';
import { OpportunityList } from '@/components/opportunities/OpportunityList';
import { WelcomeModal } from '@/components/onboarding/WelcomeModal';
import { TutorialNudge } from '@/components/onboarding/TutorialNudge';
import { Button } from '@/components/primitives/Button';
import { EmptyState } from '@/components/primitives/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckIcon, PlusIcon } from '@/components/icons';
import type { Dashboard } from '@/lib/server/dashboard/buildDashboard';
import type { InboxListItem } from '@/lib/server/actions/chat/inboxLoader';
import { OPEN_BOARD_ENABLED } from '@/lib/features/open-board';
import { BuyerNextSteps } from './BuyerNextSteps';

const EMPTY_DESC: Record<'buyer' | 'pg', string> = {
  buyer: '새 견적이 오거나 마감이 다가오면 여기에 표시돼요.',
  pg: '구매사가 초대한 견적 요청이 여기에 표시돼요.',
};

/** 홈 미리보기에서 보여줄 오픈 RFP 최대 개수. 나머지는 /opportunities 전체 보기. */
const HOME_OPEN_RFP_PREVIEW = 5;

export function HomeDashboard({
  dashboard,
  workspaceType,
  items,
  unreadCount,
  welcomeState = 'none',
}: {
  dashboard: Dashboard;
  workspaceType: 'buyer' | 'pg';
  items: InboxListItem[];
  unreadCount: number;
  welcomeState?: 'welcome' | 'nudge' | 'none';
}) {
  return (
    <div className="flex flex-col gap-4">
      <HomeHeaderActionsRegistrar />
      {welcomeState === 'welcome' && <WelcomeModal variant={workspaceType} />}
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {workspaceType === 'buyer' && dashboard.buyerTasks ? <BuyerNextSteps
            dashboard={dashboard}
            hasRequests={dashboard.buyerTasks.hasRequests}
            showTutorial={welcomeState === 'nudge'}
          /> : <>
          <KpiStrip kpis={dashboard.kpis} />
          {/* 구매사가 새 견적을 만들 수 있도록 /rfp 헤더의 "견적 요청하기" CTA를
              재사용해 상시 노출. KPI strip(선정 완료) 바로 아래에 풀-width 큰
              버튼으로 강조한다. */}
          {workspaceType === 'buyer' && (
            <Link href="/rfp-create" className="block">
              <Button data-coachmark="demo-start" size="lg" fullWidth icon={<PlusIcon />}>견적 요청하기</Button>
            </Link>
          )}
          {welcomeState === 'nudge' && <TutorialNudge />}
          {workspaceType === 'pg' && dashboard.requests && dashboard.requests.length > 0 ? (
            <section>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="text-[17px] font-semibold">응답이 필요한 요청</h2>
                <Link href="/inbox?status=response" className="inline-flex min-h-11 items-center text-[14px] text-[var(--md-sys-color-primary)] sm:min-h-8">
                  응답 필요 <span className="md-numeric ml-1">{dashboard.requests.length}</span>건
                </Link>
                <Link href="/inbox?status=response" className="ml-auto inline-flex min-h-11 items-center text-[14px] text-[var(--md-sys-color-primary)] sm:min-h-8">전체 보기</Link>
              </div>
              <InboxList rows={[...dashboard.requests].sort((a, b) => Date.parse(a.rfpDeadline) - Date.parse(b.rfpDeadline)).slice(0, 5)} />
            </section>
          ) : dashboard.groups.length > 0 ? (
            <ActionQueue groups={dashboard.groups} />
          ) : (
            <EmptyState
              icon={<CheckIcon />}
              title="지금 처리할 일이 없습니다"
              description={EMPTY_DESC[workspaceType]}
            />
          )}
          {OPEN_BOARD_ENABLED &&
            workspaceType === 'pg' &&
            dashboard.openRfps != null &&
            dashboard.openRfps.length > 0 && (
              <section>
                <h2 className="mb-1.5 text-[13px] font-medium text-[var(--md-sys-color-on-surface-variant)]">
                  참여 가능한 견적
                </h2>
                <OpportunityList
                  items={dashboard.openRfps}
                  limit={HOME_OPEN_RFP_PREVIEW}
                  showAllHref="/opportunities"
                />
              </section>
            )}
          </>}
        </div>
        <div className="lg:w-[360px] lg:shrink-0">
          <RecentMessagesPanel items={items} unreadCount={unreadCount} />
        </div>
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
