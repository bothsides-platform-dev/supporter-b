import Link from 'next/link';
import { FileText, Plus } from 'lucide-react';
import { ActionQueue } from './ActionQueue';
import { KpiStrip } from './KpiStrip';
import { TutorialNudge } from '@/components/onboarding/TutorialNudge';
import type { Dashboard } from '@/lib/server/dashboard/buildDashboard';

export function BuyerNextSteps({ dashboard, hasRequests, showTutorial }: {
  dashboard: Dashboard;
  hasRequests: boolean;
  showTutorial: boolean;
}) {
  const createLink = (first: boolean) => <Link
    href="/rfp-create"
    data-coachmark="demo-start"
    className={`inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-[var(--md-sys-shape-small)] px-4 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-h-9 ${first ? 'bg-primary text-primary-foreground hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-primary)_10%,var(--md-sys-color-primary))]' : 'border border-[var(--md-sys-color-outline-variant)] text-primary hover:bg-[var(--md-sys-color-surface-container)]'}`}
  ><Plus aria-hidden size={16} />{first ? '첫 견적 요청하기' : '새 견적 요청하기'}</Link>;

  return <>
    {!hasRequests ? <section className="space-y-4 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] p-5">
      <FileText aria-hidden className="size-6 text-primary" strokeWidth={1.5} />
      <h1 className="text-[20px] font-semibold">첫 견적을 요청해볼까요?</h1>
      <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">사업과 결제 조건을 알려주시면 업종에 맞는 PG사에 상담을 요청할 수 있어요.</p>
      {createLink(true)}
    </section> : <section aria-label="이어서 진행해요" className="space-y-5">
      <h1 className="text-[20px] font-semibold">이어서 진행해요</h1>
      {dashboard.groups.length > 0 ? <ActionQueue groups={dashboard.groups} showActions /> : <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">지금 이어서 할 일이 없어요. 새 견적이나 필요한 일이 생기면 여기에 알려드려요.</p>}
    </section>}
    {hasRequests && createLink(false)}
    <section className="space-y-3" aria-label="진행 현황">
      <h2 className="md-label-medium text-[var(--md-sys-color-on-surface-variant)]">진행 현황</h2>
      <KpiStrip kpis={dashboard.kpis} />
    </section>
    {showTutorial && <TutorialNudge />}
  </>;
}
