'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar';
import { toast } from '@/lib/toast';
import { errorLabel } from '@/lib/utils/error-label';

type Props = {
  workspaceId: string;
  name: string;
  logoUpdatedAt: string | null;
  /** 승인된 admin 만 로고를 바꿀 수 있다 — 라우트 게이트와 짝을 이루는 UI 게이트. */
  canEdit: boolean;
};

// 서버 코드 → 사용자 문구. 같은 패널의 WorkspaceNameForm·WorkspaceBizNoForm 과 같은
// 정책이다 — 미매핑 코드는 일반 문구로 흡수하고 내부 enum 은 절대 노출하지 않는다.
// 출처는 app/api/workspace/[id]/avatar/route.ts 의 `fail()` 호출들.
export const ERROR_LABELS: Record<string, string> = {
  UNAUTHENTICATED: '다시 로그인해 주세요.',
  // 이 라우트의 FORBIDDEN 은 두 원인(이메일 미인증·세션 워크스페이스 불일치)을
  // 함께 쓴다. 둘 다 사용자가 스스로 풀 수 있으므로 문제만 말하고 끝내지 않는다.
  FORBIDDEN: '지금은 바꿀 수 없어요. 이메일 인증과 워크스페이스를 확인해 주세요.',
  FORBIDDEN_NOT_ADMIN: '권한이 없어요. 워크스페이스 관리자에게 변경을 요청해 주세요.',
  INVALID_MULTIPART: '파일을 다시 선택해 주세요.',
  FILE_REQUIRED: '파일을 선택해 주세요.',
  EMPTY_FILE: '빈 파일이에요. 다른 파일을 올려 주세요.',
  FILE_TOO_LARGE: '5MB 이하 파일을 올려 주세요.',
  MIME_NOT_ALLOWED: 'PNG 또는 JPEG 파일만 올릴 수 있어요.',
  MIME_MISMATCH: '파일 내용이 형식과 달라요. 다른 파일을 올려 주세요.',
};

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg']);

export function WorkspaceLogoForm({ workspaceId, name, logoUpdatedAt, canEdit }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState<'upload' | 'delete' | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // 클라이언트 선검사와 서버 거부는 사용자에게 같은 상황이다 — 문구를 두 벌
    // 두면 같은 실패가 두 가지로 읽힌다. 서버 라벨을 그대로 재사용한다.
    if (!ALLOWED_TYPES.has(file.type)) {
      toast(ERROR_LABELS.MIME_NOT_ALLOWED, { type: 'error' });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast(ERROR_LABELS.FILE_TOO_LARGE, { type: 'error' });
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
        toast(errorLabel(ERROR_LABELS, json.error, '업로드에 실패했어요.'), {
          type: 'error',
        });
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
      const res = await fetch(`/api/workspace/${workspaceId}/avatar`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast(errorLabel(ERROR_LABELS, json.error, '삭제에 실패했어요.'), {
          type: 'error',
        });
        return;
      }
      toast('프로필 사진을 삭제했어요.');
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  const kvRowClass = 'py-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4';
  const kvLabelClass =
    'md-label-small text-[var(--md-sys-color-on-surface-variant)]';

  return (
    <div className={kvRowClass}>
      <span className={kvLabelClass}>프로필 사진</span>
      <div className="flex items-center gap-3 flex-1">
        <WorkspaceAvatar
          name={name}
          workspaceId={workspaceId}
          logoUpdatedAt={logoUpdatedAt}
          size="md"
        />

        {/* 권한이 없으면 파일 입력까지 렌더하지 않는다 — 버튼만 가리면 input 과
            onChange 핸들러가 DOM 에 남아, "누르면 반드시 실패하는 컨트롤은 그리지
            않는다"는 계약이 절반만 지켜진다. 서버가 권위이므로 권한 상승은 아니지만
            잔여 표면을 남길 이유가 없다. 아바타(읽기)는 아래에 그대로 남는다. */}
        {canEdit && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={handleFileChange}
            />

            {loading === 'upload' ? (
              <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
                업로드 중…
              </span>
            ) : loading === 'delete' ? (
              <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
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
                {logoUpdatedAt != null && (
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
          </>
        )}
      </div>
    </div>
  );
}
