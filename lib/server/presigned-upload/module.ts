import type { Storage } from '@/lib/server/storage/types';
import { sniffMime } from '@/lib/server/storage/sniff';
import { randomUUID } from 'node:crypto';

const PRESIGN_PUT_TTL_SECONDS = 600;
const SNIFF_BYTES = 4096;

function stagingKey(finalKey: string): string {
  return `pending/${finalKey}`;
}

function isStorageCode(error: unknown, code: 'ENOENT' | 'ESTALE'): boolean {
  return (error as NodeJS.ErrnoException).code === code;
}

export type PendingUpload<TReady> = {
  id: string;
  key: string;
  size: number;
  mime: string;
  ready: TReady;
};

export interface PresignedUploadAdapter<
  TActor,
  TInput,
  TReady,
  TCreateRejection,
  TInspectRejection = TCreateRejection,
> {
  createPending(
    actor: TActor,
    input: TInput,
    id: string,
  ): Promise<
    | { kind: 'pending'; upload: PendingUpload<TReady> }
    | { kind: 'rejected'; reason: TCreateRejection }
  >;
  inspect(
    actor: TActor,
    id: string,
  ): Promise<
    | { kind: 'pending'; upload: PendingUpload<TReady> }
    | { kind: 'ready'; value: TReady }
    | { kind: 'rejected'; reason: TInspectRejection }
  >;
  commitReady(
    upload: PendingUpload<TReady>,
  ): Promise<'committed' | 'already-ready' | 'conflict'>;
  /** Delete only while the domain row is still pending. */
  remove(upload: PendingUpload<TReady>): Promise<boolean>;
  takeStale(cutoff: Date, limit: number): Promise<Array<{ key: string | null }>>;
}

export function createPresignedUploadModule<
  TActor,
  TInput,
  TReady,
  TCreateRejection,
  TInspectRejection,
