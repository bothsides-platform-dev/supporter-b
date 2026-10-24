"use client";

import { trackFunnel, flushFunnel } from '@/lib/analytics/funnel';
import { guestResumeTarget } from '@/lib/guest-rfp/draft';

export async function continueAfterEmailVerification(reauthenticate = false, handoff = false, serverNext?: string) {
  trackFunnel('funnel_step_complete', { funnel_id: 'signup', step_id: 'email_verification' });
  await flushFunnel();
  if (!reauthenticate && handoff && await handoffEmailVerification()) return true;
  const next = serverNext ?? guestResumeTarget();
  // A full navigation lets the server enforce approval and cross-host routing.
  // Only a failed cookie replacement requires clearing the old session.
  window.location.assign(reauthenticate ? `/logout?next=${encodeURIComponent(next)}` : next);
  return false;
}

export const EMAIL_VERIFICATION_CHANNEL = 'support-b-email-verification';

// Wait briefly for an open signup tab to confirm with the server. Messages
// contain no token or account details and confer no authentication authority.
function handoffEmailVerification(): Promise<boolean> {
  if (typeof BroadcastChannel === 'undefined') return Promise.resolve(false);
  return new Promise(resolve => {
    let channel: BroadcastChannel | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (handled: boolean) => {
      clearTimeout(timer);
      channel?.close();
      resolve(handled);
    };
    try {
      channel = new BroadcastChannel(EMAIL_VERIFICATION_CHANNEL);
      const requestId = crypto.randomUUID();
      channel.onmessage = ({ data }) => {
        if (data?.type === 'continued' && data.requestId === requestId) finish(true);
      };
      timer = setTimeout(() => finish(false), 600);
      channel.postMessage({ type: 'verified', requestId });
    } catch { finish(false); }
  });
}
