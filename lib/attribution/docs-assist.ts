import { DOCS_PARAMS, DOCS_PLACEMENTS, safeDocsPath, safeSource, safeMedium, type DocsFields } from './docs-contract';

const KEY = 'support-b:docs-assist:v1';
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
type Visit = { version: 1; arrivedAt: number; path: string; placement: string; source: string; medium: string };
type StorageAccess = () => Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem'>>;

function fields(visit: Visit | null): DocsFields {
  return {
    docs_assisted: visit ? 'true' : 'false', docs_path: visit?.path ?? 'unknown',
    docs_placement: visit?.placement ?? 'unknown', docs_source: visit?.source ?? 'unknown', docs_medium: visit?.medium ?? 'unknown',
  };
}

export function createDocsAssist(storage: StorageAccess) {
  let memory: Visit | null = null;
  let writeFailed = false;
  let consumedLocation = '';
  function valid(value: unknown): Visit | null {
    if (!value || typeof value !== 'object') return null;
    const v = value as Partial<Visit>;
    if (v.version !== 1 || typeof v.arrivedAt !== 'number' || !Number.isFinite(v.arrivedAt) || v.arrivedAt > Date.now() || Date.now() - v.arrivedAt >= WINDOW_MS ||
      typeof v.path !== 'string' || !(DOCS_PLACEMENTS as readonly unknown[]).includes(v.placement)) return null;
    return { version: 1, arrivedAt: v.arrivedAt, path: safeDocsPath(v.path), placement: v.placement!, source: safeSource(v.source), medium: safeMedium(v.medium) };
  }
  return {
    receive(location: string): { location: string; fields: DocsFields | null } {
      let url: URL;
      try { url = new URL(location); } catch { return { location, fields: null }; }
      const params = new URLSearchParams(url.search);
      const hasProtocol = DOCS_PARAMS.some(key => params.has(key));
      if (!hasProtocol) return { location, fields: null };
      for (const key of DOCS_PARAMS) url.searchParams.delete(key);
      const cleaned = url.href;
      const path = params.get('sb_docs_path');
      const placement = params.get('sb_docs_placement');
      if (location === consumedLocation || url.origin !== 'https://support-b.com' || url.username || url.password ||
        params.get('sb_via') !== 'docs' || DOCS_PARAMS.some(key => params.getAll(key).length > 1) ||
        !path?.startsWith('/') || !(DOCS_PLACEMENTS as readonly unknown[]).includes(placement)) return { location: cleaned, fields: null };
      consumedLocation = location;
      memory = { version: 1, arrivedAt: Date.now(), path: safeDocsPath(path), placement: placement!, source: safeSource(params.get('sb_docs_source')), medium: safeMedium(params.get('sb_docs_medium')) };
      try { storage().setItem(KEY, JSON.stringify(memory)); writeFailed = false; } catch { writeFailed = true; }
      return { location: cleaned, fields: fields(memory) };
    },
    fields(): DocsFields {
      let visit = valid(memory);
      try {
        const raw = storage().getItem(KEY);
        const saved = raw ? valid(JSON.parse(raw)) : null;
        if (!writeFailed || (saved && (!visit || saved.arrivedAt >= visit.arrivedAt))) visit = saved;
        if (raw && !saved) storage().removeItem?.(KEY);
        memory = visit;
      } catch { /* Unavailable storage: use only the current page's unexpired capture. */ }
      return fields(visit);
    },
  };
}
