import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { AppSidebarLayout } from '@/components/shell/AppSidebarLayout';
import { ToasterProvider } from '@/components/shell/Toaster';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { GlobalShortcuts } from '@/components/shell/GlobalShortcuts';
import { SentryUserContext } from '@/components/observability/SentryUserContext';
import { ChannelTalkHideButton } from '@/components/shell/ChannelTalkHideButton';
import { auth } from '@/auth';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';
import { resolveShellAccess } from '@/lib/auth/shell-access';
import { getDbSessionVersion } from '@/lib/auth/session-version-db';
import { setSentryUser } from '@/lib/observability/sentry-user';
import { appOrigins, resolveHostRedirect } from '@/lib/site-routing';

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
  // Master/operator sees ALL active workspaces (switcher); regular users see
  // only their memberships. isMaster is env-derived (MASTER_ACCOUNT_EMAILS).
  const workspaces =
    session?.user?.id && session.user.workspaceId && session.user.workspaceType
      ? session.user.isMaster
        ? await (await getWorkspaceRepo()).listAllWorkspacesForMaster()
        : await (await getWorkspaceRepo()).listForUser(session.user.id)
      : [];

  // Server-side revocation (C3): compare the JWT `sv` claim against
  // users.session_version. PK lookup, memoized per request (React cache) —
  // requireSession() in server actions shares the same cached read.
  const sessionVersions = session?.user?.id
    ? {
        token: session.user.sessionVersion,
        db: await getDbSessionVersion(session.user.id),
      }
    : undefined;

  // The redirect-loop contract (incomplete-but-authenticated → /logout, never
  // /login) lives in lib/auth/shell-access.ts and is enforced by its unit test.
  const decision = resolveShellAccess(session, workspaces, sessionVersions);
  if (decision.kind === 'redirect') {
    redirect(decision.to);
  }
  const active = decision.active;
  // Host routing: a PG-active session on supporter-b.com (or a buyer-active
  // session on partner.supporter-b.com) is bounced to its correct host. No-op on
  // unknown hosts and in local/dev (single host) — see lib/site-routing.
  const host = (await headers()).get('host');
  const hostRedirect = resolveHostRedirect(active.type, host, appOrigins());
  if (hostRedirect) {
    redirect(hostRedirect);
  }
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
          isMaster: user.isMaster ?? false,
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
