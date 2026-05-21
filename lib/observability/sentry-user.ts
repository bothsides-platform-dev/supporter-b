import * as Sentry from '@sentry/nextjs';

// Attaches the current user + workspace as Sentry context. Used in BOTH runtimes
// (server: app/(app)/layout.tsx; client: components/observability/SentryUserContext).
//
// MINIMAL by design: only the user `id` reaches Sentry.setUser — never email/name,
// even though `sendDefaultPii` is on. Workspace/role go on tags for filtering.

export interface SentryUserContext {
  id: string;
  email?: string | null;
  name?: string | null;
  workspaceId?: string | null;
  workspaceType?: string | null;
  role?: string | null;
}

export function setSentryUser(user: SentryUserContext | null | undefined): void {
  if (!user) {
    Sentry.setUser(null);
    return;
  }

  Sentry.setUser({ id: user.id });
  if (user.workspaceId) Sentry.setTag('workspace_id', user.workspaceId);
  if (user.workspaceType) Sentry.setTag('workspace_type', user.workspaceType);
  if (user.role) Sentry.setTag('role', user.role);
}
