'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { HTTPError } from 'ky';
import { Trash2 } from 'lucide-react';
import { uploadAttachment } from '@/lib/attachments/upload-client';
import { Label } from '@/components/primitives/Label';
import { http } from '@/lib/http';
import type { RfpMockFile } from '@/lib/stores/rfp-draft';
import { DRAFT_OWNER_ID, MAX_FILES } from '@/lib/server/storage/constants';
import { toast, toastManager } from '@/lib/toast';
import { formatSize } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

type Props = {
  value: RfpMockFile[];
  onChange: (files: RfpMockFile[]) => void;
  /** 튜토리얼 샌드박스 — 드롭한 파일을 실제 업로드 없이 로컬 ready 행으로만 처리한다. */
  sampleMode?: boolean;
};

const MAX_BYTES = 20 * 1024 * 1024;
const DELETE_UNDO_MS = 5000;
// Mirror the server allowlist (Step 11). Using a narrower client
// `accept` prevents users from selecting DOCX/XLSX/PPT and getting a
// 415 surprise — the UI now matches the upload route's contract.
const ACCEPT_EXT = '.pdf,.png,.jpg,.jpeg';
const ACCEPTED_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
]);

type RowState = RfpMockFile & {
  status: 'uploading' | 'ready' | 'error';
  error?: string;
};

