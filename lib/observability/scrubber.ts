// Sentry `beforeSend` scrubber — masks sensitive values before events leave the
// process. This is a PG platform (사업자번호·정산·계좌·카드수수료) shipping to the
// US region, so known-sensitive keys must never reach Sentry.
//
// PURE module: no `@sentry/nextjs` / server-only imports. The three init files
// (server/edge/client) import this, and they load before the app — keep it light.
//
// LEAK SURFACE (deliberate): message strings and exception/stack values are NOT
// masked (masking them mangles stack traces and grouping). Callers MUST NOT
// concat sensitive values into Error messages, e.g. avoid
// `throw new Error('lookup failed for bizNo ' + bizNo)`.

const FILTERED = '[Filtered]';

// Exact key match (case-insensitive). Lower-cased here.
const KEYWORD_KEYS = new Set([
  'bizno',
  '사업자번호',
  'accountno',
  '계좌',
  'cardfees',
  '카드수수료',
]);

// Substring match (case-insensitive).
const SUBSTRING_KEYS = ['token', 'secret', 'authorization'];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (KEYWORD_KEYS.has(lower)) return true;
  return SUBSTRING_KEYS.some((needle) => lower.includes(needle));
}

function deepScrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepScrub);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? FILTERED : deepScrub(val);
    }
    return out;
  }
  return value;
}

const SCRUB_FIELDS = ['request', 'extra', 'contexts', 'tags', 'user'] as const;

// `E extends object` (not `Record<string, any>`) so this is directly assignable
// to Sentry's `beforeSend` — `ErrorEvent` is an interface without an index
// signature. We cast internally to traverse dynamic fields.
export function scrubEvent<E extends object>(event: E): E {
  const bag = event as Record<string, unknown>;
  for (const field of SCRUB_FIELDS) {
    if (bag[field]) bag[field] = deepScrub(bag[field]);
  }
  const breadcrumbs = bag.breadcrumbs;
  if (Array.isArray(breadcrumbs)) {
    for (const crumb of breadcrumbs as Array<{ data?: unknown }>) {
      if (crumb?.data) crumb.data = deepScrub(crumb.data);
    }
  }
  return event;
}
