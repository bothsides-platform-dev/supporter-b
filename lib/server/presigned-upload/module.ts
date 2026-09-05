import type { Storage } from '@/lib/server/storage/types';
import { sniffMime } from '@/lib/server/storage/sniff';
import { randomUUID } from 'node:crypto';

const PRESIGN_PUT_TTL_SECONDS = 600;
const SNIFF_BYTES = 4096;

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

export type PendingUpload<TReady> = {
  id: string;
  key: string;
  size: number;
  mime: string;
  ready: TReady;
};

export interface PresignedUploadAdapter<TActor, TInput, TReady, TRejection> {
  createPending(
    actor: TActor,
    input: TInput,
    id: string,
  ): Promise<
    | { kind: 'pending'; upload: PendingUpload<TReady> }
    | { kind: 'rejected'; reason: TRejection }
  >;
  inspect(
    actor: TActor,
    id: string,
  ): Promise<
    | { kind: 'pending'; upload: PendingUpload<TReady> }
    | { kind: 'ready'; value: TReady }
    | { kind: 'rejected'; reason: TRejection }
  >;
  commitReady(
    upload: PendingUpload<TReady>,
  ): Promise<'committed' | 'already-ready' | 'conflict'>;
  remove(upload: PendingUpload<TReady>): Promise<void>;
  takeStale(cutoff: Date, limit: number): Promise<Array<{ key: string | null }>>;
}

export function createPresignedUploadModule<TActor, TInput, TReady, TRejection>(deps: {
  adapter: PresignedUploadAdapter<TActor, TInput, TReady, TRejection>;
  storage: Storage;
  createId?: () => string;
}) {
  async function removeInvalid(upload: PendingUpload<TReady>): Promise<void> {
    await deps.storage.delete(upload.key).catch(() => {});
    await deps.adapter.remove(upload).catch(() => {});
  }

  return {
    async begin(actor: TActor, input: TInput) {
      const id = (deps.createId ?? randomUUID)();
      const created = await deps.adapter.createPending(actor, input, id);
      if (created.kind === 'rejected') {
        return { ok: false as const, reason: created.reason };
      }

      try {
        const uploadUrl = await deps.storage.presignPut(created.upload.key, {
          mime: created.upload.mime,
          size: created.upload.size,
          expiresInSeconds: PRESIGN_PUT_TTL_SECONDS,
        });
        return { ok: true as const, id: created.upload.id, uploadUrl };
      } catch {
        await deps.adapter.remove(created.upload).catch(() => {});
        return { ok: false as const, reason: 'presign-failed' as const };
      }
    },
    async complete(actor: TActor, id: string) {
      const inspected = await deps.adapter.inspect(actor, id);
      if (inspected.kind === 'ready') {
        return { ok: true as const, value: inspected.value };
      }
      if (inspected.kind === 'rejected') {
        return { ok: false as const, reason: inspected.reason };
      }

      let head: { size: number };
      try {
        head = await deps.storage.head(inspected.upload.key);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return { ok: false as const, reason: 'not-uploaded' as const };
        }
        throw error;
      }
      if (head.size !== inspected.upload.size) {
        await removeInvalid(inspected.upload);
        return { ok: false as const, reason: 'size-mismatch' as const };
      }

      const { stream } = await deps.storage.read(inspected.upload.key, {
        start: 0,
        end: SNIFF_BYTES - 1,
      });
      const sniffed = sniffMime(await readAll(stream));
      if (sniffed !== inspected.upload.mime) {
        await removeInvalid(inspected.upload);
        return { ok: false as const, reason: 'mime-mismatch' as const };
      }
      const committed = await deps.adapter.commitReady(inspected.upload);
      if (committed === 'conflict') {
        return { ok: false as const, reason: 'conflict' as const };
      }
      return { ok: true as const, value: inspected.upload.ready };
    },
    async sweep(cutoff: Date, limit: number) {
      const stale = await deps.adapter.takeStale(cutoff, limit);
      let deletedObjects = 0;
      for (const upload of stale) {
        if (!upload.key) continue;
        try {
          await deps.storage.delete(upload.key);
          deletedObjects += 1;
        } catch {
          // The row is already gone. Leave a deterministically named orphan
          // for storage lifecycle cleanup and continue the bounded batch.
        }
      }
      return { deletedRows: stale.length, deletedObjects };
    },
  };
}
