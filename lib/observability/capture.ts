import * as Sentry from '@sentry/nextjs';

import type { SentryUserContext } from './sentry-user';

// Explicitly capture an UNEXPECTED server-action exception. Server actions return
// `{ ok:false, error:'CODE' }` for expected business outcomes (those must NOT be
// captured — that's how you burn the free-plan 5k errors/mo). The CALLER decides
// what counts as unexpected; this helper just enriches + forwards.
//
// `setSentryUser` in the layout does not reach server-action request scopes, so
// pass the session user here to attach user/workspace context inline.
export function captureActionError(
  action: string,
  err: unknown,
  sessionUser?: SentryUserContext | null,
  extra?: Record<string, unknown>,
): void {
  try {
    const tags: Record<string, string> = { action };
    if (sessionUser?.workspaceId) tags.workspace_id = sessionUser.workspaceId;
    if (sessionUser?.workspaceType) tags.workspace_type = sessionUser.workspaceType;
    if (sessionUser?.role) tags.role = sessionUser.role;

    Sentry.captureException(err, {
      tags,
      ...(sessionUser ? { user: { id: sessionUser.id } } : {}),
      ...(extra ? { extra } : {}),
    });
  } catch {
    // Telemetry must never break the action it instruments.
  }
}
