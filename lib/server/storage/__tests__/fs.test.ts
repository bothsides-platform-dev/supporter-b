// FsStorage — filesystem-backed Storage implementation used as the
// FILE_STORAGE_DIR fallback (e2e/local: shares bytes between the
// Playwright process and the separate dev-server process, which
// InMemoryStorage cannot do since it is process-local).
//
// Mirrors the InMemoryStorage/R2Storage contract: `size` is always the
// **total** byte count (not the range length), Range slicing is
// HTTP-inclusive, and missing keys throw with `code: 'ENOENT'`.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FsStorage } from '../fs';

async function collectStream(s: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = s.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return Buffer.from(out);
}

describe('FsStorage', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'fs-storage-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('save() + read() round-trips the bytes and reports total size', async () => {
    const s = new FsStorage(dir);
    const key = 'hello-pdf-key';
    const body = Buffer.from('PDF body bytes', 'utf8');

    await s.save(key, body, 'application/pdf');
    const { stream, size } = await s.read(key);

    expect(size).toBe(body.length);
    const got = await collectStream(stream);
    expect(got.equals(body as unknown as Uint8Array)).toBe(true);

    // Bytes actually landed on disk under the given dir.
    const onDisk = await readFile(path.join(dir, key));
    expect(onDisk.equals(body as unknown as Uint8Array)).toBe(true);
  });

  it('creates the root directory lazily on first save', async () => {
    const nested = path.join(dir, 'nested', 'child');
    const s = new FsStorage(nested);
    await s.save('a-key', Buffer.from('x'), 'text/plain');
    const { size } = await s.read('a-key');
    expect(size).toBe(1);
  });

  it('read(key, { start, end }) returns inclusive partial bytes and total size', async () => {
    const s = new FsStorage(dir);
    const key = 'range-pdf-key';
    const body = Buffer.from('0123456789abcdef', 'utf8'); // 16 bytes
    await s.save(key, body, 'application/pdf');

    const { stream, size } = await s.read(key, { start: 4, end: 9 });
    expect(size).toBe(body.length); // total file size, not range length
    const got = await collectStream(stream);
    expect(got.toString('utf8')).toBe('456789');
  });

  it('read(key, { start }) reads to end of file', async () => {
    const s = new FsStorage(dir);
    const key = 'open-end-key';
    const body = Buffer.from('0123456789', 'utf8');
    await s.save(key, body, 'application/pdf');

    const { stream, size } = await s.read(key, { start: 7 });
    expect(size).toBe(body.length);
    const got = await collectStream(stream);
    expect(got.toString('utf8')).toBe('789');
  });

  it('read(key, { end }) reads from start of file through end (inclusive)', async () => {
    const s = new FsStorage(dir);
    const key = 'open-start-key';
    const body = Buffer.from('0123456789', 'utf8');
    await s.save(key, body, 'application/pdf');

    const { stream, size } = await s.read(key, { end: 3 });
    expect(size).toBe(body.length);
    const got = await collectStream(stream);
    expect(got.toString('utf8')).toBe('0123');
  });

  it('read() throws ENOENT-coded error when key is missing', async () => {
    const s = new FsStorage(dir);
    await expect(s.read('no-such-key')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('delete() removes the key and is idempotent', async () => {
    const s = new FsStorage(dir);
    const key = 'throwaway-key';
    await s.save(key, Buffer.from('x'), 'image/jpeg');

    await s.delete(key);
    await expect(s.read(key)).rejects.toMatchObject({ code: 'ENOENT' });
    // Second delete on already-missing key must not throw.
    await expect(s.delete(key)).resolves.toBeUndefined();
  });

  it('delete() on a never-created key resolves without throwing', async () => {
    const s = new FsStorage(dir);
    await expect(s.delete('never-existed-key')).resolves.toBeUndefined();
  });

  it('save() upserts (second save with same key overwrites)', async () => {
    const s = new FsStorage(dir);
    const key = 'upsert-key';
    await s.save(key, Buffer.from('one'), 'text/plain');
    await s.save(key, Buffer.from('two'), 'text/plain');

    const { stream, size } = await s.read(key);
    expect(size).toBe(3);
    const got = await collectStream(stream);
    expect(got.toString('utf8')).toBe('two');
  });

  it('save() rejects keys containing a path-traversal segment', async () => {
    const s = new FsStorage(dir);
    await expect(
      s.save('../escape', Buffer.from('x'), 'text/plain'),
    ).rejects.toThrow();
  });

  it('save() rejects keys containing a forward slash', async () => {
    const s = new FsStorage(dir);
    await expect(
      s.save('a/b', Buffer.from('x'), 'text/plain'),
    ).rejects.toThrow();
  });

  it('save() rejects keys containing a backslash', async () => {
    const s = new FsStorage(dir);
    await expect(
      s.save('a\\b', Buffer.from('x'), 'text/plain'),
    ).rejects.toThrow();
  });

  // The traversal guard must hold on every method, not just save() — a
  // refactor that inlines path resolution per-method could silently drop
  // it from the read/delete paths.
  it('read() rejects traversal keys', async () => {
    const s = new FsStorage(dir);
    await expect(s.read('../escape')).rejects.toThrow(/unsafe key/);
    await expect(s.read('a/b')).rejects.toThrow(/unsafe key/);
  });

  it('delete() rejects traversal keys', async () => {
    const s = new FsStorage(dir);
    await expect(s.delete('../escape')).rejects.toThrow(/unsafe key/);
    await expect(s.delete('a\\b')).rejects.toThrow(/unsafe key/);
  });
});
