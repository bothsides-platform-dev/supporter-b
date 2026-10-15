'use client';
import { useEffect, useState } from 'react';
import { FileText, ImageIcon, Trash2 } from 'lucide-react';
import styles from './guest-quote.module.css';
import { formatSize } from '@/lib/utils/format';
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
  missingFileIds,
}: {
  session: GuestSession;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onError: (s: string) => void;
  missingFileIds?: string[];
}) {
  const [revision, refresh] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const failed = session.pendingFiles;
  const { draft } = session;
  useEffect(() => {
    if (missingFileIds !== undefined) return;
    let active = true;
    void Promise.all(draft.files.map(async file => {
      try { return await guestFiles.get(file.id) ? null : file.id; }
      catch { return file.id; }
    })).then(ids => { if (active) setMissing(ids.filter((id): id is string => id !== null)); });
    return () => { active = false; };
  }, [draft, revision, missingFileIds]);
  const saveOne = async (id: string, file: File) => {
    failed.set(id, file);
    session.save(); // Keep a visible missing-file reference if the IDB transaction fails or the tab closes.
    await guestFiles.put(id, file);
    session.save();
    failed.delete(id);
    setMissing(ids => ids.filter(value => value !== id));
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
        className={styles.dropzone}
        data-dragging={dragging}
        onDragEnter={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
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
          data-file-row
          className={styles.fileRow}
        >
          <span aria-hidden="true" className={styles.fileType}>{file.type === 'application/pdf' ? <FileText size={20} /> : <ImageIcon size={20} />}<span>{file.type === 'application/pdf' ? 'PDF' : file.type === 'image/png' ? 'PNG' : 'JPEG'}</span></span>
          <span className={styles.fileName}>{file.name}</span>
          <span className={`${styles.fileSize} md-numeric`}>{formatSize(file.size)}</span>
          <Button
            className={styles.fileRemove}
            aria-label={`${file.name} 제거`}
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
          ><Trash2 size={16} aria-hidden="true" />제거</Button>
          {(failed.has(file.id) || (missingFileIds ?? missing).includes(file.id)) && <div className={styles.fileRecovery}>
            <p>{failed.has(file.id) ? '원본을 보관하지 못했어요. 저장 공간을 확인하고 다시 시도해요.' : '원본을 찾지 못했어요. 파일을 제거한 뒤 다시 선택해요.'}</p>
          {failed.has(file.id) && (
            <Button
              className="min-h-11"
              aria-label={`${file.name} 다시 저장`}
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
              다시 저장
            </Button>
          )}
          </div>}
        </div>
      ))}
      {busy && <p role="status">파일을 저장하는 중이에요…</p>}
    </div>
  );
}
