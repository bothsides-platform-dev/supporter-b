import type { WorkspaceType } from '@/lib/types/workspace';

export function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.AUTH_URL ??
    'http://localhost:3000'
  );
}

/** Absolute origin for the admin console (admin.supporter-b.com). */
export function adminBaseUrl(): string {
  return process.env.ADMIN_ORIGIN ?? baseUrl();
}

/** Absolute origin for links shown to a given workspace type (partner subdomain for pg). */
export function baseUrlFor(type: WorkspaceType): string {
  const origin =
    type === 'pg'
      ? process.env.NEXT_PUBLIC_PARTNER_ORIGIN
      : process.env.NEXT_PUBLIC_BUYER_ORIGIN;
  return origin ?? baseUrl();
}
