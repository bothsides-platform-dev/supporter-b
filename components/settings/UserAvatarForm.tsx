'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/primitives/Avatar';
import { toast } from '@/lib/toast';
import { Button } from '@/components/primitives/Button';

type Props = { userId: string; name: string; email: string; avatarUpdatedAt: string | null };

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg']);

export function UserAvatarForm({ userId, name, email, avatarUpdatedAt }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState<'upload' | 'delete' | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.has(file.type)) {
      toast('PNG 또는 JPEG 파일을 업로드해요.', { type: 'error' });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast('5MB 이하 파일을 올려요.', { type: 'error' });
      return;
    }
    const form = new FormData();
    form.append('file', file);
    setLoading('upload');
    try {
      const res = await fetch('/api/user/avatar', { method: 'POST', body: form });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast(json.error ?? '업로드에 실패했어요.', { type: 'error' });
        return;
      }
      toast('프로필 사진을 변경했어요.');
      router.refresh();
    } finally {
      setLoading(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete() {
    setLoading('delete');
    try {
      const res = await fetch('/api/user/avatar', { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast(json.error ?? '삭제에 실패했어요.', { type: 'error' });
        return;
      }
      toast('프로필 사진을 삭제했어요.');
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex min-w-0 items-start gap-3 sm:items-center">
      <Avatar name={name} userId={userId} avatarUpdatedAt={avatarUpdatedAt} color="primary" size="lg" />
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={handleFileChange}
      />
      <div className="min-w-0 space-y-2">
        <div>
          <p className="text-[14px] font-medium text-[var(--md-sys-color-on-surface)]">{name}</p>
          <p className="md-numeric text-[13px] text-[var(--md-sys-color-on-surface-variant)] [overflow-wrap:anywhere]">{email}</p>
        </div>
        {loading === 'upload' ? (
          <span className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">업로드 중…</span>
        ) : loading === 'delete' ? (
          <span className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">삭제 중…</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outlined" size="sm" onClick={() => inputRef.current?.click()}>
              사진 변경
            </Button>
            {avatarUpdatedAt != null && (
              <Button type="button" variant="text" size="sm" color="error" onClick={handleDelete}>
                삭제
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
