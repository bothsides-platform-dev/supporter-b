// uploadAttachment — shared client-side 3-step presigned upload flow.
//
// 1. POST /api/files/presign with the file's declared metadata → server
//    creates a pending attachment row and mints a presigned PUT url.
// 2. PUT the raw bytes directly to R2 via the presigned url (raw `fetch`,
//    not the `ky` client — this crosses to an external origin so ky's
//    same-origin credential/retry defaults don't apply and shouldn't).
// 3. POST /api/files/{id}/complete — server independently re-verifies the
//    object landed (size + magic-byte sniff) and flips the row to `ready`.
//
// If step 2 or 3 fails, no extra cleanup call is made here — an
// incomplete `pending` row is inert (invisible to every read path) and is
// reclaimed by the server sweeper (`attachmentRepo.deleteStalePending`,
// 1h cutoff).
import { http } from '@/lib/http';
import { runPresignedUpload } from '@/lib/presigned-upload/client';

export type UploadedAttachment = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
};

export async function uploadAttachment(
  file: File,
  opts: { ownerKind: string; ownerId: string },
): Promise<UploadedAttachment> {
  return runPresignedUpload({
    file,
    contentType: file.type,
    presign: () =>
      http
        .post('/api/files/presign', {
          json: {
            ownerKind: opts.ownerKind,
            ownerId: opts.ownerId,
            name: file.name,
            size: file.size,
            mime: file.type,
          },
        })
        .json<{ id: string; uploadUrl: string }>(),
    complete: (id) => http.post(`/api/files/${id}/complete`).json<UploadedAttachment>(),
  });
}
