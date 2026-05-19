/**
 * Storage primitives for file uploads.
 *
 * `Storage` is the contract every file route (`app/api/files/*`) and
 * action (`removeBidNoteAction`) uses to persist + retrieve attachment
 * payloads. The sole production backend is `SupabaseStorage`; tests
 * inject `InMemoryStorage` via `__setStorageForTest`. There is no
 * single-node disk backend — multi-instance deployments are the only
 * supported shape.
 *
 * NOTE: `read` returns only `{ stream, size }` — mime is **not** sniffed
 * on read. The route layer uses the attachment row's stored `mime_type`
 * (magic-byte sniffed at upload time) for the `Content-Type` header.
 */
import { SupabaseStorage } from './supabase';
import type { Storage } from './types';

export type { Storage };
export type { ReadRange } from './types';

declare global {

  var __bidit_storage__: Storage | undefined;
}

/**
 * Single-instance storage handle. Cached on `globalThis` so Next dev HMR
 * doesn't multiply Supabase clients, mirroring the repository factory.
 * `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are read by the backend's
 * `createClient` call; missing values throw at first use, not import.
 */
export function getStorage(): Storage {
  if (!globalThis.__bidit_storage__) {
    globalThis.__bidit_storage__ = new SupabaseStorage();
  }
  return globalThis.__bidit_storage__;
}

/**
 * For tests only — swap the storage implementation (`InMemoryStorage`
 * from `./memory`) before calling routes. Pair with
 * `__resetStorageForTest`.
 */
export function __setStorageForTest(s: Storage | undefined): void {
  globalThis.__bidit_storage__ = s;
}

export function __resetStorageForTest(): void {
  globalThis.__bidit_storage__ = undefined;
}
