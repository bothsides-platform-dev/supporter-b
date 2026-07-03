import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { masterOAuthEnabled } from '@/lib/auth/master-allowlist';
import { appOrigins, opsLoginRedirectTarget } from '@/lib/site-routing';
import { OpsGoogleLogin } from '@/components/auth/OpsGoogleLogin';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Hidden operator sign-in route (`/login/ops`) — not linked anywhere; reached by
 * typing the URL. 404s when the master-OAuth kill switch is off. The hidden URL
 * is UX only; the real boundary is the MASTER_ACCOUNT_EMAILS default-deny in the
 * Google `signIn` callback.
 *
 * On the partner host this bounces to the buyer origin first — the OAuth
 * PKCE/state cookies are host-only while the callback is pinned to the buyer
 * host, so a flow started on partner would fail with `error=Configuration`
 * (see opsLoginRedirectTarget).
 */
export default async function OpsLoginPage() {
  if (!masterOAuthEnabled()) notFound();
  const host = (await headers()).get('host');
  const target = opsLoginRedirectTarget(host, appOrigins());
  if (target) redirect(target);
  return <OpsGoogleLogin />;
}
