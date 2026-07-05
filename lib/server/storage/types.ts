/**
 * Storage contract for file uploads. Every backend (R2 in prod, InMemory
 * in dev/test) implements this interface — the `getStorage()` factory is
 * the single mutation point that decides which one is in play. Routes /
 * actions only ever talk through this interface, so storage-specific
 * concerns never leak out of the `lib/server/storage` module.
 *
 * `read` does not return mime — the route layer composes `Content-Type`
 * from the attachment row's `mime_type` (magic-byte sniffed at upload).
 * `size` is always the **total** file size so callers can compose
 * `Content-Range` even when only a slice is streamed.
 */

/** Range slice for partial reads. `start`/`end` are HTTP-inclusive byte
 *  offsets, mirroring the `Range: bytes=N-M` header semantics. */
export interface ReadRange {
  start?: number;
  end?: number;
}

/** Options for `presignPut` — a client-direct upload URL. `size` and `mime`
 *  are baked into the signature (`Content-Length`/`Content-Type` signed
 *  headers) so a client can't PUT a different byte count or type than it
 *  declared without invalidating the signature. */
export interface PresignPutOptions {
  mime: string;
  size: number;
  expiresInSeconds: number;
}

/** Options for `presignGet` — a client-direct download URL. `filename`
 *  drives the `Content-Disposition` the browser sees on download;
 *  `disposition` defaults to `'inline'` (preview iframes need inline). */
export interface PresignGetOptions {
  filename: string;
  mime: string;
  expiresInSeconds: number;
  disposition?: 'inline' | 'attachment';
}

export interface Storage {
  /** Persist `buffer` at `key`. Mime is recorded in the attachment row
   *  (not relied on at read time); the R2 backend stores it as the object's
   *  ContentType too, but the route composes Content-Type from the
   *  attachment row's `mime_type`. */
  save(key: string, buffer: Buffer, mime: string): Promise<void>;
  /** Open a streaming reader. When `range` is supplied the stream emits
   *  only that slice; `size` always carries the **total** file size.
   *  Missing keys throw with `code: 'ENOENT'` so the file route can
   *  serve 410 uniformly across backends. */
  read(
    key: string,
    range?: ReadRange,
  ): Promise<{ stream: ReadableStream<Uint8Array>; size: number }>;
  /** Best-effort delete; ENOENT is swallowed so cleanup paths after
   *  failed inserts don't double-fault. */
  delete(key: string): Promise<void>;
  /** Cheap metadata probe — total object size, no body transfer. Missing
   *  keys throw with `code: 'ENOENT'`, same contract as `read`. */
  head(key: string): Promise<{ size: number }>;
  /** Mint a time-limited URL the client can `PUT` bytes to directly,
   *  bypassing the app proxy. */
  presignPut(key: string, opts: PresignPutOptions): Promise<string>;
  /** Mint a time-limited URL the client can `GET` bytes from directly,
   *  bypassing the app proxy. */
  presignGet(key: string, opts: PresignGetOptions): Promise<string>;
}
