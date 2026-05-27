'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signupEmailAction } from '@/lib/server/actions/auth';
import { readSignupDraft, writeSignupDraft } from '@/lib/auth/signup-storage';

type Props = {
  token: string;
  inviteEmail: string;
};

// Unauthenticated workspace-invite landing. Mirrors InviteUnauthClient for RFP
// invites: writes the workspace token to sessionStorage draft so biz/page.tsx
// can redirect back to the invite URL after signup completes.
export function WorkspaceInviteUnauthClient({ token, inviteEmail }: Props) {
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      const draft = readSignupDraft();
      writeSignupDraft({ ...draft, workspaceType: 'pg', wsInviteToken: token });

      const r = await signupEmailAction({ email: inviteEmail, workspaceType: 'pg' });

      const updated = readSignupDraft();
      if (r.ok) {
        writeSignupDraft({ ...updated, email: r.email });
        router.replace('/signup/pg/verify');
      } else if (r.error === 'EMAIL_TAKEN') {
        // Existing user — send them to login with a next= redirect back to the invite
        router.replace(`/login?next=${encodeURIComponent(`/invite/workspace/${token}`)}`);
      } else {
        // Other error (rate limit, etc.) — fall back to manual email entry
        router.replace('/signup/pg');
      }
    })();
  }, [token, inviteEmail, router]);

  return (
    <div className="py-8 text-center">
      <p className="font-mono text-[12px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        LOADING…
      </p>
      <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
        초대 링크를 확인하는 중입니다.
      </p>
    </div>
  );
}
