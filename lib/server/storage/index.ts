/**
 * Storage primitives for file uploads.
 *
 * `Storage` is the contract every file route (`app/api/files/*`) and
 * action (`removeBidNoteAction`) uses to persist + retrieve attachment
 * payloads. The production backend is `R2Storage` — attachment bytes live
 * in a Cloudflare R2 bucket, addressed via the S3-compatible API
 * (`@aws-sdk/client-s3`). Bytes are served back through the app (routes
 * stream them to the client), not via a signed R2 URL, so sealed-bid ACL
 * enforcement never leaves the route layer.
 *
 * When the R2 env vars are incomplete, dev/test fall back to
 * `InMemoryStorage` (ephemeral, process-local) so local work doesn't need
 * a live bucket. Production fails fast instead: an incomplete R2
 * configuration throws at `getStorage()` call time rather than silently
 * running on ephemeral storage. Tests inject `InMemoryStorage` (or any
 * fake) via `__setStorageForTest`.
 *
 * NOTE: `read` returns only `{ stream, size }` — mime is **not** sniffed
 * on read. The route layer uses the attachment row's stored `mime_type`
 * (magic-byte sniffed at upload time) for the `Content-Type` header.
 */
import { S3Client } from '@aws-sdk/client-s3';
import { InMemoryStorage } from './memory';
import { R2Storage } from './r2';
import type { Storage } from './types';

export type { Storage };
export type { ReadRange } from './types';

declare global {
  var __bidit_storage__: Storage | undefined;
}

let warnedEphemeral = false;

function buildStorage(): Storage {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;

  if (accountId && accessKeyId && secretAccessKey && bucket) {
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    return new R2Storage(client, bucket);
  }

  if (process.env.NODE_ENV === 'production') {
    const missing = [
      !accountId && 'R2_ACCOUNT_ID',
      !accessKeyId && 'R2_ACCESS_KEY_ID',
      !secretAccessKey && 'R2_SECRET_ACCESS_KEY',
      !bucket && 'R2_BUCKET',
    ].filter(Boolean);
    throw new Error(
      `getStorage(): missing R2 configuration in production: ${missing.join(', ')}`,
    );
  }

  if (!warnedEphemeral) {
    warnedEphemeral = true;
    console.warn(
      'getStorage(): R2 env incomplete — falling back to InMemoryStorage (ephemeral, dev/test only)',
    );
  }
  return new InMemoryStorage();
}

/**
 * Single-instance storage handle. Cached on `globalThis` so Next dev HMR
 * doesn't multiply backends, mirroring the repository factory.
 */
export function getStorage(): Storage {
  if (!globalThis.__bidit_storage__) {
    globalThis.__bidit_storage__ = buildStorage();
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
