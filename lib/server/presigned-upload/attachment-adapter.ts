import { DRAFT_OWNER_ID } from '@/lib/server/storage/path';
import { MAX_BYTES } from '@/lib/server/storage/constants';
import {
  getAttachmentRepo,
  getBidRepo,
  getInvitationRepo,
  getRfpRepo,
} from '@/lib/server/repositories/factory';
import type { PresignedUploadAdapter, PendingUpload } from './module';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ATTACHMENT_OWNER_KINDS = [
  'rfp',
  'bid_proposal',
  'bid_note',
  'chat',
  'team_message',
] as const;

export const ATTACHMENT_ACCEPTED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
] as const;

export type AttachmentOwnerKind = (typeof ATTACHMENT_OWNER_KINDS)[number];
export type AttachmentUploadActor = {
  userId: string;
  workspaceId?: string;
  workspaceType?: 'buyer' | 'pg';
};
export type AttachmentUploadInput = {
  ownerKind: AttachmentOwnerKind;
  ownerId: string;
  name: string;
  size: number;
  mime: string;
};
export type UploadedAttachment = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
};
export type AttachmentCreateRejection =
  | 'forbidden'
  | 'rfp-not-found'
  | 'bid-not-found'
  | 'file-too-large'
  | 'mime-not-allowed';
export type AttachmentInspectRejection = 'forbidden' | 'not-found';

const ACCEPTED_MIME = new Set<string>(ATTACHMENT_ACCEPTED_MIME);

async function authorize(
  actor: AttachmentUploadActor,
  input: Pick<AttachmentUploadInput, 'ownerKind' | 'ownerId'>,
): Promise<
  | { ok: true; rfpLink: { rfpId?: string } }
  | { ok: false; reason: AttachmentCreateRejection }
> {
  const wsId = actor.workspaceId;
  const wsType = actor.workspaceType;

  if (input.ownerKind === 'rfp') {
    if (wsType !== 'buyer' || !wsId) {
      return { ok: false, reason: 'forbidden' };
    }
    if (input.ownerId !== DRAFT_OWNER_ID) {
      const rfp = await (await getRfpRepo()).findById(input.ownerId);
      if (!rfp) return { ok: false, reason: 'rfp-not-found' };
      if (rfp.buyerWsId !== wsId) {
        return { ok: false, reason: 'forbidden' };
      }
    }
  } else if (input.ownerKind === 'chat') {
    if (!wsId) return { ok: false, reason: 'forbidden' };
  } else if (input.ownerKind === 'bid_note') {
    if (wsType !== 'buyer' || !wsId) {
      return { ok: false, reason: 'forbidden' };
    }
    const row = await (await getBidRepo()).findRfpOwner(input.ownerId);
    if (!row) return { ok: false, reason: 'bid-not-found' };
    if (row.buyerWsId !== wsId) {
      return { ok: false, reason: 'forbidden' };
    }
  } else if (input.ownerKind === 'team_message') {
    if (!wsId) return { ok: false, reason: 'forbidden' };
    if (wsType === 'buyer') {
      const rfp = await (await getRfpRepo()).findById(input.ownerId);
      if (!rfp) return { ok: false, reason: 'rfp-not-found' };
      if (rfp.buyerWsId !== wsId) {
        return { ok: false, reason: 'forbidden' };
      }
    } else if (!(await (await getInvitationRepo()).canAccess(input.ownerId, wsId))) {
      return { ok: false, reason: 'forbidden' };
    }
  } else {
    if (wsType !== 'pg' || !wsId) {
      return { ok: false, reason: 'forbidden' };
    }
    if (!(await (await getInvitationRepo()).canAccess(input.ownerId, wsId))) {
      return { ok: false, reason: 'forbidden' };
    }
  }

  return {
    ok: true,
    rfpLink:
      input.ownerKind === 'rfp' && input.ownerId !== DRAFT_OWNER_ID
        ? { rfpId: input.ownerId }
        : {},
  };
}

function descriptor(row: {
  id: string;
  name: string;
  size: number;
  mimeType: string;
}): PendingUpload<UploadedAttachment> {
  return {
    id: row.id,
    key: row.id,
    size: row.size,
    mime: row.mimeType,
    ready: {
      id: row.id,
      name: row.name,
      size: row.size,
      mimeType: row.mimeType,
    },
  };
}

export function createAttachmentUploadAdapter(): PresignedUploadAdapter<
  AttachmentUploadActor,
  AttachmentUploadInput,
  UploadedAttachment,
  AttachmentCreateRejection,
  AttachmentInspectRejection
> {
  return {
    async createPending(actor, input, id) {
      if (input.size > MAX_BYTES) {
        return { kind: 'rejected', reason: 'file-too-large' };
      }
      if (!ACCEPTED_MIME.has(input.mime)) {
        return { kind: 'rejected', reason: 'mime-not-allowed' };
      }
      const authz = await authorize(actor, input);
      if (!authz.ok) return { kind: 'rejected', reason: authz.reason };

      const repo = await getAttachmentRepo();
      await repo.save({
        id,
        name: input.name,
        size: input.size,
        mimeType: input.mime,
        uploadedBy: actor.userId,
        url: '',
        status: 'pending',
        ...authz.rfpLink,
      });
      return { kind: 'pending', upload: descriptor({ ...input, id, mimeType: input.mime }) };
    },
    async inspect(actor, id) {
      if (!UUID_RE.test(id)) {
        return { kind: 'rejected', reason: 'not-found' };
      }
      const row = await (await getAttachmentRepo()).findById(id);
      if (!row) return { kind: 'rejected', reason: 'not-found' };
      if (row.uploadedBy !== actor.userId) {
        return { kind: 'rejected', reason: 'forbidden' };
      }
      const upload = descriptor(row);
      return row.status === 'ready'
        ? { kind: 'ready', value: upload.ready }
        : { kind: 'pending', upload };
    },
    async commitReady(upload) {
      const repo = await getAttachmentRepo();
      if (await repo.markReady(upload.id)) return 'committed';
      const current = await repo.findById(upload.id);
      return current?.status === 'ready' ? 'already-ready' : 'conflict';
    },
    async remove(upload) {
      return (await getAttachmentRepo()).removePending(upload.id);
    },
    async takeStale(cutoff, limit) {
      const ids = await (await getAttachmentRepo()).deleteStalePending(cutoff, limit);
      return ids.map((key) => ({ key }));
    },
  };
}
