import type { WorkspaceType } from '@/lib/types/workspace';

export type AppOrigins = Record<WorkspaceType, string>;

/** Origins per workspace type, from env. In local/dev both default to the same host (routing disabled). */
export function appOrigins(): AppOrigins {
  const fallback = process.env.AUTH_URL ?? 'http://localhost:3000';
  return {
    buyer: process.env.NEXT_PUBLIC_BUYER_ORIGIN ?? fallback,
    pg: process.env.NEXT_PUBLIC_PARTNER_ORIGIN ?? fallback,
  };
}

/** Which workspace type a request host serves, or null if unknown / routing disabled. */
export function hostServes(host: string | null, origins: AppOrigins): WorkspaceType | null {
  if (!host) return null;
  let buyerHost: string;
  let partnerHost: string;
  try {
    buyerHost = new URL(origins.buyer).hostname.toLowerCase();
    partnerHost = new URL(origins.pg).hostname.toLowerCase();
  } catch {
    return null; // malformed origin → routing disabled, never throw (runs in the layout guard)
  }
  if (buyerHost === partnerHost) return null; // single-host (local/dev) → routing off
  const h = host.split(':')[0].toLowerCase();
  if (h === partnerHost) return 'pg';
  if (h === buyerHost) return 'buyer';
  return null;
}

/** Null = stay; string = absolute URL to redirect this request to. */
export function resolveHostRedirect(
  activeType: WorkspaceType,
  host: string | null,
  origins: AppOrigins,
): string | null {
  const serving = hostServes(host, origins);
  if (serving === null || serving === activeType) return null;
  // Cross-host mismatch lands on the other host's /home by design — the original
  // path is not preserved (mismatches are rare and home is a safe re-entry).
  return `${origins[activeType]}/home`;
}

/** Where a workspace switch lands: relative if same host, absolute if cross-host. Path defaults to /home. */
export function workspaceSwitchTarget(
  targetType: WorkspaceType,
  host: string | null,
  origins: AppOrigins,
  path: string = '/home',
): string {
  const serving = hostServes(host, origins);
  if (serving === null || serving === targetType) return path;
  return `${origins[targetType]}${path}`;
}

/**
 * Where `/login/ops` on this host should bounce to, or null to stay.
 *
 * The Google OAuth PKCE/state cookies are host-only (Auth.js defaults — only the
 * session cookie is domain-scoped), while the OAuth callback is pinned to the
 * buyer origin (`AUTH_URL`). Starting the flow on the partner host plants the
 * PKCE cookie there, the callback lands on the buyer host without it, and
 * Auth.js fails with `InvalidCheck` → `error=Configuration`. So the master
 * sign-in must always START on the buyer host.
 */
export function opsLoginRedirectTarget(host: string | null, origins: AppOrigins): string | null {
  return hostServes(host, origins) === 'pg' ? `${origins.buyer}/login/ops` : null;
}

/** Which signup entry path a request host should land on. Unknown host → buyer (mirrors the root landing in app/page.tsx). */
export function signupTargetForHost(
  host: string | null,
  origins: AppOrigins,
): '/signup/buyer' | '/signup/pg' {
  return hostServes(host, origins) === 'pg' ? '/signup/pg' : '/signup/buyer';
}