>(deps: {
  adapter: PresignedUploadAdapter<
    TActor,
    TInput,
    TReady,
    TCreateRejection,
    TInspectRejection
  >;
  storage: Storage;
  createId?: () => string;
}) {
  async function removeInvalid(upload: PendingUpload<TReady>): Promise<boolean> {
    await deps.storage.delete(stagingKey(upload.key)).catch(() => {});
    const removed = await deps.adapter.remove(upload).catch(() => false);
    if (!removed) return false;
    await deps.storage.delete(upload.key).catch(() => {});
    return true;
  }

  return {
    async begin(actor: TActor, input: TInput) {
      const id = (deps.createId ?? randomUUID)();
      const created = await deps.adapter.createPending(actor, input, id);
      if (created.kind === 'rejected') {
        return { ok: false as const, reason: created.reason };
      }

      try {
        const uploadUrl = await deps.storage.presignPut(stagingKey(created.upload.key), {
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

      const sourceKey = stagingKey(inspected.upload.key);
      let head: { size: number; version: string };
      try {
        head = await deps.storage.head(sourceKey);
      } catch (error) {
        if (isStorageCode(error, 'ENOENT')) {
          const current = await deps.adapter.inspect(actor, id);
          if (current.kind === 'ready') {
            return { ok: true as const, value: current.value };
          }
          if (current.kind === 'rejected') {
            return { ok: false as const, reason: current.reason };
          }
          return { ok: false as const, reason: 'not-uploaded' as const };
        }
        throw error;
      }
      if (head.size !== inspected.upload.size) {
        if (!(await removeInvalid(inspected.upload))) {
          return { ok: false as const, reason: 'conflict' as const };
        }
        return { ok: false as const, reason: 'size-mismatch' as const };
      }

      let stream: ReadableStream<Uint8Array>;
      try {
        ({ stream } = await deps.storage.read(sourceKey, {
          start: 0,
          end: SNIFF_BYTES - 1,
          expectedVersion: head.version,
        }));
      } catch (error) {
        if (isStorageCode(error, 'ESTALE')) {
          return { ok: false as const, reason: 'conflict' as const };
        }
        if (isStorageCode(error, 'ENOENT')) {
          const current = await deps.adapter.inspect(actor, id);
          return current.kind === 'ready'
            ? { ok: true as const, value: current.value }
            : { ok: false as const, reason: 'conflict' as const };
        }
        throw error;
      }
      const sniffed = sniffMime(Buffer.from(await new Response(stream).arrayBuffer()));
      if (sniffed !== inspected.upload.mime) {
        if (!(await removeInvalid(inspected.upload))) {
          return { ok: false as const, reason: 'conflict' as const };
        }
        return { ok: false as const, reason: 'mime-mismatch' as const };
      }
      try {
        await deps.storage.promote(sourceKey, inspected.upload.key, head.version);
      } catch (error) {
        if (isStorageCode(error, 'ESTALE')) {
          // Another completion may already have won the create-only final key
          // but crashed before committing the row. Revalidate that immutable
          // winner and allow this request to finish the DB transition.
          let finalHead: { size: number; version: string };
          try {
            finalHead = await deps.storage.head(inspected.upload.key);
          } catch (headError) {
            if (isStorageCode(headError, 'ENOENT')) {
              return { ok: false as const, reason: 'conflict' as const };
            }
            throw headError;
          }
          if (finalHead.size !== inspected.upload.size) {
            if (!(await removeInvalid(inspected.upload))) {
              return { ok: false as const, reason: 'conflict' as const };
            }
            return { ok: false as const, reason: 'size-mismatch' as const };
          }
          let finalStream: ReadableStream<Uint8Array>;
          try {
            ({ stream: finalStream } = await deps.storage.read(inspected.upload.key, {
              start: 0,
              end: SNIFF_BYTES - 1,
              expectedVersion: finalHead.version,
            }));
          } catch (readError) {
            if (
              isStorageCode(readError, 'ENOENT') ||
              isStorageCode(readError, 'ESTALE')
            ) {
              return { ok: false as const, reason: 'conflict' as const };
            }
            throw readError;
          }
          const finalMime = sniffMime(
            Buffer.from(await new Response(finalStream).arrayBuffer()),
          );
          if (finalMime !== inspected.upload.mime) {
            if (!(await removeInvalid(inspected.upload))) {
              return { ok: false as const, reason: 'conflict' as const };
            }
            return { ok: false as const, reason: 'mime-mismatch' as const };
          }
        }
        else if (isStorageCode(error, 'ENOENT')) {
          const current = await deps.adapter.inspect(actor, id);
          return current.kind === 'ready'
            ? { ok: true as const, value: current.value }
            : { ok: false as const, reason: 'conflict' as const };
        } else {
          throw error;
        }
      }
      const committed = await deps.adapter.commitReady(inspected.upload);
      if (committed === 'conflict') {
        await deps.storage.delete(inspected.upload.key).catch(() => {});
        await deps.storage.delete(sourceKey).catch(() => {});
        return { ok: false as const, reason: 'conflict' as const };
      }
      await deps.storage.delete(sourceKey).catch(() => {});
      return { ok: true as const, value: inspected.upload.ready };
    },
    async sweep(cutoff: Date, limit: number) {
      const stale = await deps.adapter.takeStale(cutoff, limit);
      let deletedObjects = 0;
      for (const upload of stale) {
        if (!upload.key) continue;
        const outcomes = await Promise.allSettled([
          deps.storage.delete(stagingKey(upload.key)),
          deps.storage.delete(upload.key),
        ]);
        if (outcomes.every((outcome) => outcome.status === 'fulfilled')) {
          deletedObjects += 1;
        } else {
          // The row is already gone. Leave a deterministically named orphan
          // for storage lifecycle cleanup and continue the bounded batch.
        }
      }
      return { deletedRows: stale.length, deletedObjects };
    },
  };
}
