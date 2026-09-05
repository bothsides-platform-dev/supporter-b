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
    remove: vi.fn(),
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
    expect(presignPut).toHaveBeenCalledWith('upload-1', {
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

  it('checks size before reading bytes and removes an invalid object before its row', async () => {
    const storage = new InMemoryStorage();
    await storage.save('objects/upload-5', Buffer.from('%PDF-1.7'), 'application/pdf');
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
    expect(events).toEqual(['object', 'row']);
  });

  it('sniffs the first 4KB and removes bytes that do not match the expected MIME', async () => {
    const storage = new InMemoryStorage();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await storage.save('objects/upload-6', png, 'application/pdf');
    const read = vi.spyOn(storage, 'read');
    const pending = {
      id: 'upload-6',
      key: 'objects/upload-6',
      size: png.length,
      mime: 'application/pdf',
      ready: { id: 'upload-6' },
    };
    const remove = vi.fn().mockResolvedValue(undefined);
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
    expect(read).toHaveBeenCalledWith(pending.key, { start: 0, end: 4095 });
    expect(remove).toHaveBeenCalledWith(pending);
  });

  it('commits a verified pending upload and returns its domain result', async () => {
    const storage = new InMemoryStorage();
    const pdf = Buffer.from('%PDF-1.7\nverified');
    await storage.save('objects/upload-7', pdf, 'application/pdf');
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
  });

  it('reports a conflict when the verified pending row can no longer become ready', async () => {
    const storage = new InMemoryStorage();
    const pdf = Buffer.from('%PDF-1.7\nconflict');
    await storage.save('objects/upload-8', pdf, 'application/pdf');
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
    await storage.save('objects/upload-9', pdf, 'application/pdf');
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

  it.each(['object', 'row'] as const)(
    'still attempts both terminal cleanups when the %s delete fails',
    async (failingDelete) => {
      const storage = new InMemoryStorage();
      const bytes = Buffer.from('%PDF-1.7');
      await storage.save('objects/upload-cleanup', bytes, 'application/pdf');
      const objectDelete = vi.spyOn(storage, 'delete');
      if (failingDelete === 'object') objectDelete.mockRejectedValue(new Error('R2 down'));
      const pending = {
        id: 'upload-cleanup',
        key: 'objects/upload-cleanup',
        size: bytes.length + 1,
        mime: 'application/pdf',
        ready: { id: 'upload-cleanup' },
      };
      const rowDelete = vi.fn().mockResolvedValue(undefined);
      if (failingDelete === 'row') rowDelete.mockRejectedValue(new Error('DB down'));
      const adapter = adapterWith({
        inspect: vi.fn().mockResolvedValue({ kind: 'pending', upload: pending }),
        remove: rowDelete,
      });
      const uploads = createPresignedUploadModule({ adapter, storage });

      await expect(uploads.complete({ userId: 'user-1' }, pending.id)).resolves.toEqual({
        ok: false,
        reason: 'size-mismatch',
      });
      expect(objectDelete).toHaveBeenCalledWith(pending.key);
      expect(rowDelete).toHaveBeenCalledWith(pending);
    },
  );

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
    expect(events).toEqual(['rows', 'object:objects/a', 'object:objects/b']);
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
