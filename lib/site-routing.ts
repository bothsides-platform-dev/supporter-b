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
  const buyerHost = new URL(origins.buyer).hostname.toLowerCase();
  const partnerHost = new URL(origins.pg).hostname.toLowerCase();
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
  return `${origins[activeType]}/home`;
}

/** Where a workspace switch lands: relative if same host, absolute if cross-host. */
export function workspaceSwitchTarget(
  targetType: WorkspaceType,
  host: string | null,
  origins: AppOrigins,
): string {
  const serving = hostServes(host, origins);
  if (serving === null || serving === targetType) return '/home';
  return `${origins[targetType]}/home`;
}
