/**
 * FsStorage — filesystem-backed `Storage` implementation.
 *
 * This is the `FILE_STORAGE_DIR` fallback (see `./index.ts`): unlike
 * `InMemoryStorage` (process-local, a `Map`), a directory on disk is
 * visible to more than one process. That matters for e2e — the
 * Playwright process (spec helpers calling `getStorage().save()`) and
 * the `pnpm dev` webServer process under test are two separate Node
 * processes; only a shared filesystem directory lets the server read
 * bytes the test process wrote.
 *
 * Mirrors `InMemoryStorage`/`R2Storage`'s semantics: `size` is always
 * the **total** byte count (not the range length), Range slicing is
 * HTTP-inclusive, and missing keys throw with `code: 'ENOENT'` so the
 * file route can serve 410 uniformly across backends.
 */
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

import type { ReadRange, Storage } from './types';

class EnoentError extends Error {
  code = 'ENOENT' as const;
  constructor(key: string) {
    super(`FsStorage: no object at key ${key}`);
  }
}

/** Reject any key that isn't a bare filename — attachment keys are UUIDs
 *  (see `app/api/files/upload/route.ts`), so a key containing a path
 *  separator or a `..` segment can only be an attempted traversal out of
 *  the storage root. */
function assertSafeKey(key: string): void {
  if (key.includes('/') || key.includes('\\') || key.includes('..')) {
    throw new Error(`FsStorage: unsafe key ${key}`);
  }
}

export class FsStorage implements Storage {
  constructor(private readonly dir: string) {}

  private resolve(key: string): string {
    assertSafeKey(key);
    return path.join(this.dir, key);
  }

  async save(key: string, buffer: Buffer, _mime: string): Promise<void> {
    const target = this.resolve(key);
    await mkdir(this.dir, { recursive: true });
    await writeFile(target, buffer);
  }

  async read(
    key: string,
    range?: ReadRange,
  ): Promise<{ stream: ReadableStream<Uint8Array>; size: number }> {
    const target = this.resolve(key);
    let total: number;
    try {
      total = (await stat(target)).size;
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === 'ENOENT') throw new EnoentError(key);
      throw err;
    }

    const hasRange =
      range && (range.start !== undefined || range.end !== undefined);
    const nodeStream = hasRange
      ? createReadStream(target, { start: range!.start ?? 0, end: range!.end })
      : createReadStream(target);
    const stream = Readable.toWeb(
      nodeStream,
    ) as ReadableStream<Uint8Array>;
    return { stream, size: total };
  }

  async delete(key: string): Promise<void> {
    const target = this.resolve(key);
    await rm(target, { force: true });
  }
}
