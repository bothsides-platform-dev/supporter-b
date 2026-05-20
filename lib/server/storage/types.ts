/**
 * Storage contract for file uploads. Every backend (Postgres bytea in
 * prod, InMemory in tests) implements this interface — the `getStorage()`
 * factory is the single mutation point that decides which one is in
 * play. Routes / actions only ever talk through this interface, so
 * storage-specific concerns never leak out of the
 * `lib/server/storage` module.
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

export interface Storage {
  /** Persist `buffer` at `key`. Mime is recorded in the attachment row
   *  (not in storage metadata); backends that support per-object
   *  Content-Type (Supabase) may thread it through. */
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
}
