'use client';

import { useEffect } from 'react';

import { setSentryUser, type SentryUserContext as SentryUser } from '@/lib/observability/sentry-user';

// Mirrors the server-side setUser (app/(app)/layout.tsx) onto the client scope so
// client errors + on-error replays carry the same user/workspace context.
// Renders nothing.
export function SentryUserContext({ user }: { user: SentryUser }) {
  useEffect(() => {
    setSentryUser(user);
  }, [user.id, user.workspaceId, user.workspaceType, user.role]);

  return null;
}
