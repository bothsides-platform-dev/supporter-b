import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { masterOAuthEnabled } from '@/lib/auth/master-allowlist';
import { OpsGoogleLogin } from '@/components/auth/OpsGoogleLogin';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Hidden operator sign-in route (`/login/ops`) — not linked anywhere; reached by
 * typing the URL. 404s when the master-OAuth kill switch is off. The hidden URL
 * is UX only; the real boundary is the MASTER_ACCOUNT_EMAILS default-deny in the
 * Google `signIn` callback.
 */
export default function OpsLoginPage() {
  if (!masterOAuthEnabled()) notFound();
  return <OpsGoogleLogin />;
}