export function RfpAttachmentDropzone({ value, onChange, sampleMode }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const deleteToastIdRef = useRef('');
  const pendingDeletesRef = useRef<RowState[]>([]);
  const rowSequenceRef = useRef(value.map((file) => file.id));
  const nextLocalIdRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [pendingDeleteCount, setPendingDeleteCount] = useState(0);
  // Local row state — extends the parent value with upload progress and
  // error messaging without leaking those into the form draft. The
  // parent's `value` array stays the source of truth for committed rows.
  const [rows, setRows] = useState<RowState[]>(() =>
    value.map((v) => ({ ...v, status: 'ready' as const })),
  );

  // Keep latest onChange in a ref so the sync effect doesn't depend on its
  // identity (parent passes an inline arrow that changes every render).
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(
    () => () => {
      if (deleteToastIdRef.current) toastManager.close(deleteToastIdRef.current);
    },
    [],
  );

  // Sync committed rows to the parent draft AFTER commit. Doing this inside
  // a setRows updater would make the updater impure: the Zustand setField
  // notifies subscribed components synchronously, triggering "Cannot update
  // a component (RfpCreateForm) while rendering a different component
  // (RfpAttachmentDropzone)" because React invokes the updater during render.
  const isFirstSyncRef = useRef(true);
  useEffect(() => {
    if (isFirstSyncRef.current) {
      isFirstSyncRef.current = false;
      return;
    }
    onChangeRef.current(rows.filter((r) => r.status === 'ready'));
  }, [rows]);

  const uploadOne = async (file: File, tempId: string): Promise<void> => {
    try {
      const body = await uploadAttachment(file, { ownerKind: 'rfp', ownerId: DRAFT_OWNER_ID })
      const sequenceIndex = rowSequenceRef.current.indexOf(tempId);
      if (sequenceIndex >= 0) rowSequenceRef.current[sequenceIndex] = body.id;
      setRows((prev) =>
        prev.map((row) =>
          row.id === tempId
            ? { id: body.id, name: body.name, size: body.size, status: 'ready' as const }
            : row,
        ),
      )
    } catch (err) {
      let msg = err instanceof Error ? err.message : '네트워크 오류'
      if (err instanceof HTTPError) {
        const { status } = err.response
        msg =
          status === 413
            ? '파일이 너무 큽니다 (최대 20MB)'
            : status === 415
              ? '지원되지 않는 파일 형식입니다 (PDF/PNG/JPEG만 허용)'
              : `업로드 실패 (${status})`
      }
      setRows((prev) =>
        prev.map((row) =>
          row.id === tempId ? { ...row, status: 'error' as const, error: msg } : row,
        ),
      )
    }
  };

  const addFiles = (fileList: FileList | null): void => {
    if (!fileList) return;
    const remaining = MAX_FILES - rows.length - pendingDeleteCount;
    if (remaining <= 0) return;
    const additions: RowState[] = [];
    for (let i = 0; i < Math.min(fileList.length, remaining); i++) {
      const f = fileList[i];
      if (rows.some((r) => r.name === f.name)) continue;
      // Cheap client checks (server still re-validates).
      if (!ACCEPTED_MIMES.has(f.type)) continue;
      if (f.size > MAX_BYTES) continue;
      nextLocalIdRef.current += 1;
      if (sampleMode) {
        // 튜토리얼 샌드박스 — 서버 업로드 없이 로컬 행만 만든다(실 R2 흔적 금지).
        additions.push({
          id: `sample-${nextLocalIdRef.current}`,
          name: f.name,
          size: f.size,
          status: 'ready',
        });
      } else {
        const tempId = `tmp-${nextLocalIdRef.current}`;
        additions.push({
          id: tempId,
          name: f.name,
          size: f.size,
          status: 'uploading',
        });
        void uploadOne(f, tempId);
      }
    }
    if (additions.length > 0) {
      rowSequenceRef.current.push(...additions.map((row) => row.id));
      setRows((prev) => [...prev, ...additions]);
    }
  };

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const removeRow = (rowId: string): void => {
    const removed = rows.find((row) => row.id === rowId);
    if (!removed || removed.status === 'uploading') return;

    setRows((prev) => prev.filter((row) => row.id !== rowId));
    pendingDeletesRef.current.push(removed);
    setPendingDeleteCount(pendingDeletesRef.current.length);

    let toastId = '';
    const pendingCount = pendingDeletesRef.current.length;
    toastId = toast(
      pendingCount === 1 ? '파일을 삭제했어요' : `파일 ${pendingCount}개를 삭제했어요`,
      {
        id: deleteToastIdRef.current || undefined,
        timeout: DELETE_UNDO_MS,
        onClose: () => {
          if (deleteToastIdRef.current !== toastId) return;
          deleteToastIdRef.current = '';
          const pending = pendingDeletesRef.current.splice(0);
          setPendingDeleteCount(0);
          for (const file of pending) {
            if (sampleMode || file.status !== 'ready') continue;
            void http.delete(`/api/files/${file.id}`).catch(() => {});
          }
        },
        action: {
          label: '되돌리기',
          onClick: () => {
            const pending = pendingDeletesRef.current.splice(0);
            setPendingDeleteCount(0);
            setRows((prev) => {
              const existingIds = new Set(prev.map((row) => row.id));
              return [...prev, ...pending.filter((row) => !existingIds.has(row.id))].sort(
                (a, b) =>
                  rowSequenceRef.current.indexOf(a.id) - rowSequenceRef.current.indexOf(b.id),
              );
            });
          },
        },
      },
    );
    deleteToastIdRef.current = toastId;
  };

  return (
    <div className="space-y-3">
      <Label size="md" muted={false}>견적 요청 첨부 파일 (선택)</Label>

      {rows.length + pendingDeleteCount < MAX_FILES && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            'border border-dashed border-[var(--md-sys-color-outline)] py-6 text-center cursor-pointer transition-colors',
            dragging ? 'bg-[var(--md-sys-color-surface-container-high)] border-[var(--md-sys-color-on-surface)]' : 'hover:border-[var(--md-sys-color-on-surface-variant)]',
          )}
        >
          {/* 지시문(주 톤·라벨 라지) / 힌트(보조 톤·라벨 스몰) 2단 —
              같은 톤·크기로 붙으면 위계가 사라진다(DESIGN.md §2). */}
          <p className="md-label-large text-[var(--md-sys-color-on-surface)]">
            파일을 끌어다 놓거나 클릭하여 첨부
          </p>
          <p className="md-label-small text-[var(--md-sys-color-on-surface-variant)] mt-1">
            PDF / PNG / JPEG · 최대 {MAX_FILES}개 · 20MB 이내
          </p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_EXT}
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />

      {rows.length > 0 && (
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          {rows.map((file, i) => (
            <div key={file.id} className="py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <span className="md-numeric text-xs text-[var(--md-sys-color-on-surface-variant)] shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-[13px] text-[var(--md-sys-color-on-surface)] truncate">{file.name}</span>
                <span className="md-numeric text-xs text-[var(--md-sys-color-on-surface-variant)] shrink-0">
                  {formatSize(file.size)}
                </span>
                {file.status === 'uploading' && (
                  <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)] shrink-0">
                    UPLOADING…
                  </span>
                )}
                {file.status === 'error' && (
                  <span
                    title={file.error}
                    className="md-label-small text-[var(--md-sys-color-error)] shrink-0"
                  >
                    ERROR
                  </span>
                )}
              </div>
              <button
                type="button"
                aria-label={`${file.name} 삭제`}
                onClick={() => removeRow(file.id)}
                disabled={file.status === 'uploading'}
                className="md-label-small h-8 inline-flex items-center gap-1.5 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-2.5 text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:border-[var(--md-sys-color-error)] hover:bg-[var(--md-sys-color-error-container)] hover:text-[var(--md-sys-color-on-error-container)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)] disabled:cursor-not-allowed disabled:opacity-40 shrink-0"
              >
                <Trash2 size={18} aria-hidden="true" />
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
