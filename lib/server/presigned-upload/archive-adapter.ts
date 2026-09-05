import {
  ARCHIVE_UPLOAD_CAP_PER_WORKSPACE,
  MAX_ARCHIVE_DOC_BYTES,
} from '@/lib/contract-archive/limits';
import { getContractArchiveRepo } from '@/lib/server/repositories/factory';
import { archiveUploadKey } from '@/lib/contract-archive/storage-key';
import type { PendingUpload, PresignedUploadAdapter } from './module';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ArchiveUploadActor = { userId: string; workspaceId?: string };
export type ArchiveUploadInput = {
  name: string;
  size: number;
  title: string;
  counterpartyName?: string;
  contractedAt?: Date | null;
};
export type ArchiveUploadReady = { id: string };
export type ArchiveUploadRejection =
  | 'forbidden'
  | 'file-too-large'
  | 'upload-limit'
  | 'not-found'
  | 'invalid-state';

function descriptor(row: {
  id: string;
  documentKey: string | null;
  documentSize: number | null;
}): PendingUpload<ArchiveUploadReady> | undefined {
  if (!row.documentKey || row.documentSize === null) return undefined;
  return {
    id: row.id,
    key: row.documentKey,
    size: row.documentSize,
    mime: 'application/pdf',
    ready: { id: row.id },
  };
}

export function createArchiveUploadAdapter(): PresignedUploadAdapter<
  ArchiveUploadActor,
  ArchiveUploadInput,
  ArchiveUploadReady,
  ArchiveUploadRejection
> {
  return {
    async createPending(actor, input, id) {
      if (!actor.workspaceId) {
        return { kind: 'rejected', reason: 'forbidden' };
      }
      if (input.size > MAX_ARCHIVE_DOC_BYTES) {
        return { kind: 'rejected', reason: 'file-too-large' };
      }
      const repo = await getContractArchiveRepo();
      if ((await repo.countUploadsByWorkspace(actor.workspaceId)) >= ARCHIVE_UPLOAD_CAP_PER_WORKSPACE) {
        return { kind: 'rejected', reason: 'upload-limit' };
      }
      const key = archiveUploadKey(id);
      await repo.insertPendingUpload({
        id,
        workspaceId: actor.workspaceId,
        title: input.title,
        counterpartyName: input.counterpartyName ?? null,
        contractedAt: input.contractedAt ?? null,
        documentKey: key,
        documentName: input.name,
        documentSize: input.size,
        createdBy: actor.userId,
      });
      return {
        kind: 'pending',
        upload: {
          id,
          key,
          size: input.size,
          mime: 'application/pdf',
          ready: { id },
        },
      };
    },
    async inspect(actor, id) {
      if (!UUID_RE.test(id)) {
        return { kind: 'rejected', reason: 'not-found' };
      }
      const row = await (await getContractArchiveRepo()).findById(id);
      if (!row || row.source !== 'upload' || row.createdBy !== actor.userId) {
        return { kind: 'rejected', reason: 'not-found' };
      }
      const upload = descriptor(row);
      if (!upload) {
        return { kind: 'rejected', reason: 'invalid-state' };
      }
      return row.status === 'ready'
        ? { kind: 'ready', value: upload.ready }
        : { kind: 'pending', upload };
    },
    async commitReady(upload) {
      const repo = await getContractArchiveRepo();
      if (await repo.markUploadReady(upload.id)) return 'committed';
      const current = await repo.findById(upload.id);
      return current?.source === 'upload' && current.status === 'ready'
        ? 'already-ready'
        : 'conflict';
    },
    async remove(upload) {
      await (await getContractArchiveRepo()).removeUpload(upload.id);
    },
    async takeStale(cutoff, limit) {
      const stale = await (await getContractArchiveRepo()).deleteStaleUploadPending(cutoff, limit);
      return stale.map((row) => ({ key: row.documentKey }));
    },
  };
}
