'use client';

import { useRef, useState, useTransition } from 'react';
import { HTTPError } from 'ky';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { underlineInputClass } from '@/components/forms/inputs';
import { uploadAttachment } from '@/lib/attachments/upload-client';
import { DRAFT_OWNER_ID } from '@/lib/server/storage/constants';
import { saveContractTemplateAction } from '@/lib/server/actions/contract-template';
import { formatSize } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

const ACCEPTED_MIME = 'application/pdf';
const MAX_BYTES = 20 * 1024 * 1024;

const ERROR_LABELS: Record<string, string> = {
  INVALID_INPUT: '입력 값을 확인해주세요.',
  LIMIT_REACHED: '계약서 템플릿은 최대 20개까지 저장할 수 있어요.',
  FORBIDDEN: '권한이 없습니다.',
};

type UploadStatus = 'idle' | 'uploading' | 'ready' | 'error';

export function ContractTemplateUploadDrawer({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [file, setFile] = useState<{ id: string; name: string; size: number } | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleFile = (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setFile(null);
    if (f.type !== ACCEPTED_MIME) {
      setUploadStatus('error');
      setUploadError('PDF 파일만 업로드할 수 있어요');
      return;
    }
    if (f.size > MAX_BYTES) {
      setUploadStatus('error');
      setUploadError('파일이 너무 커요 (최대 20MB)');
      return;
    }
    setUploadStatus('uploading');
    setUploadError(null);
    uploadAttachment(f, { ownerKind: 'contract_template', ownerId: DRAFT_OWNER_ID })
      .then((body) => {
        setFile({ id: body.id, name: body.name, size: body.size });
        setUploadStatus('ready');
      })
      .catch((err) => {
        let msg = err instanceof Error ? err.message : '네트워크 오류';
        if (err instanceof HTTPError) {
          const status = err.response.status;
          msg =
            status === 413
              ? '파일이 너무 큽니다 (최대 20MB)'
              : status === 415
                ? 'PDF 파일만 업로드할 수 있어요'
                : `업로드 실패 (${status})`;
        }
        setUploadStatus('error');
        setUploadError(msg);
      });
  };

  const canSave = Boolean(name.trim()) && uploadStatus === 'ready' && !!file && !pending;

  const handleSave = () => {
    if (!canSave || !file) return;
    setError(null);
    startTransition(async () => {
      const r = await saveContractTemplateAction({ name: name.trim(), attachmentId: file.id });
      if (r.ok) {
        onSaved();
      } else {
        setError(r.error);
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto border-l border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] shadow-lg"
    >
      <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] px-5 py-4">
        <h2 className="text-[16px] font-[600] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          새 계약서 템플릿
        </h2>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        {error && (
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--md-sys-color-error)]">
            {ERROR_LABELS[error] ?? error}
          </p>
        )}

        <div className="space-y-1">
          <Label size="md" muted={false}>
            템플릿 이름
          </Label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="템플릿 이름"
            maxLength={80}
            className={cn(underlineInputClass)}
          />
        </div>

        <div className="space-y-2">
          <Label size="md" muted={false}>
            계약서 PDF
          </Label>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="block w-full text-[13px] text-[var(--md-sys-color-on-surface-variant)] file:mr-3 file:rounded-[var(--md-sys-shape-small)] file:border file:border-[var(--md-sys-color-outline-variant)] file:bg-transparent file:px-2.5 file:py-1.5 file:text-[13px] file:text-[var(--md-sys-color-on-surface)]"
          />
          {uploadStatus === 'uploading' && (
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--md-sys-color-outline)]">
              업로드 중…
            </p>
          )}
          {uploadStatus === 'ready' && file && (
            <p className="text-[12px] text-[var(--md-sys-color-tertiary)]">
              {file.name} · {formatSize(file.size)}
            </p>
          )}
          {uploadStatus === 'error' && uploadError && (
            <p className="text-[12px] text-[var(--md-sys-color-error)]">{uploadError}</p>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-t border-[var(--md-sys-color-outline-variant)] px-5 py-4">
        <Button type="button" size="sm" onClick={handleSave} disabled={!canSave}>
          저장
        </Button>
        <Button type="button" size="sm" variant="text" onClick={onClose}>
          취소
        </Button>
      </div>
    </div>
  );
}
