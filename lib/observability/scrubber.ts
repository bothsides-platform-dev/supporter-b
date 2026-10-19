// Sentry `beforeSend` scrubber — masks sensitive values before events leave the
// process. This is a PG platform (사업자번호·정산·계좌·카드수수료) shipping to the
// US region, so known-sensitive keys must never reach Sentry.
//
// No `@sentry/nextjs` / server-only imports. Only the core normalization utility.
// The three init files
// (server/edge/client) import this, and they load before the app — keep it light.
//
// Message/stack strings remain intact except for known credential-bearing Slack
// webhook URLs. Arbitrary free-text PII is not detected. Callers MUST NOT
// concat sensitive values into Error messages, e.g. avoid
// `throw new Error('lookup failed for bizNo ' + bizNo)`.

import { normalize } from '@sentry/core';

const FILTERED = '[Filtered]';
// Whole-event depth: the SDK's default event-data depth (3) would truncate
// exception.values[].stacktrace.frames[]. Keep normal stacks, bound raw inputs
// from beforeBreadcrumb (which runs before Sentry's event normalization).
const NORMALIZE_DEPTH = 20;
const NORMALIZE_MAX_BREADTH = 1000;

// Exact key match (case-insensitive). Lower-cased here.
const KEYWORD_KEYS = new Set([
  'to',
  'email',
  'subject',
  'dedupekey',
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

export function deepScrub(value: unknown): unknown {
  return maskNormalized(normalize(value, NORMALIZE_DEPTH, NORMALIZE_MAX_BREADTH));
}

function maskNormalized(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/https:\/\/hooks\.slack\.com\/services\/[^\s\"'<>]+/gi, FILTERED);
  if (Array.isArray(value)) return value.map(maskNormalized);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? FILTERED : maskNormalized(val);
    }
    return out;
  }
  return value;
}

// `E extends object` (not `Record<string, any>`) so this is directly assignable
// to Sentry's `beforeSend` — `ErrorEvent` is an interface without an index
// signature. We cast internally to traverse dynamic fields.
export function scrubEvent<E extends object>(event: E): E {
  const bag = event as Record<string, unknown>;
  const scrubbed = deepScrub(bag);
  // Preserve event identity without retaining fields/toJSON discarded by the
  // normalizer. Merging alone could leave original, unsanitized values behind.
  for (const key of Object.keys(bag)) delete bag[key];
  Object.assign(bag, scrubbed);
  return event;
}
