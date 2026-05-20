/**
 * Storage primitives for file uploads.
 *
 * `Storage` is the contract every file route (`app/api/files/*`) and
 * action (`removeBidNoteAction`) uses to persist + retrieve attachment
 * payloads. The sole production backend is `PostgresStorage` — attachment
 * bytes live in the `attachment_blobs` table, so the whole stack runs on
 * one Postgres with no external object store. Tests inject `InMemoryStorage`
 * via `__setStorageForTest`.
 *
 * Because the bytes are shared in Postgres, this stays multi-instance safe —
 * there is no single-node disk backend.
 *
 * NOTE: `read` returns only `{ stream, size }` — mime is **not** sniffed
 * on read. The route layer uses the attachment row's stored `mime_type`
 * (magic-byte sniffed at upload time) for the `Content-Type` header.
 */
import { db } from '@/lib/db/client';
import { PostgresStorage } from './postgres';
import type { Storage } from './types';

export type { Storage };
export type { ReadRange } from './types';

declare global {

  var __bidit_storage__: Storage | undefined;
}

/**
 * Single-instance storage handle. Cached on `globalThis` so Next dev HMR
 * doesn't multiply backends, mirroring the repository factory. The backend
 * reads/writes through the shared postgres-js client (`@/lib/db/client`),
 * which connects lazily on first query.
 */
export function getStorage(): Storage {
  if (!globalThis.__bidit_storage__) {
    globalThis.__bidit_storage__ = new PostgresStorage(db);
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
