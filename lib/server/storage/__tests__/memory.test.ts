// InMemoryStorage round-trip — mirrors the SupabaseStorage contract
// (in-memory slice on Range, `size` is total bytes, missing key throws
// `ENOENT`). Used as the test-only backend so route + action specs run
// without disk or network.
import { describe, expect, it } from 'vitest';

import { InMemoryStorage } from '../memory';
import { newAttachmentPath } from '../path';

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

describe('InMemoryStorage', () => {
  it('save() + read() round-trips the bytes and reports total size', async () => {
    const s = new InMemoryStorage();
    const key = newAttachmentPath('hello.pdf');
    const body = Buffer.from('PDF body bytes', 'utf8');

    await s.save(key, body, 'application/pdf');
    const { stream, size } = await s.read(key);

    expect(size).toBe(body.length);
    const got = await collectStream(stream);
    expect(got.equals(body as unknown as Uint8Array)).toBe(true);
  });

  it('read(key, { start, end }) returns inclusive partial bytes and total size', async () => {
    const s = new InMemoryStorage();
    const key = newAttachmentPath('range.pdf');
    const body = Buffer.from('0123456789abcdef', 'utf8'); // 16 bytes
    await s.save(key, body, 'application/pdf');

    const { stream, size } = await s.read(key, { start: 4, end: 9 });
    expect(size).toBe(body.length); // total file size, not range length
    const got = await collectStream(stream);
    expect(got.toString('utf8')).toBe('456789');
  });

  it('read(key, { start }) reads to end of file', async () => {
    const s = new InMemoryStorage();
    const key = newAttachmentPath('open-end.pdf');
    const body = Buffer.from('0123456789', 'utf8');
    await s.save(key, body, 'application/pdf');

    const { stream, size } = await s.read(key, { start: 7 });
    expect(size).toBe(body.length);
    const got = await collectStream(stream);
    expect(got.toString('utf8')).toBe('789');
  });

  it('read() throws ENOENT-coded error when key is missing', async () => {
    const s = new InMemoryStorage();
    await expect(s.read('no/such/key.pdf')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('delete() removes the key and is idempotent', async () => {
    const s = new InMemoryStorage();
    const key = newAttachmentPath('throwaway.jpg');
    await s.save(key, Buffer.from('x'), 'image/jpeg');

    await s.delete(key);
    await expect(s.read(key)).rejects.toMatchObject({ code: 'ENOENT' });
    // Second delete on already-missing key must not throw.
    await expect(s.delete(key)).resolves.toBeUndefined();
  });

  it('save() upserts (second save with same key overwrites)', async () => {
    const s = new InMemoryStorage();
    const key = newAttachmentPath('upsert.txt');
    await s.save(key, Buffer.from('one'), 'text/plain');
    await s.save(key, Buffer.from('two'), 'text/plain');

    const { stream, size } = await s.read(key);
    expect(size).toBe(3);
    const got = await collectStream(stream);
    expect(got.toString('utf8')).toBe('two');
  });
});
