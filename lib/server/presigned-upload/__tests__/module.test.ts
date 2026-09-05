import { describe, expect, it, vi } from 'vitest';

import { InMemoryStorage } from '@/lib/server/storage/memory';
import {
  createPresignedUploadModule,
  type PresignedUploadAdapter,
} from '../module';

type Actor = { userId: string };
type Input = { name: string; size: number; mime: string };
type Ready = { id: string };
type Rejection = 'forbidden';

function adapterWith(
  overrides: Partial<PresignedUploadAdapter<Actor, Input, Ready, Rejection>> = {},
): PresignedUploadAdapter<Actor, Input, Ready, Rejection> {
  return {
    createPending: vi.fn(),
    inspect: vi.fn(),
    commitReady: vi.fn(),
    remove: vi.fn().mockResolvedValue(true),
    takeStale: vi.fn(),
    ...overrides,
  };
}

describe('presigned upload module', () => {
  it('creates the pending upload before minting its PUT URL', async () => {
    let pendingCreated = false;
    const storage = new InMemoryStorage();
    const presignPut = vi.spyOn(storage, 'presignPut').mockImplementation(async () => {
      expect(pendingCreated).toBe(true);
      return 'https://uploads.example/put';
    });
    const adapter = adapterWith({
      createPending: vi.fn(async (_actor, input, id) => {
        pendingCreated = true;
        return {
          kind: 'pending' as const,
          upload: {
            id,
            key: id,
            size: input.size,
            mime: input.mime,
            ready: { id },
          },
        };
      }),
    });
    const uploads = createPresignedUploadModule({
      adapter,
      storage,
      createId: () => 'upload-1',
    });

    const result = await uploads.begin(
      { userId: 'user-1' },
      { name: 'contract.pdf', size: 42, mime: 'application/pdf' },
    );

    expect(result).toEqual({ ok: true, id: 'upload-1', uploadUrl: 'https://uploads.example/put' });
    expect(presignPut).toHaveBeenCalledWith('pending/upload-1', {
      mime: 'application/pdf',
      size: 42,
      expiresInSeconds: 600,
    });
  });

  it('removes the pending upload when minting the PUT URL fails', async () => {
    const storage = new InMemoryStorage();
    vi.spyOn(storage, 'presignPut').mockRejectedValue(new Error('R2 unavailable'));
    const pending = {
      id: 'upload-2',
      key: 'objects/upload-2',
      size: 42,
      mime: 'application/pdf',
      ready: { id: 'upload-2' },
    };
    const remove = vi.fn().mockResolvedValue(undefined);
    const adapter = adapterWith({
      createPending: vi.fn().mockResolvedValue({ kind: 'pending', upload: pending }),
      remove,
    });
    const uploads = createPresignedUploadModule({
      adapter,
      storage,
      createId: () => 'upload-2',
    });

    await expect(
      uploads.begin(
        { userId: 'user-1' },
        { name: 'contract.pdf', size: 42, mime: 'application/pdf' },
      ),
    ).resolves.toEqual({ ok: false, reason: 'presign-failed' });
    expect(remove).toHaveBeenCalledWith(pending);
  });

  it('still reports the presign failure when compensating row removal also fails', async () => {
    const storage = new InMemoryStorage();
    vi.spyOn(storage, 'presignPut').mockRejectedValue(new Error('R2 unavailable'));
    const pending = {
      id: 'upload-presign-cleanup',
      key: 'objects/upload-presign-cleanup',
      size: 42,
      mime: 'application/pdf',
      ready: { id: 'upload-presign-cleanup' },
    };
    const adapter = adapterWith({
      createPending: vi.fn().mockResolvedValue({ kind: 'pending', upload: pending }),
      remove: vi.fn().mockRejectedValue(new Error('DB unavailable')),
    });
    const uploads = createPresignedUploadModule({ adapter, storage });

    await expect(
      uploads.begin(
        { userId: 'user-1' },
        { name: 'contract.pdf', size: 42, mime: 'application/pdf' },
      ),
    ).resolves.toEqual({ ok: false, reason: 'presign-failed' });
  });

  it('returns an already-ready upload without reading storage', async () => {
    const storage = new InMemoryStorage();
    const head = vi.spyOn(storage, 'head');
    const adapter = adapterWith({
      inspect: vi.fn().mockResolvedValue({ kind: 'ready', value: { id: 'upload-3' } }),
    });
    const uploads = createPresignedUploadModule({
      adapter,
      storage,
      createId: () => 'unused',
    });

    await expect(uploads.complete({ userId: 'user-1' }, 'upload-3')).resolves.toEqual({
      ok: true,
      value: { id: 'upload-3' },
    });
    expect(head).not.toHaveBeenCalled();
  });

  it('keeps a pending row retryable when the object has not landed', async () => {
    const storage = new InMemoryStorage();
    const remove = vi.fn();
    const adapter = adapterWith({
      inspect: vi.fn().mockResolvedValue({
        kind: 'pending',
        upload: {
          id: 'upload-4',
          key: 'objects/upload-4',
          size: 42,
          mime: 'application/pdf',
          ready: { id: 'upload-4' },
        },
      }),
      remove,
    });
    const uploads = createPresignedUploadModule({
      adapter,
      storage,
      createId: () => 'unused',
    });

    await expect(uploads.complete({ userId: 'user-1' }, 'upload-4')).resolves.toEqual({
      ok: false,
      reason: 'not-uploaded',
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it.each(['head', 'read'] as const)(
    'propagates unexpected storage %s failures without deleting the pending row',
    async (stage) => {
      const storage = new InMemoryStorage();
      const bytes = Buffer.from('%PDF-1.7');
      const pending = {
        id: `upload-${stage}-failure`,
        key: `objects/upload-${stage}-failure`,
        size: bytes.length,
        mime: 'application/pdf',
        ready: { id: `upload-${stage}-failure` },
      };
      await storage.save(`pending/${pending.key}`, bytes, pending.mime);
      if (stage === 'head') {
        vi.spyOn(storage, 'head').mockRejectedValue(new Error('R2 head unavailable'));
      } else {
        vi.spyOn(storage, 'read').mockRejectedValue(new Error('R2 range unavailable'));
      }
      const remove = vi.fn();
      const adapter = adapterWith({
        inspect: vi.fn().mockResolvedValue({ kind: 'pending', upload: pending }),
        remove,
      });
      const uploads = createPresignedUploadModule({ adapter, storage });

      await expect(uploads.complete({ userId: 'user-1' }, pending.id)).rejects.toThrow(
        stage === 'head' ? 'R2 head unavailable' : 'R2 range unavailable',
      );
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it('rejects a staging object that changes between HEAD and the sniff read', async () => {
    const storage = new InMemoryStorage();
    const original = Buffer.from('%PDF-1.7\noriginal');
    const changed = Buffer.from('%PDF-1.7\nchanged!');
    const pending = {
      id: 'upload-stale-read',
      key: 'objects/upload-stale-read',
      size: original.length,
      mime: 'application/pdf',
      ready: { id: 'upload-stale-read' },
    };
    const sourceKey = `pending/${pending.key}`;
    await storage.save(sourceKey, original, pending.mime);
    const realHead = storage.head.bind(storage);
    vi.spyOn(storage, 'head').mockImplementationOnce(async (key) => {
      const observed = await realHead(key);
      await storage.save(sourceKey, changed, pending.mime);
      return observed;
    });
    const commitReady = vi.fn();
    const remove = vi.fn();
    const adapter = adapterWith({
      inspect: vi.fn().mockResolvedValue({ kind: 'pending', upload: pending }),
      commitReady,
      remove,
    });
    const uploads = createPresignedUploadModule({ adapter, storage });

    await expect(uploads.complete({ userId: 'user-1' }, pending.id)).resolves.toEqual({
      ok: false,
      reason: 'conflict',
    });
    expect(commitReady).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    await expect(storage.read(pending.key)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('checks size before reading bytes and removes an invalid object before its row', async () => {
    const storage = new InMemoryStorage();
    await storage.save('pending/objects/upload-5', Buffer.from('%PDF-1.7'), 'application/pdf');
    const events: string[] = [];
    vi.spyOn(storage, 'delete').mockImplementation(async () => {
      events.push('object');
    });
    const read = vi.spyOn(storage, 'read');
    const pending = {
      id: 'upload-5',
      key: 'objects/upload-5',
      size: 999,
      mime: 'application/pdf',
      ready: { id: 'upload-5' },
    };
    const adapter = adapterWith({
      inspect: vi.fn().mockResolvedValue({ kind: 'pending', upload: pending }),
      remove: vi.fn(async () => {
        events.push('row');
        return true;
      }),
    });
    const uploads = createPresignedUploadModule({
      adapter,
      storage,
      createId: () => 'unused',
    });

    await expect(uploads.complete({ userId: 'user-1' }, pending.id)).resolves.toEqual({
      ok: false,
      reason: 'size-mismatch',
    });
    expect(read).not.toHaveBeenCalled();
    expect(events).toEqual(['object', 'row', 'object']);
  });

  it('sniffs the first 4KB and removes bytes that do not match the expected MIME', async () => {
    const storage = new InMemoryStorage();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await storage.save('pending/objects/upload-6', png, 'application/pdf');
    const read = vi.spyOn(storage, 'read');
    const pending = {
      id: 'upload-6',
      key: 'objects/upload-6',
      size: png.length,
      mime: 'application/pdf',
      ready: { id: 'upload-6' },
    };
    const remove = vi.fn().mockResolvedValue(true);
    const adapter = adapterWith({
      inspect: vi.fn().mockResolvedValue({ kind: 'pending', upload: pending }),
      remove,
    });
    const uploads = createPresignedUploadModule({
      adapter,
      storage,
      createId: () => 'unused',
    });

    await expect(uploads.complete({ userId: 'user-1' }, pending.id)).resolves.toEqual({
      ok: false,
      reason: 'mime-mismatch',
    });
    expect(read).toHaveBeenCalledWith(`pending/${pending.key}`, {
      start: 0,
      end: 4095,
      expectedVersion: expect.any(String),
    });
    expect(remove).toHaveBeenCalledWith(pending);
  });

  it('commits a verified pending upload and returns its domain result', async () => {
    const storage = new InMemoryStorage();
    const pdf = Buffer.from('%PDF-1.7\nverified');
    await storage.save('pending/objects/upload-7', pdf, 'application/pdf');
    const pending = {
      id: 'upload-7',
      key: 'objects/upload-7',
      size: pdf.length,
      mime: 'application/pdf',
      ready: { id: 'upload-7' },
    };
    const commitReady = vi.fn().mockResolvedValue('committed');
    const adapter = adapterWith({
      inspect: vi.fn().mockResolvedValue({ kind: 'pending', upload: pending }),
      commitReady,
    });
    const uploads = createPresignedUploadModule({
      adapter,
      storage,
      createId: () => 'unused',
    });

    await expect(uploads.complete({ userId: 'user-1' }, pending.id)).resolves.toEqual({
      ok: true,
      value: { id: 'upload-7' },
    });
    expect(commitReady).toHaveBeenCalledWith(pending);
    const finalized = await storage.read(pending.key);
    await expect(new Response(finalized.stream).arrayBuffer()).resolves.toEqual(
      pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength),
    );
    await expect(storage.read(`pending/${pending.key}`)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it.each([
    { mime: 'application/pdf', bytes: Buffer.from('%PDF-1.7\nvalid') },
    { mime: 'image/png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1]) },
    { mime: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]) },
  ])('commits verified $mime bytes', async ({ mime, bytes }) => {
    const storage = new InMemoryStorage();
    const key = `objects/${mime}`;
    await storage.save(`pending/${key}`, bytes, mime);
    const pending = {
      id: `upload-${mime}`,
      key,
      size: bytes.length,
      mime,
      ready: { id: `upload-${mime}` },
    };
    const commitReady = vi.fn().mockResolvedValue('committed');
    const adapter = adapterWith({
      inspect: vi.fn().mockResolvedValue({ kind: 'pending', upload: pending }),
      commitReady,
    });
    const uploads = createPresignedUploadModule({ adapter, storage });

    await expect(uploads.complete({ userId: 'user-1' }, pending.id)).resolves.toEqual({
      ok: true,
      value: pending.ready,
    });
    expect(commitReady).toHaveBeenCalledWith(pending);
  });

  it('reports a conflict when the verified pending row can no longer become ready', async () => {
    const storage = new InMemoryStorage();
    const pdf = Buffer.from('%PDF-1.7\nconflict');
    await storage.save('pending/objects/upload-8', pdf, 'application/pdf');
    const pending = {
      id: 'upload-8',
      key: 'objects/upload-8',
      size: pdf.length,
      mime: 'application/pdf',
      ready: { id: 'upload-8' },
    };
    const adapter = adapterWith({
      inspect: vi.fn().mockResolvedValue({ kind: 'pending', upload: pending }),
      commitReady: vi.fn().mockResolvedValue('conflict'),
    });
    const uploads = createPresignedUploadModule({
      adapter,
      storage,
      createId: () => 'unused',
    });

    await expect(uploads.complete({ userId: 'user-1' }, pending.id)).resolves.toEqual({
      ok: false,
      reason: 'conflict',
    });
  });

  it('treats a concurrent ready winner as an idempotent success', async () => {
    const storage = new InMemoryStorage();
    const pdf = Buffer.from('%PDF-1.7\nalready-ready');
    await storage.save('pending/objects/upload-9', pdf, 'application/pdf');
    const pending = {
      id: 'upload-9',
      key: 'objects/upload-9',
      size: pdf.length,
      mime: 'application/pdf',
      ready: { id: 'upload-9' },
    };
    const adapter = adapterWith({
      inspect: vi.fn().mockResolvedValue({ kind: 'pending', upload: pending }),
      commitReady: vi.fn().mockResolvedValue('already-ready'),
    });
    const uploads = createPresignedUploadModule({ adapter, storage });

    await expect(uploads.complete({ userId: 'user-1' }, pending.id)).resolves.toEqual({
      ok: true,
      value: { id: pending.id },
    });
  });

  it('treats staging ENOENT during initial HEAD as success when a concurrent completion is ready', async () => {
    const storage = new InMemoryStorage();
    const pending = {
      id: 'upload-source-lost-head',
      key: 'objects/upload-source-lost-head',
      size: 42,
      mime: 'application/pdf',
      ready: { id: 'upload-source-lost-head' },
    };
    vi.spyOn(storage, 'head').mockRejectedValueOnce(
      Object.assign(new Error('source removed'), { code: 'ENOENT' }),
    );
    const adapter = adapterWith({
      inspect: vi
        .fn()
        .mockResolvedValueOnce({ kind: 'pending', upload: pending })
        .mockResolvedValueOnce({ kind: 'ready', value: pending.ready }),
    });
    const uploads = createPresignedUploadModule({ adapter, storage });

    await expect(uploads.complete({ userId: 'user-1' }, pending.id)).resolves.toEqual({
      ok: true,
      value: pending.ready,
    });
  });

  it.each(['read', 'promote'] as const)(
    'treats staging ENOENT during %s as success when a concurrent completion is ready',
    async (stage) => {
      const storage = new InMemoryStorage();
      const pdf = Buffer.from('%PDF-1.7\nconcurrent winner');
      const pending = {
        id: `upload-source-lost-${stage}`,
        key: `objects/upload-source-lost-${stage}`,
        size: pdf.length,
        mime: 'application/pdf',
        ready: { id: `upload-source-lost-${stage}` },
      };
      await storage.save(`pending/${pending.key}`, pdf, pending.mime);
      const missing = Object.assign(new Error('source removed'), { code: 'ENOENT' });
      if (stage === 'read') {
        vi.spyOn(storage, 'read').mockRejectedValueOnce(missing);
      } else {
        vi.spyOn(storage, 'promote').mockRejectedValueOnce(missing);
      }
      const adapter = adapterWith({
        inspect: vi
          .fn()
          .mockResolvedValueOnce({ kind: 'pending', upload: pending })
          .mockResolvedValueOnce({ kind: 'ready', value: pending.ready }),
      });
      const uploads = createPresignedUploadModule({ adapter, storage });

      await expect(uploads.complete({ userId: 'user-1' }, pending.id)).resolves.toEqual({
        ok: true,
        value: pending.ready,
      });
    },
  );

  it('resumes from an immutable final object when promotion won before the DB commit', async () => {
    const storage = new InMemoryStorage();
    const pdf = Buffer.from('%PDF-1.7\npromoted before commit');
    const pending = {
      id: 'upload-promoted-before-commit',
      key: 'objects/upload-promoted-before-commit',
      size: pdf.length,
      mime: 'application/pdf',
      ready: { id: 'upload-promoted-before-commit' },
    };
    await storage.save(`pending/${pending.key}`, pdf, pending.mime);
    const source = await storage.head(`pending/${pending.key}`);
    await storage.promote(`pending/${pending.key}`, pending.key, source.version);
    const commitReady = vi.fn().mockResolvedValue('committed');
    const adapter = adapterWith({
      inspect: vi.fn().mockResolvedValue({ kind: 'pending', upload: pending }),
      commitReady,
    });
    const uploads = createPresignedUploadModule({ adapter, storage });

    await expect(uploads.complete({ userId: 'user-1' }, pending.id)).resolves.toEqual({
      ok: true,
      value: pending.ready,
    });
    expect(commitReady).toHaveBeenCalledWith(pending);
  });

  it.each(['object', 'row'] as const)(
    'still attempts both terminal cleanups when the %s delete fails',
    async (failingDelete) => {
      const storage = new InMemoryStorage();
      const bytes = Buffer.from('%PDF-1.7');
      await storage.save('pending/objects/upload-cleanup', bytes, 'application/pdf');
      const objectDelete = vi.spyOn(storage, 'delete');
      if (failingDelete === 'object') objectDelete.mockRejectedValue(new Error('R2 down'));
      const pending = {
        id: 'upload-cleanup',
        key: 'objects/upload-cleanup',
        size: bytes.length + 1,
        mime: 'application/pdf',
        ready: { id: 'upload-cleanup' },
      };
      const rowDelete = vi.fn().mockResolvedValue(true);
      if (failingDelete === 'row') rowDelete.mockRejectedValue(new Error('DB down'));
      const adapter = adapterWith({
        inspect: vi.fn().mockResolvedValue({ kind: 'pending', upload: pending }),
        remove: rowDelete,
      });
      const uploads = createPresignedUploadModule({ adapter, storage });

      await expect(uploads.complete({ userId: 'user-1' }, pending.id)).resolves.toEqual({
        ok: false,
        reason: failingDelete === 'row' ? 'conflict' : 'size-mismatch',
      });
      expect(objectDelete).toHaveBeenCalledWith(`pending/${pending.key}`);
      if (failingDelete === 'object') {
        expect(objectDelete).toHaveBeenCalledWith(pending.key);
      } else {
        expect(objectDelete).not.toHaveBeenCalledWith(pending.key);
      }
      expect(rowDelete).toHaveBeenCalledWith(pending);
    },
  );

  it('preserves a concurrent ready winner when invalid cleanup loses the pending-row CAS', async () => {
    const storage = new InMemoryStorage();
    const finalKey = 'objects/upload-ready-winner';
    const readyBytes = Buffer.from('%PDF-1.7\nready winner');
    await storage.save(finalKey, readyBytes, 'application/pdf');
    await storage.save(`pending/${finalKey}`, Buffer.from('not a pdf'), 'application/pdf');
    const pending = {
      id: 'upload-ready-winner',
      key: finalKey,
      size: Buffer.byteLength('not a pdf'),
      mime: 'application/pdf',
      ready: { id: 'upload-ready-winner' },
    };
    const adapter = adapterWith({
      inspect: vi.fn().mockResolvedValue({ kind: 'pending', upload: pending }),
      remove: vi.fn().mockResolvedValue(false),
    });
    const uploads = createPresignedUploadModule({ adapter, storage });

    await expect(uploads.complete({ userId: 'user-1' }, pending.id)).resolves.toEqual({
      ok: false,
      reason: 'conflict',
    });
    const { stream } = await storage.read(finalKey);
    expect(Buffer.from(await new Response(stream).arrayBuffer())).toEqual(readyBytes);
  });

  it('takes a bounded stale batch row-first and best-effort deletes each object', async () => {
    const events: string[] = [];
    const storage = new InMemoryStorage();
    vi.spyOn(storage, 'delete').mockImplementation(async (key) => {
      events.push(`object:${key}`);
      if (key === 'objects/b') throw new Error('temporary R2 failure');
    });
    const cutoff = new Date('2026-09-05T00:00:00Z');
    const takeStale = vi.fn(async () => {
      events.push('rows');
      return [{ key: 'objects/a' }, { key: 'objects/b' }];
    });
    const adapter = adapterWith({ takeStale });
    const uploads = createPresignedUploadModule({
      adapter,
      storage,
      createId: () => 'unused',
    });

    await expect(uploads.sweep(cutoff, 200)).resolves.toEqual({
      deletedRows: 2,
      deletedObjects: 1,
    });
    expect(takeStale).toHaveBeenCalledWith(cutoff, 200);
    expect(events).toEqual([
      'rows',
      'object:pending/objects/a',
      'object:objects/a',
      'object:pending/objects/b',
      'object:objects/b',
    ]);
  });

  it('counts a stale row without a storage key but skips its object delete', async () => {
    const storage = new InMemoryStorage();
    const removeObject = vi.spyOn(storage, 'delete');
    const adapter = adapterWith({
      takeStale: vi.fn().mockResolvedValue([{ key: null }]),
    });
    const uploads = createPresignedUploadModule({
      adapter,
      storage,
      createId: () => 'unused',
    });

    await expect(uploads.sweep(new Date('2026-09-05T00:00:00Z'), 200)).resolves.toEqual({
      deletedRows: 1,
      deletedObjects: 0,
    });
    expect(removeObject).not.toHaveBeenCalled();
  });
});
