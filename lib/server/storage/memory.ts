/**
 * InMemoryStorage — Map-backed `Storage` implementation for tests.
 *
 * Mirrors `R2Storage`'s semantics (the `Storage` contract) so a spec that
 * passes against one passes against the other: `size` is always the
 * **total** byte count (not the range length), Range slicing is
 * HTTP-inclusive, and missing keys throw with `code: 'ENOENT'` so the
 * file route can serve 410 uniformly across backends.
 *
 * Never imported by prod code — `getStorage()` (`./index.ts`) is
 * R2Storage-or-throw in every environment, with no fallback backend.
 * This is a pure test double, wired in only via `__setStorageForTest`.
 */
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
    super(`InMemoryStorage: no object at key ${key}`);
  }
}

export class InMemoryStorage implements Storage {
  private store = new Map<string, { buffer: Buffer; mime: string }>();

  async save(key: string, buffer: Buffer, mime: string): Promise<void> {
    // Copy the bytes so later mutations to the caller's Buffer don't
    // bleed into stored bytes — matches the behaviour of a real upload
    // (the payload is serialised over the wire). Cast via Uint8Array
    // because TS 6 narrows Buffer's typed view to ArrayBufferLike, which
    // doesn't match Buffer.from's strict ArrayBuffer-backed overload.
    this.store.set(key, {
      buffer: Buffer.from(buffer as unknown as Uint8Array),
      mime,
    });
  }

  async read(
    key: string,
    range?: ReadRange,
  ): Promise<{ stream: ReadableStream<Uint8Array>; size: number }> {
    const entry = this.store.get(key);
    if (!entry) throw new EnoentError(key);
    const bytes = new Uint8Array(entry.buffer);
    const total = bytes.byteLength;
    const slice =
      range && (range.start !== undefined || range.end !== undefined)
        ? bytes.slice(
            range.start ?? 0,
            range.end === undefined ? total : range.end + 1,
          )
        : bytes;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(slice);
        controller.close();
      },
    });
    return { stream, size: total };
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async head(key: string): Promise<{ size: number }> {
    const entry = this.store.get(key);
    if (!entry) throw new EnoentError(key);
    return { size: entry.buffer.length };
  }

  /** Deterministic fake URL — no real network involved. Just enough
   *  structure (query params) for route/e2e tests to assert against
   *  without depending on the real R2Storage signing implementation. */
  async presignPut(key: string, opts: PresignPutOptions): Promise<string> {
    const params = new URLSearchParams({
      mime: opts.mime,
      size: String(opts.size),
      expires: String(opts.expiresInSeconds),
    });
    return `memory://put/${encodeURIComponent(key)}?${params.toString()}`;
  }

  async presignGet(key: string, opts: PresignGetOptions): Promise<string> {
    const disposition = opts.disposition ?? 'inline';
    const params = new URLSearchParams({
      filename: opts.filename,
      mime: opts.mime,
      expires: String(opts.expiresInSeconds),
      disposition,
      'content-disposition': contentDispositionHeader(
        opts.filename,
        disposition,
      ),
    });
    return `memory://get/${encodeURIComponent(key)}?${params.toString()}`;
  }
}
