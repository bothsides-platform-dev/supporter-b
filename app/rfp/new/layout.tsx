import { auth } from '@/auth';
import { AppShell } from '@/components/shell/AppShell';
import { IconSidebar } from '@/components/shell/IconSidebar';
import { Topbar } from '@/components/shell/Topbar';
import { ToasterProvider } from '@/components/shell/Toaster';
import { NotificationDrawer } from '@/components/shell/NotificationDrawer';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { GlobalShortcuts } from '@/components/shell/GlobalShortcuts';
import { GuestHeader } from '@/components/shell/GuestHeader';
import { SidebarProvider } from '@/components/ui/sidebar';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';

export const dynamic = 'force-dynamic';

export default async function RfpNewLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user?.id || !session.user.workspaceId || !session.user.workspaceType) {
    return (
      <div className="min-h-screen flex flex-col bg-[var(--md-sys-color-background)]">
        <GuestHeader />
        <main className="flex-1">{children}</main>
      </div>
    );
  }

  const workspaces = await (await getWorkspaceRepo()).listForUser(session.user.id);
  if (workspaces.length === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-[var(--md-sys-color-background)]">
        <GuestHeader />
        <main className="flex-1">{children}</main>
      </div>
    );
  }
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
