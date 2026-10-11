'use client';
import { useState } from 'react';
import { Button } from '@/components/primitives/Button';
import { guestFiles } from '@/lib/guest-rfp/files';
import { validateGuestFile } from '@/lib/guest-rfp/draft';
import type { GuestSession } from './useGuestDraft';
import { ACCEPT_EXT } from '@/lib/server/storage/constants';
export function GuestAttachments({
  session,
  busy,
  setBusy,
  onError,
}: {
  session: GuestSession;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onError: (s: string) => void;
}) {
  const [revision, refresh] = useState(0);
  const failed = session.pendingFiles;
  const { draft } = session;
  const saveOne = async (id: string, file: File) => {
    failed.set(id, file);
    session.save(); // Keep a visible missing-file reference if the IDB transaction fails or the tab closes.
    await guestFiles.put(id, file);
    session.save();
    failed.delete(id);
  };
  const add = async (files: File[]) => {
    if (busy) return;
    setBusy(true);
    onError('');
    try {
      for (const file of files) {
        const invalid = validateGuestFile(file, draft.files.length);
        if (invalid) throw new Error(invalid);
        const id = crypto.randomUUID();
        draft.files.push({
          id,
          name: file.name,
          size: file.size,
          type: file.type,
        });
        await saveOne(id, file);
      }
    } catch (e) {
      onError(
        e instanceof DOMException
          ? '파일을 저장하지 못했어요. 브라우저 저장 공간을 확인하고 다시 시도해요.'
          : e instanceof Error
            ? e.message
            : '파일을 저장하지 못했어요. 저장 공간을 확인하고 다시 시도해요.',
      );
    } finally {
      setBusy(false);
      refresh((v) => v + 1);
    }
  };
  return (
    <div className="space-y-3" data-revision={revision}>
      <label
        className="block cursor-pointer space-y-2 rounded-[6px] border border-dashed border-[var(--md-sys-color-outline-variant)] p-5 text-center focus-within:outline focus-within:outline-2 focus-within:outline-[var(--md-sys-color-primary)]"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void add(Array.from(e.dataTransfer.files));
        }}
      >
        <span className="block">파일을 선택하거나 여기로 끌어와요</span>
        <input
          aria-label="견적 요청 첨부 파일"
          type="file"
          accept={ACCEPT_EXT}
          multiple
          disabled={busy}
          onChange={(e) => {
            void add(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
          className="sr-only"
        />
      </label>
      <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">
        PDF · PNG · JPEG, 파일당 <span className="md-numeric">20MB</span> 이하,
        최대 <span className="md-numeric">5</span>개예요. 로그인 전에는 이
        브라우저에만 보관해요.
      </p>
      {draft.files.map((file) => (
        <div
          key={file.id}
          className="flex flex-wrap items-center gap-3 border-b border-[var(--md-sys-color-outline-variant)] py-2"
        >
          <span className="min-w-0 flex-1 break-all">{file.name}</span>
          {failed.has(file.id) && (
            <Button
              disabled={busy}
              variant="outlined"
              onClick={async () => {
                setBusy(true);
                try {
                  await saveOne(file.id, failed.get(file.id)!);
                  onError('');
                } catch {
                  onError(
                    '파일 저장을 다시 시도해요. 저장 공간이 부족하면 파일을 제거할 수 있어요.',
                  );
                } finally {
                  setBusy(false);
                  refresh((v) => v + 1);
                }
              }}
            >
              다시 저장해요
            </Button>
          )}
          <Button
            disabled={busy}
            variant="text"
            onClick={async () => {
              setBusy(true);
              try {
                const old = draft.files;
                draft.files = old.filter((f) => f.id !== file.id);
                try {
                  session.save();
                } catch (e) {
                  draft.files = old;
                  throw e;
                }
                await guestFiles.remove(file.id);
                failed.delete(file.id);
                onError('');
              } catch {
                onError('파일을 제거하지 못했어요. 다시 시도해요.');
              } finally {
                setBusy(false);
                refresh((v) => v + 1);
              }
            }}
          >
            {file.name} 제거
          </Button>
        </div>
      ))}
      {busy && <p role="status">파일을 저장하는 중이에요…</p>}
    </div>
  );
}
