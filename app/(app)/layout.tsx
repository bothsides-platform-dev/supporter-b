import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { Sidebar } from '@/components/shell/Sidebar';
import { Header } from '@/components/shell/Header';
import { ToasterProvider } from '@/components/shell/Toaster';
import { NotificationDrawer } from '@/components/shell/NotificationDrawer';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { GlobalShortcuts } from '@/components/shell/GlobalShortcuts';
import { SentryUserContext } from '@/components/observability/SentryUserContext';
import { auth } from '@/auth';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';
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
  if (!session?.user?.id || !session.user.workspaceId || !session.user.workspaceType) {
    redirect('/login');
  }

  // All workspaces the user belongs to — feeds the switcher and re-validates
  // membership (one DB hit, replacing the old name-only fetch). Empty = the
  // user belongs to nowhere (no member-removal/ws-delete action exists in v0,
  // so this is a defensive branch); bounce to re-auth.
  const workspaces = await (await getWorkspaceRepo()).listForUser(session.user.id);
  if (workspaces.length === 0) redirect('/login');
  // Active = the JWT's workspace if still a member, else fall back (render-only;
  // the token reconciles on the next explicit switch — an RSC can't set cookies).
  const active =
    workspaces.find((w) => w.id === session.user.workspaceId) ?? workspaces[0];

  // Tag the server isolation scope for this request (RSC render errors). Minimal
  // fields only — see lib/observability/sentry-user. The client mirror below
  // covers client errors + on-error replays.
  const sentryUser = {
    id: session.user.id,
    workspaceId: active.id,
    workspaceType: active.type,
    role: session.user.role,
  };
  setSentryUser(sentryUser);

  return (
    <ToasterProvider>
      <AppShell>
        <Sidebar
          user={{
            id: session.user.id,
            email: session.user.email,
            name: session.user.name ?? session.user.email,
          }}
          workspaceType={active.type}
          workspaces={workspaces}
          current={{ id: active.id, name: active.name, type: active.type }}
        />
        <div className="flex min-w-0 flex-1 flex-col bg-[var(--shell-chrome-bg)]">
          <Header
            user={{
              name: session.user.name ?? session.user.email,
              email: session.user.email,
            }}
            workspaceType={active.type}
            className="hidden md:flex"
          />
          <main className="min-w-0 flex-1 overflow-y-auto bg-[var(--shell-main-bg)] md:rounded-tl-xl md:border-l md:border-t md:border-[var(--md-sys-color-outline-variant)]">
            {children}
          </main>
        </div>
        <NotificationDrawer />
        <CommandPalette />
        <GlobalShortcuts />
        <SentryUserContext user={sentryUser} />
      </AppShell>
    </ToasterProvider>
  );
}
