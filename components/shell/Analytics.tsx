"use client";
import Script from 'next/script';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAnalyticsSession } from '@/components/landing/use-session-authed';
import { funnelAnalytics } from '@/lib/analytics/funnel';
import { useFunnelView } from '@/lib/analytics/use-funnel';
import { guestJourney, configureJourneyAnalytics } from '@/lib/guest-rfp/journey-client';
import { signupGuestDraftId } from '@/lib/guest-rfp/server-client';
import type { FunnelEvent, FunnelParams } from '@/lib/analytics/funnel';
export function Analytics({ gaId }: { gaId?: string }) {
  return <>
    {process.env.NEXT_PUBLIC_GUEST_RFP_SLACK_THREADS_ENABLED === 'true' && <GuestJourneyObserver gaId={gaId} />}
    {gaId && /^G-[A-Z0-9]+$/.test(gaId) && process.env.NODE_ENV === 'production' && <AnalyticsClient gaId={gaId} />}
  </>;
}
function GuestJourneyObserver({ gaId }: { gaId?: string }) {
  const { data } = useAnalyticsSession();
  const pathname = usePathname();
  useEffect(() => {
    configureJourneyAnalytics(gaId);
    const receive = (event: Event) => {
      const { name, params } = (event as CustomEvent<{ name: FunnelEvent; params: FunnelParams }>).detail;
      guestJourney.track(name, params);
    };
    const flush = () => { void guestJourney.flush(); };
    window.addEventListener('support-b:funnel', receive);
    window.addEventListener('pagehide', flush);
    const timer = setInterval(flush, 15000);
    // Re-read late SDKs and session changes without blocking action collection.
    const metadata = setInterval(() => guestJourney.capture(), 60000);
    guestJourney.capture();
    return () => {
      window.removeEventListener('support-b:funnel', receive);
      window.removeEventListener('pagehide', flush);
      clearInterval(timer); clearInterval(metadata);
    };
  }, [gaId]);
  useEffect(() => {
    if (data === undefined) return;
    const user = data?.user;
    const owner = user?.id && user.workspaceId && user.workspaceType === 'buyer' && !user.isMaster
      ? { userId: user.id, workspaceId: user.workspaceId } : null;
    guestJourney.identity(owner);
    guestJourney.capture();
  }, [data]);
  useEffect(() => {
    const user = data?.user;
    const owner = user?.id && user.workspaceId && user.workspaceType === 'buyer' && !user.isMaster
      ? { userId: user.id, workspaceId: user.workspaceId } : null;
    const draftId = signupGuestDraftId();
    if (owner && draftId && !guestJourney.selected() && ['/pending-approval', '/auth/verify'].includes(pathname))
      void guestJourney.bind(draftId, owner);
  }, [data, pathname]);
  return null;
}
function AnalyticsClient({ gaId }: {gaId: string}) {
  const {data} = useAnalyticsSession();
  const pathname = usePathname();
  const lastPage = useRef<string | null>(null);
  useEffect(() => {
    funnelAnalytics.configure(gaId, window.location.href, document.referrer);
    if (data !== undefined) funnelAnalytics.identify(data?.user ?? null);
    if (data !== undefined && lastPage.current !== pathname) {
      funnelAnalytics.pageView(window.location.href, lastPage.current ? '' : document.referrer);
      lastPage.current = pathname;
    }
  }, [gaId, data, pathname]);
  // A static landing remains static; session resolution is entirely client-side.
  useFunnelView('acquisition', pathname === '/' ? 'landing' : null);
  return <Script id="buyer-ga" src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />;
}
