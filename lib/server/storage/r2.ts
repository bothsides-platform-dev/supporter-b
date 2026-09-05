/**
 * R2Storage — Cloudflare R2 (S3-compatible) backed Storage. Attachment bytes
 * live in an R2 bucket instead of Postgres bytea; the storage `key` is the
 * attachment id, namespaced under the `attachments/<id>` object-key prefix
 * so the bucket can host other object families later without collisions.
 *
 * Files are still served through the app (routes stream the bytes back to
 * the client) rather than via a signed R2 URL — sealed-bid ACL is enforced
 * per-request at the route layer, and a signed URL would bypass that check.
 * This backend only changes where the bytes live, not who is allowed to
 * read them.
 *
 * The constructor takes a minimal `S3ClientLike` (just `.send()`) instead of
 * the concrete `S3Client` type so tests can inject `{ send: vi.fn() }`
 * without constructing a real client.
 */
import { Readable } from 'node:stream';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { S3Client } from '@aws-sdk/client-s3';
import type {
  PresignGetOptions,
  PresignPutOptions,
  ReadRange,
  Storage,
} from './types';
import { contentDispositionHeader } from './content-disposition';

class EnoentError extends Error {
  code = 'ENOENT' as const;
  constructor(key: string) {
    super(`R2Storage: no object at key ${key}`);
  }
}

class StaleObjectError extends Error {
  code = 'ESTALE' as const;
}

/** The subset of `S3Client` this backend relies on — narrow on purpose so
 *  tests don't need to construct a real AWS SDK client. */
export interface S3ClientLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send(command: any): Promise<any>;
}

function objectKey(key: string): string {
  return `attachments/${key}`;
}

function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    e.name === 'NoSuchKey' ||
    e.name === 'NotFound' || // HeadObjectCommand's not-found error name
    e.$metadata?.httpStatusCode === 404
  );
}

function isPreconditionFailed(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === 'object' &&
      (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 412,
  );
}

/** Parse the total size out of an S3 `Content-Range: bytes N-M/total`
 *  response header. Falls back to `undefined` if the header is absent or
 *  malformed (caller falls back to `ContentLength` in that case). */
function totalFromContentRange(contentRange?: string): number | undefined {
  if (!contentRange) return undefined;
  const match = /\/(\d+)$/.exec(contentRange);
  if (!match) return undefined;
  return Number(match[1]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function toWebStream(body: any): Promise<ReadableStream<Uint8Array>> {
  if (body && typeof body.transformToWebStream === 'function') {
    return body.transformToWebStream();
  }
  return Readable.toWeb(body as Readable) as ReadableStream<Uint8Array>;
}

export class R2Storage implements Storage {
  /** `_client` is typed as the narrow `S3ClientLike` so `save`/`read`/
   *  `delete`/`head` tests can inject `{ send: vi.fn() }`. `presignPut`/
   *  `presignGet` additionally need a **real** `S3Client` instance (it
   *  carries the signing config — region/credentials/endpoint) because
   *  `getSignedUrl` reads `client.config` directly; `buildStorage()`
   *  (`./index.ts`) always constructs a real `S3Client`, so this is safe
   *  in every non-test caller. Presign tests construct a real `S3Client`
   *  with dummy credentials — signing is a local computation, no network
   *  call is made. */
  constructor(
    private readonly _client: S3ClientLike,
    private readonly _bucket: string,
  ) {}

  async save(key: string, buffer: Buffer, mime: string): Promise<void> {
    await this._client.send(
      new PutObjectCommand({
        Bucket: this._bucket,
        Key: objectKey(key),
        Body: buffer,
        ContentType: mime,
      }),
    );
  }

  async read(
    key: string,
    range?: ReadRange,
  ): Promise<{ stream: ReadableStream<Uint8Array>; size: number }> {
    const hasRange = range && (range.start !== undefined || range.end !== undefined);
    const Range = hasRange
      ? range!.start !== undefined && range!.end !== undefined
        ? `bytes=${range!.start}-${range!.end}`
        : range!.start !== undefined
          ? `bytes=${range!.start}-`
          : `bytes=0-${range!.end}`
      : undefined;

    let response;
    try {
      response = await this._client.send(
        new GetObjectCommand({
          Bucket: this._bucket,
          Key: objectKey(key),
          ...(Range ? { Range } : {}),
          ...(range?.expectedVersion ? { IfMatch: range.expectedVersion } : {}),
        }),
      );
    } catch (err) {
      if (isNotFound(err)) throw new EnoentError(key);
      if (isPreconditionFailed(err)) throw new StaleObjectError();
      throw err;
    }

    const size =
      totalFromContentRange(response.ContentRange) ?? response.ContentLength;
    const stream = await toWebStream(response.Body);
    return { stream, size };
  }

  async delete(key: string): Promise<void> {
    try {
      await this._client.send(
        new DeleteObjectCommand({
          Bucket: this._bucket,
          Key: objectKey(key),
        }),
      );
    } catch (err) {
      if (isNotFound(err)) return;
      throw err;
    }
  }

  async head(key: string): Promise<{ size: number; version: string }> {
    let response;
    try {
      response = await this._client.send(
        new HeadObjectCommand({
          Bucket: this._bucket,
          Key: objectKey(key),
        }),
      );
    } catch (err) {
      if (isNotFound(err)) throw new EnoentError(key);
      throw err;
    }
    if (typeof response.ETag !== 'string' || response.ETag.length === 0) {
      throw new Error(`R2Storage: HEAD response omitted ETag for key ${key}`);
    }
    return { size: response.ContentLength, version: response.ETag };
  }

  async promote(
    sourceKey: string,
    destinationKey: string,
    expectedVersion: string,
  ): Promise<void> {
    try {
      const command = new CopyObjectCommand({
        Bucket: this._bucket,
        Key: objectKey(destinationKey),
        CopySource: `${this._bucket}/${objectKey(sourceKey)}`,
        CopySourceIfMatch: expectedVersion,
        IfNoneMatch: '*',
      });
      command.middlewareStack.add(
        (next) => async (args) => {
          const request = args.request as { headers: Record<string, string> };
          request.headers['cf-copy-destination-if-none-match'] = '*';
          return next(args);
        },
        { step: 'build', name: 'r2DestinationCreateOnlyMiddleware' },
      );
      await this._client.send(command);
    } catch (err) {
      if (isPreconditionFailed(err)) throw new StaleObjectError();
      if (isNotFound(err)) throw new EnoentError(sourceKey);
      throw err;
    }
  }

  async presignPut(key: string, opts: PresignPutOptions): Promise<string> {
    // signableHeaders must be explicit — the v3 presigner otherwise only
    // signs `host`, so a client PUTting a different Content-Type/Length
    // than declared here wouldn't be caught by the signature.
    return getSignedUrl(
      this._client as unknown as S3Client,
      new PutObjectCommand({
        Bucket: this._bucket,
        Key: objectKey(key),
        ContentType: opts.mime,
        ContentLength: opts.size,
      }),
      {
        expiresIn: opts.expiresInSeconds,
        signableHeaders: new Set(['content-type', 'content-length']),
      },
    );
  }

  async presignGet(key: string, opts: PresignGetOptions): Promise<string> {
    return getSignedUrl(
      this._client as unknown as S3Client,
      new GetObjectCommand({
        Bucket: this._bucket,
        Key: objectKey(key),
        ResponseContentDisposition: contentDispositionHeader(
          opts.filename,
          opts.disposition ?? 'inline',
        ),
        ResponseContentType: opts.mime,
      }),
      { expiresIn: opts.expiresInSeconds },
    );
  }
}
