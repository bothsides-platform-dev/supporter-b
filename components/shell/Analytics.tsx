"use client";
import Script from 'next/script';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAnalyticsSession } from '@/components/landing/use-session-authed';
import { funnelAnalytics } from '@/lib/analytics/funnel';
import { useFunnelView } from '@/lib/analytics/use-funnel';
export function Analytics({ gaId }: { gaId?: string }) {
  if (!gaId || !/^G-[A-Z0-9]+$/.test(gaId) || process.env.NODE_ENV !== 'production') return null;
  return <AnalyticsClient gaId={gaId} />;
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
