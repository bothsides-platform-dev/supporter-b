import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { IconSidebar } from '@/components/shell/IconSidebar';
import { Topbar } from '@/components/shell/Topbar';
import { ToasterProvider } from '@/components/shell/Toaster';
import { NotificationDrawer } from '@/components/shell/NotificationDrawer';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { GlobalShortcuts } from '@/components/shell/GlobalShortcuts';
import { SidebarProvider } from '@/components/ui/sidebar';
import { auth } from '@/auth';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';

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

  return (
    <ToasterProvider>
    <SidebarProvider
      style={{ '--sidebar-width': 'var(--shell-sidebar)', '--sidebar-width-icon': 'var(--shell-sidebar)' } as React.CSSProperties}
      className="contents"
    >
      <AppShell>
        <IconSidebar workspaceType={active.type} />
        <Topbar
          user={{
            id: session.user.id,
            email: session.user.email,
            name: session.user.name ?? session.user.email,
          }}
          workspaceType={active.type}
          workspaces={workspaces}
          current={{ id: active.id, name: active.name, type: active.type }}
        />
        <main style={{ gridArea: 'content' }} className="overflow-y-auto">
          {children}
        </main>
        <NotificationDrawer />
        <CommandPalette />
        <GlobalShortcuts />
      </AppShell>
    </SidebarProvider>
    </ToasterProvider>
  );
}
