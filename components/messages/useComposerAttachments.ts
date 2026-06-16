'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { HTTPError } from 'ky';
import { http } from '@/lib/http';
import {
  MAX_FILES,
  MAX_BYTES,
  ACCEPTED_MIMES,
  ACCEPTED_EXTENSIONS,
} from '@/lib/server/storage/constants';

// 컴포저 첨부 행. `id` 는 업로드 중에는 임시값(status==='uploading'), 완료되면 서버
// attachment id 로 교체된다. ThreadView·TeamThreadView·MessageComposeSheet 공용 모델.
export type ComposerAttachment = {
  id: string;
  name: string;
  size?: number;
  mimeType?: string;
  url?: string;
  status: 'uploading' | 'ready' | 'error';
  error?: string;
};

// 클라이언트 확장자/MIME 거부 메시지(전 컴포저 동일).
const UNSUPPORTED = '지원되지 않는 파일 형식이에요 (PDF/PNG/JPEG)';

// 기본 업로드 에러 매퍼 = ThreadView/TeamThreadView 동작(415 + 일반 + 비-HTTP '업로드 실패').
// MessageComposeSheet 는 413·다른 문구가 있어 자체 매퍼를 주입한다.
function defaultUploadError(err: unknown): string {
  if (err instanceof HTTPError) {
    return err.response.status === 415
      ? '지원되지 않는 파일 형식이에요'
      : `업로드 실패 (${err.response.status})`;
  }
  return '업로드 실패';
}

export type UseComposerAttachments = {
  rows: ComposerAttachment[];
  setRows: Dispatch<SetStateAction<ComposerAttachment[]>>;
  addFiles: (list: FileList | null) => void;
  removeRow: (id: string) => void;
  clear: () => void;
  readyRows: ComposerAttachment[];
  anyUploading: boolean;
};

export function useComposerAttachments({
  ownerKind,
  ownerId,
  dedupeByName = false,
  mapUploadError = defaultUploadError,
}: {
  // ownerKind/ownerId 는 sealed-bid ACL 경계 — 서버가 ownerKind 별로 권한을 강제한다.
  // 호출처(컴포저)가 반드시 자기 값을 주입한다(하드코딩 금지).
  ownerKind: string;
  ownerId: string;
  dedupeByName?: boolean;
  mapUploadError?: (err: unknown) => string;
}): UseComposerAttachments {
  const [rows, setRows] = useState<ComposerAttachment[]>([]);

  async function uploadOne(file: File, tempId: string): Promise<void> {
    const form = new FormData();
    form.append('file', file);
    form.append('ownerKind', ownerKind);
    form.append('ownerId', ownerId);
    try {
      const body = await http
        .post('/api/files/upload', { body: form })
        .json<{ id: string; name: string; size: number; mimeType?: string }>();
      // 임시 행을 서버 첨부로 교체(스켈레톤 → 일반 칩).
      setRows((prev) =>
        prev.map((a) =>
          a.id === tempId
            ? {
                id: body.id,
                name: body.name,
                size: body.size,
                mimeType: body.mimeType,
                url: `/api/files/${body.id}`,
                status: 'ready',
              }
            : a,
        ),
      );
    } catch (err) {
      const msg = mapUploadError(err);
      setRows((prev) =>
        prev.map((a) => (a.id === tempId ? { ...a, status: 'error', error: msg } : a)),
      );
    }
  }

  function addFiles(list: FileList | null): void {
    if (!list) return;
    const remaining = MAX_FILES - rows.length;
    if (remaining <= 0) return;
    const additions: ComposerAttachment[] = [];
    for (let i = 0; i < Math.min(list.length, remaining); i++) {
      const f = list[i];
      if (dedupeByName && rows.some((r) => r.name === f.name)) continue;
      const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
      const tempId = `tmp-${Math.random().toString(36).slice(2, 10)}`;
      if (!ACCEPTED_MIMES.has(f.type) && !ACCEPTED_EXTENSIONS.has(ext)) {
        additions.push({ id: tempId, name: f.name, size: f.size, status: 'error', error: UNSUPPORTED });
        continue;
      }
      if (f.size > MAX_BYTES) continue;
      // 선택 즉시 'uploading' 행(스켈레톤)을 추가해 올리는 중임을 보여준다.
      additions.push({ id: tempId, name: f.name, size: f.size, status: 'uploading' });
      void uploadOne(f, tempId);
    }
    if (additions.length > 0) setRows((prev) => [...prev, ...additions]);
  }

  function removeRow(id: string): void {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function clear(): void {
    setRows([]);
  }

  const readyRows = rows.filter((r) => r.status === 'ready');
  const anyUploading = rows.some((r) => r.status === 'uploading');

  return { rows, setRows, addFiles, removeRow, clear, readyRows, anyUploading };
}

// 낙관적 전송 스냅샷 — 메타가 완비된 ready 행만 메시지 첨부 모양으로 변환
// (ThreadView/TeamThreadView 의 전송 시점 표시용; reload 불필요).
export function toReadyMessageAttachments(
  rows: ComposerAttachment[],
): { id: string; name: string; size: number; mimeType: string; url: string }[] {
  return rows.flatMap((a) =>
    a.size !== undefined && a.mimeType && a.url
      ? [{ id: a.id, name: a.name, size: a.size, mimeType: a.mimeType, url: a.url }]
      : [],
  );
}
