/**
 * Storage primitives for file uploads.
 *
 * `Storage` is the contract every file route (`app/api/files/*`) and
 * action (`removeBidNoteAction`) uses to persist + retrieve attachment
 * payloads. The only backend is `R2Storage` — attachment bytes live in a
 * Cloudflare R2 bucket, addressed via the S3-compatible API
 * (`@aws-sdk/client-s3`). Bytes are served back through the app (routes
 * stream them to the client), not via a signed R2 URL, so sealed-bid ACL
 * enforcement never leaves the route layer.
 *
 * There is deliberately no fallback backend, in any environment: if the
 * R2 env vars are incomplete, `getStorage()` throws — production and
 * local dev both require real R2 configuration. Unit tests never hit
 * `buildStorage()` at all; they inject `InMemoryStorage` (a pure test
 * double, see `./memory`) via `__setStorageForTest`. The e2e PDF spec
 * that needs real cross-process attachment bytes self-skips when R2 env
 * is absent (see `e2e/bid-detail-pdf-preview.spec.ts`).
 *
 * NOTE: `read` returns only `{ stream, size }` — mime is **not** sniffed
 * on read. The route layer uses the attachment row's stored `mime_type`
 * (magic-byte sniffed at upload time) for the `Content-Type` header.
 */
import { defineSingleton } from '@/lib/server/_singleton';
import { S3Client } from '@aws-sdk/client-s3';
import { R2Storage } from './r2';
import type { Storage } from './types';

export type { Storage };
export type { ReadRange } from './types';

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

  const missing = [
    !accountId && 'R2_ACCOUNT_ID',
    !accessKeyId && 'R2_ACCESS_KEY_ID',
    !secretAccessKey && 'R2_SECRET_ACCESS_KEY',
    !bucket && 'R2_BUCKET',
  ].filter(Boolean);
  throw new Error(
    `getStorage(): missing R2 configuration: ${missing.join(', ')} — set the four R2_* vars in .env (see docs/DEPLOY_LIGHTSAIL.md); tests inject a mock via __setStorageForTest`,
  );
}

/**
 * Single-instance storage handle — cached on globalThis (via the shared
 * singleton registry) so Next dev HMR doesn't multiply backends. Tests swap in
 * `InMemoryStorage` (see `./memory`) with __setStorageForTest and pair it with
 * __resetStorageForTest.
 */
export const { get: getStorage, set: __setStorageForTest, reset: __resetStorageForTest } =
  defineSingleton<Storage>('storage', 'infra', buildStorage);
