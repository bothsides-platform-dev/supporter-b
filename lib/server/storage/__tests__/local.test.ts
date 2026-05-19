// LocalStorage round-trip on a per-test tmpdir. UPLOAD_DIR is swapped
// to an absolute scratch path before each case and torn down after, so
// the production `./uploads` is never touched.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { LocalStorage } from '../local';
import { newAttachmentPath } from '../path';

let scratch: string;
const ORIGINAL_UPLOAD_DIR = process.env.UPLOAD_DIR;

async function readAllToBuffer(s: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = s.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  // Concat through Uint8Array so TS 6's strict ArrayBuffer-backed
  // generics aren't tripped by Buffer's wider ArrayBufferLike type.
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return Buffer.from(out);
}

beforeEach(async () => {
  scratch = path.join(os.tmpdir(), `bidit-storage-${randomUUID()}`);
  process.env.UPLOAD_DIR = scratch;
});

afterEach(async () => {
  if (ORIGINAL_UPLOAD_DIR === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = ORIGINAL_UPLOAD_DIR;
  await fsp.rm(scratch, { recursive: true, force: true });
});

describe('LocalStorage', () => {
  it('save() creates intermediate directories and writes bytes', async () => {
    const ls = new LocalStorage();
    const key = newAttachmentPath('hello.pdf');
    const body = Buffer.from('PDF body bytes', 'utf8');

    await ls.save(key, body, 'application/pdf');

    const fullPath = path.join(scratch, key);
    const stat = await fsp.stat(fullPath);
    expect(stat.size).toBe(body.length);
  });

  it('read() returns a Web ReadableStream and the file size', async () => {
    const ls = new LocalStorage();
    const key = newAttachmentPath('hello.png');
    const body = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03]);
    await ls.save(key, body, 'image/png');

    const { stream, size } = await ls.read(key);
    expect(size).toBe(body.length);
    const got = await readAllToBuffer(stream);
    expect(got.equals(body as unknown as Uint8Array)).toBe(true);
  });

  it('read(key, { start, end }) returns inclusive partial bytes and total file size', async () => {
    const ls = new LocalStorage();
    const key = newAttachmentPath('range.pdf');
    const body = Buffer.from('0123456789abcdef', 'utf8'); // 16 bytes
    await ls.save(key, body, 'application/pdf');

    // Inclusive HTTP semantics: bytes=4-9 → "456789" (6 bytes)
    const { stream, size } = await ls.read(key, { start: 4, end: 9 });
    expect(size).toBe(body.length); // total file size, not range length
    const got = await readAllToBuffer(stream);
    expect(got.toString('utf8')).toBe('456789');
  });

  it('read(key, { start }) reads to end of file', async () => {
    const ls = new LocalStorage();
    const key = newAttachmentPath('open-end.pdf');
    const body = Buffer.from('0123456789', 'utf8');
    await ls.save(key, body, 'application/pdf');

    const { stream, size } = await ls.read(key, { start: 7 });
    expect(size).toBe(body.length);
    const got = await readAllToBuffer(stream);
    expect(got.toString('utf8')).toBe('789');
  });

  it('delete() removes the file and is idempotent on missing files', async () => {
    const ls = new LocalStorage();
    const key = newAttachmentPath('throwaway.jpg');
    await ls.save(key, Buffer.from('x'), 'image/jpeg');

    await ls.delete(key);
    await expect(fsp.stat(path.join(scratch, key))).rejects.toMatchObject({
      code: 'ENOENT',
    });

    // Idempotent — a second delete should not throw.
    await expect(ls.delete(key)).resolves.toBeUndefined();
  });

  it('save() supports absolute UPLOAD_DIR (test pattern)', async () => {
    expect(path.isAbsolute(process.env.UPLOAD_DIR!)).toBe(true);
    const ls = new LocalStorage();
    const key = newAttachmentPath('a.pdf');
    await ls.save(key, Buffer.from('xx'), 'application/pdf');
    const stat = await fsp.stat(path.join(scratch, key));
    expect(stat.isFile()).toBe(true);
  });

  it('newAttachmentPath() produces yyyy/mm/uuid.ext shape', () => {
    const key = newAttachmentPath('weird-name.PDF');
    const segs = key.split('/');
    expect(segs.length).toBe(3);
    expect(segs[0]).toMatch(/^\d{4}$/);
    expect(segs[1]).toMatch(/^\d{2}$/);
    expect(segs[2]).toMatch(/^[0-9a-f-]{36}\.pdf$/);
  });

  it('newAttachmentPath() drops disallowed ext characters', () => {
    const key = newAttachmentPath('foo.PdF;param=1');
    expect(key).toMatch(/\.pdfparam1$/);
  });
});
