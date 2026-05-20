/**
 * @vitest-environment node
 */
// PostgresStorage — bytea-backed Storage. Exercised against a real pglite
// Postgres so bytea round-trips, octet semantics, and Range slicing are
// verified the same way prod postgres-js would behave. Mirrors the
// InMemoryStorage contract: `size` is always the TOTAL byte count, Range is
// HTTP-inclusive, missing keys throw `code: 'ENOENT'`.
import { beforeAll, describe, expect, it } from 'vitest';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { PostgresStorage } from '../postgres';

let db: PgliteDB;
let storage: PostgresStorage;

// One pglite instance for the suite — pglite boot (WASM + migrations) is
// expensive, and each test below uses a distinct storage key so they never
// collide. Sharing the db keeps the suite fast and avoids piling pglite
// inits onto the parallel test pool.
beforeAll(async () => {
  db = await createPgliteDb();
  storage = new PostgresStorage(db);
});

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

describe('PostgresStorage', () => {
  it('save() then read() returns the stored bytes and total size', async () => {
    const key = '2026/05/abc.pdf';
    const body = Buffer.from('hello postgres storage');
    await storage.save(key, body, 'application/pdf');

    const { stream, size } = await storage.read(key);
    expect(size).toBe(body.length);
    const got = await collectStream(stream);
    expect(got.equals(body as unknown as Uint8Array)).toBe(true);
  });

  it('read() with Range returns an HTTP-inclusive slice; size stays total', async () => {
    const key = '2026/05/range.bin';
    const body = Buffer.from('0123456789');
    await storage.save(key, body, 'application/octet-stream');

    const { stream, size } = await storage.read(key, { start: 2, end: 5 });
    expect(size).toBe(body.length); // total, not slice length
    const got = await collectStream(stream);
    // bytes 2..5 inclusive => "2345"
    expect(got.toString()).toBe('2345');
  });

  it('read() with open-ended Range (start only) reads to end', async () => {
    const key = '2026/05/suffix.bin';
    const body = Buffer.from('0123456789');
    await storage.save(key, body, 'application/octet-stream');

    const { stream, size } = await storage.read(key, { start: 7 });
    expect(size).toBe(body.length);
    const got = await collectStream(stream);
    expect(got.toString()).toBe('789');
  });

  it('save() upserts — a second save overwrites the bytes', async () => {
    const key = '2026/05/dup.txt';
    await storage.save(key, Buffer.from('first'), 'text/plain');
    await storage.save(key, Buffer.from('second-longer'), 'text/plain');

    const { stream, size } = await storage.read(key);
    expect(size).toBe('second-longer'.length);
    const got = await collectStream(stream);
    expect(got.toString()).toBe('second-longer');
  });

  it('read() throws ENOENT for a missing key', async () => {
    await expect(storage.read('2026/05/missing.pdf')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('delete() removes the object so a later read throws ENOENT', async () => {
    const key = '2026/05/gone.pdf';
    await storage.save(key, Buffer.from('bye'), 'application/pdf');
    await storage.delete(key);
    await expect(storage.read(key)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('delete() of a missing key does not throw', async () => {
    await expect(storage.delete('2026/05/never.pdf')).resolves.toBeUndefined();
  });
});
