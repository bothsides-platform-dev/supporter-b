'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar';

type Props = { workspaceId: string; name: string; hasLogo: boolean };

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg']);

export function WorkspaceLogoForm({ workspaceId, name, hasLogo }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState<'upload' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!ALLOWED_TYPES.has(file.type)) {
      setError('PNG 또는 JPEG 파일만 업로드할 수 있습니다.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('파일 크기는 5MB 이하여야 합니다.');
      return;
    }

    const form = new FormData();
    form.append('file', file);

    setLoading('upload');
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/avatar`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? '업로드에 실패했습니다.');
        return;
      }
      router.refresh();
    } finally {
      setLoading(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete() {
    setError(null);
    setLoading('delete');
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/avatar`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? '삭제에 실패했습니다.');
        return;
      }
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  const kvRowClass = 'py-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4';
  const kvLabelClass =
    'font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]';

  return (
    <div className={kvRowClass}>
      <span className={kvLabelClass}>프로필 사진</span>
      <div className="flex items-center gap-3 flex-1">
        <WorkspaceAvatar
          name={name}
          workspaceId={workspaceId}
          hasLogo={hasLogo}
          size="md"
        />

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          onChange={handleFileChange}
        />

        {loading === 'upload' ? (
          <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            업로드 중…
          </span>
        ) : loading === 'delete' ? (
          <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            삭제 중…
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-[12px] text-[var(--md-sys-color-on-surface-variant)] border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-extra-small)] px-2.5 py-1 hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
            >
              사진 변경
            </button>
            {hasLogo && (
              <button
                type="button"
                onClick={handleDelete}
                className="text-[12px] text-[var(--md-sys-color-error)] border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-extra-small)] px-2.5 py-1 hover:bg-[var(--md-sys-color-error-container)] transition-colors"
              >
                삭제
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-error)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
