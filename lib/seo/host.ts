import type { WorkspaceType } from '@/lib/types/workspace';
import { hostServes, type AppOrigins } from '@/lib/site-routing';

export interface SeoHostContext {
  /** Which audience this host serves. Unknown / single-host → buyer. */
  type: WorkspaceType;
  /** Absolute origin for this host, used to build canonical URLs. */
  origin: string;
}

/**
 * Resolve the SEO context for a request host. Reuses {@link hostServes} (the
 * buyer/pg SSOT) and falls back to buyer for unknown hosts / single-host dev —
 * mirroring the root landing default in app/page.tsx.
 */
export function seoHostContext(host: string | null, origins: AppOrigins): SeoHostContext {
  const type: WorkspaceType = hostServes(host, origins) ?? 'buyer';
  return { type, origin: origins[type] };
}
