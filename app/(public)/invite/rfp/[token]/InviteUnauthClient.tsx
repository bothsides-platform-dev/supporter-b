'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signupEmailAction } from '@/lib/server/actions/auth';
import { readSignupDraft, writeSignupDraft } from '@/lib/auth/signup-storage';

type Props = {
  token: string;
  inviteEmail?: string;
};

export function InviteUnauthClient({ token, inviteEmail }: Props) {
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      const draft = readSignupDraft();
      // Always write workspaceType + inviteToken before routing
      writeSignupDraft({ ...draft, workspaceType: 'pg', inviteToken: token });

      if (!inviteEmail) {
        // Token invalid/expired — go to Gs1 so user can enter email manually
        router.replace('/signup/pg');
        return;
      }

      // Send verification email and skip Gs1
      const r = await signupEmailAction({
        email: inviteEmail,
        workspaceType: 'pg',
        inviteToken: token,
      });
      const updatedDraft = readSignupDraft();
      if (r.ok) {
        writeSignupDraft({ ...updatedDraft, email: r.email });
        router.replace('/signup/pg/verify');
      } else {
        // Fallback to Gs1 on error
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
