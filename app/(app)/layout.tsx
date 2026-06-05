import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppSidebarLayout } from '@/components/shell/AppSidebarLayout';
import { ToasterProvider } from '@/components/shell/Toaster';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { GlobalShortcuts } from '@/components/shell/GlobalShortcuts';
import { SentryUserContext } from '@/components/observability/SentryUserContext';
import { ChannelTalkHideButton } from '@/components/shell/ChannelTalkHideButton';
import { auth } from '@/auth';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';
import { resolveShellAccess } from '@/lib/auth/shell-access';
import { setSentryUser } from '@/lib/observability/sentry-user';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Single auth() call at the shell layer. Child RSCs that need session re-call
  // auth() themselves (no prop drilling) — the underlying JWT cookie read is
  // cheap and React/Next dedupe identical fetches inside one render.
  const session = await auth();

  // Membership list — feeds the switcher AND re-validates membership (one DB
  // hit). Only fetched when the JWT carries a complete workspace claim; an
  // incomplete/unauth session never touches the DB (resolveShellAccess decides
  // the redirect from the empty list).
  const workspaces =
    session?.user?.id && session.user.workspaceId && session.user.workspaceType
      ? await (await getWorkspaceRepo()).listForUser(session.user.id)
      : [];

  // The redirect-loop contract (incomplete-but-authenticated → /logout, never
  // /login) lives in lib/auth/shell-access.ts and is enforced by its unit test.
  const decision = resolveShellAccess(session, workspaces);
  if (decision.kind === 'redirect') {
    redirect(decision.to);
  }
  const active = decision.active;
  // A 'render' decision guarantees a complete authenticated session (see
  // resolveShellAccess) — TS can't link the two, so narrow once here.
  const user = session!.user!;

  // Tag the server isolation scope for this request (RSC render errors). Minimal
  // fields only — see lib/observability/sentry-user. The client mirror below
  // covers client errors + on-error replays.
  const sentryUser = {
    id: user.id,
    workspaceId: active.id,
    workspaceType: active.type,
    role: user.role,
  };
  setSentryUser(sentryUser);

  return (
    <ToasterProvider>
      <ChannelTalkHideButton />
      <AppSidebarLayout
        sidebar={{
          user: {
            id: user.id,
            email: user.email,
            name: user.name ?? user.email,
          },
          workspaceType: active.type,
          workspaces,
          current: { id: active.id, name: active.name, type: active.type, hasLogo: active.hasLogo },
        }}
        header={{
          user: {
            name: user.name ?? user.email,
            email: user.email,
          },
          workspaceType: active.type,
        }}
        mainClassName="bg-[var(--shell-main-bg)] md:rounded-tl-xl md:border-l md:border-t md:border-[var(--md-sys-color-outline-variant)]"
      >
        {children}
      </AppSidebarLayout>
      <CommandPalette workspaceType={active.type} />
      <GlobalShortcuts />
      <SentryUserContext user={sentryUser} />
    </ToasterProvider>
  );
}
