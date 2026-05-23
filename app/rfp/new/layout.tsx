import { auth } from '@/auth';
import { AppSidebarLayout } from '@/components/shell/AppSidebarLayout';
import { ToasterProvider } from '@/components/shell/Toaster';
import { NotificationDrawer } from '@/components/shell/NotificationDrawer';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { GlobalShortcuts } from '@/components/shell/GlobalShortcuts';
import { GuestHeader } from '@/components/shell/GuestHeader';
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
      <AppSidebarLayout
        sidebar={{
          user: {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name ?? session.user.email,
          },
          workspaceType: active.type,
          workspaces,
          current: { id: active.id, name: active.name, type: active.type },
        }}
      >
        {children}
      </AppSidebarLayout>
      <NotificationDrawer />
      <CommandPalette />
      <GlobalShortcuts />
    </ToasterProvider>
  );
}
