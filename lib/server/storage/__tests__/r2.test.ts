/**
 * @vitest-environment node
 */
// R2Storage — Cloudflare R2 (S3-compatible) backed Storage. Exercised
// against a mocked S3 client ({ send: vi.fn() }) so we can assert on the
// exact commands issued without a live bucket. Mirrors the
// PostgresStorage/InMemoryStorage contract: `size` is always the TOTAL
// object size, Range is HTTP-inclusive, missing keys throw `code: 'ENOENT'`.
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

import { R2Storage } from '../r2';

const BUCKET = 'test-bucket';

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

// A Node Readable lacks transformToWebStream — exercises the
// Readable.toWeb() fallback path.
function nodeBody(text: string) {
  return Readable.from([Buffer.from(text)]);
}

// A fake SDK stream that DOES expose transformToWebStream — exercises the
// preferred path.
function sdkBody(text: string) {
  return {
    transformToWebStream: () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(text));
          controller.close();
        },
      }),
  };
}

describe('R2Storage', () => {
  it('save() sends PutObjectCommand with Bucket/Key(prefixed)/Body/ContentType', async () => {
    const send = vi.fn().mockResolvedValue({});
    const storage = new R2Storage({ send }, BUCKET);

    const body = Buffer.from('hello r2');
    await storage.save('att-1', body, 'application/pdf');

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: BUCKET,
      Key: 'attachments/att-1',
      Body: body,
      ContentType: 'application/pdf',
    });
  });

  it('read() with no range returns the full stream and total size; no Range header sent', async () => {
    const send = vi.fn().mockResolvedValue({
      Body: sdkBody('hello world'),
      ContentLength: 11,
    });
    const storage = new R2Storage({ send }, BUCKET);

    const { stream, size } = await storage.read('att-1');
    expect(size).toBe(11);
    const got = await collectStream(stream);
    expect(got.toString()).toBe('hello world');

    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({ Bucket: BUCKET, Key: 'attachments/att-1' });
  });

  it('read() falls back to Readable.toWeb() when Body lacks transformToWebStream', async () => {
    const send = vi.fn().mockResolvedValue({
      Body: nodeBody('plain node stream'),
      ContentLength: 17,
    });
    const storage = new R2Storage({ send }, BUCKET);

    const { stream, size } = await storage.read('att-2');
    expect(size).toBe(17);
    const got = await collectStream(stream);
    expect(got.toString()).toBe('plain node stream');
  });

  it('read() with { start, end } sets Range=bytes=2-5 and reports TOTAL size from ContentRange', async () => {
    const send = vi.fn().mockResolvedValue({
      Body: sdkBody('2345'),
      ContentLength: 4,
      ContentRange: 'bytes 2-5/100',
    });
    const storage = new R2Storage({ send }, BUCKET);

    const { stream, size } = await storage.read('att-3', { start: 2, end: 5 });
    expect(size).toBe(100); // total, not slice length
    const got = await collectStream(stream);
    expect(got.toString()).toBe('2345');

    const command = send.mock.calls[0][0];
    expect(command.input).toEqual({
      Bucket: BUCKET,
      Key: 'attachments/att-3',
      Range: 'bytes=2-5',
    });
  });

  it('read() with { start } only sets Range=bytes=2-', async () => {
    const send = vi.fn().mockResolvedValue({
      Body: sdkBody('rest'),
      ContentLength: 4,
      ContentRange: 'bytes 2-15/16',
    });
    const storage = new R2Storage({ send }, BUCKET);

    await storage.read('att-4', { start: 2 });
    const command = send.mock.calls[0][0];
    expect(command.input.Range).toBe('bytes=2-');
  });

  it('read() with { end } only sets Range=bytes=0-5', async () => {
    const send = vi.fn().mockResolvedValue({
      Body: sdkBody('012345'),
      ContentLength: 6,
      ContentRange: 'bytes 0-5/16',
    });
    const storage = new R2Storage({ send }, BUCKET);

    await storage.read('att-5', { end: 5 });
    const command = send.mock.calls[0][0];
    expect(command.input.Range).toBe('bytes=0-5');
  });

  it('read() throws ENOENT when the SDK rejects with name NoSuchKey', async () => {
    const send = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' }));
    const storage = new R2Storage({ send }, BUCKET);

    await expect(storage.read('missing')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('read() throws ENOENT when the SDK rejects with $metadata.httpStatusCode 404', async () => {
    const send = vi.fn().mockRejectedValue(
      Object.assign(new Error('not found'), {
        $metadata: { httpStatusCode: 404 },
      }),
    );
    const storage = new R2Storage({ send }, BUCKET);

    await expect(storage.read('missing')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('read() rethrows unrelated errors as-is', async () => {
    const send = vi.fn().mockRejectedValue(new Error('boom'));
    const storage = new R2Storage({ send }, BUCKET);

    await expect(storage.read('att-1')).rejects.toThrow('boom');
  });

  it('delete() sends DeleteObjectCommand with the prefixed key', async () => {
    const send = vi.fn().mockResolvedValue({});
    const storage = new R2Storage({ send }, BUCKET);

    await storage.delete('att-1');
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toEqual({ Bucket: BUCKET, Key: 'attachments/att-1' });
  });

  it('delete() swallows a NoSuchKey rejection', async () => {
    const send = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' }));
    const storage = new R2Storage({ send }, BUCKET);

    await expect(storage.delete('missing')).resolves.toBeUndefined();
  });

  it('delete() swallows a $metadata.httpStatusCode 404 rejection', async () => {
    const send = vi.fn().mockRejectedValue(
      Object.assign(new Error('not found'), {
        $metadata: { httpStatusCode: 404 },
      }),
    );
    const storage = new R2Storage({ send }, BUCKET);

    await expect(storage.delete('missing')).resolves.toBeUndefined();
  });

  it('delete() rethrows unrelated errors', async () => {
    const send = vi.fn().mockRejectedValue(new Error('boom'));
    const storage = new R2Storage({ send }, BUCKET);

    await expect(storage.delete('att-1')).rejects.toThrow('boom');
  });
});
