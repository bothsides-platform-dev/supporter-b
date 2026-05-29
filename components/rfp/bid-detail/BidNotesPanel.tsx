'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { HTTPError } from 'ky';
import { http } from '@/lib/http';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/primitives/Button';
import { PaperclipIcon, XIcon, FileTextIcon } from '@/components/icons';
import { addBidNoteAction } from '@/lib/server/actions/bid/addBidNoteAction';
import { removeBidNoteAction } from '@/lib/server/actions/bid/removeBidNoteAction';
import type { Attachment } from '@/lib/types/common';
import type { BidNote } from '@/lib/types/bid-note';
import { SectionLabel } from './parts';

const MAX_BODY = 2000;
const ACCEPT = 'image/*,application/pdf';

/** Right-pane history section: the add-note form + the note timeline. */
export function BidNotesPanel({
  bidId,
  notes,
}: {
  bidId: string;
  notes: BidNote[];
}) {
  return (
    <section className="px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>히스토리</SectionLabel>
      </div>
      <NoteForm bidId={bidId} />
      <NoteTimeline notes={notes} />
    </section>
  );
}

type StagedAttachment = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
};

function NoteForm({ bidId }: { bidId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<StagedAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      // Eager upload — each picked file lands on the server immediately with
      // ownerKind='bid_note', ownerId=bidId. addBidNoteAction will re-parent
      // the attachment's owner_id to the new noteId after the note row is
      // created. This keeps the staging window short and the iframe preview
      // (in NoteAttachment after submit) authenticated.
      const uploaded: StagedAttachment[] = [];
      for (const file of Array.from(list)) {
        const form = new FormData();
        form.append('file', file);
        form.append('ownerKind', 'bid_note');
        form.append('ownerId', bidId);
        let body: { id: string; name: string; size: number; mimeType: string }
        try {
          body = await http
            .post('/api/files/upload', { body: form })
            .json<{ id: string; name: string; size: number; mimeType: string }>()
        } catch (err) {
          if (err instanceof HTTPError) {
            const payload = (await err.response.json().catch(() => ({}))) as { error?: string }
            throw new Error(payload.error ?? `UPLOAD_${err.response.status}`)
          }
          throw err
        }
        uploaded.push(body);
      }
      setFiles((prev) => [...prev, ...uploaded]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeFile = (id: string) => {
    // Server orphan — Stage 3 v0 has no sweeper, so the row stays until the
    // next milestone. The user-facing UX still pretends it's gone.
    setFiles((prev) => prev.filter((p) => p.id !== id));
  };

  const submit = () => {
    if (busy) return;
    if (!body.trim() && files.length === 0) return;
    setError(null);
    startTransition(async () => {
      const r = await addBidNoteAction({
        bidId,
        body: body.trim(),
        attachmentIds: files.map((f) => f.id),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setBody('');
      setFiles([]);
      router.refresh();
    });
  };

  return (
    <div className="border border-[var(--md-sys-color-outline-variant)] rounded-md p-3 mt-3 bg-[var(--md-sys-color-surface)]">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
        placeholder="협상 진행, 통화 기록, 결정 근거…"
        rows={3}
        className="block w-full resize-y bg-transparent text-[13px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none min-h-[64px] max-h-[160px]"
      />
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
          {files.map((f) => (
            <FileChip
              key={f.id}
              name={f.name}
              size={f.size}
              mimeType={f.mimeType}
              url={`/api/files/${f.id}`}
              onRemove={() => removeFile(f.id)}
            />
          ))}
        </div>
      )}
      {error && (
        <p className="mt-2 font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-error)]">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors cursor-pointer disabled:opacity-50"
          >
            <PaperclipIcon size={12} /> + 첨부
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT}
            onChange={(e) => void handleFiles(e.target.files)}
            className="hidden"
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] tabular-nums text-[var(--md-sys-color-outline)]">
            {body.length} / {MAX_BODY}
          </span>
          <Button
            size="sm"
            onClick={submit}
            disabled={busy || (!body.trim() && files.length === 0)}
          >
            기록
          </Button>
        </div>
      </div>
    </div>
  );
}

function NoteTimeline({ notes }: { notes: BidNote[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);

  // Notes arrive oldest → newest from the server. Display reversed but
  // keep the creation index as the serial label.
  const display = useMemo(() => {
    return notes.map((note, i) => ({ note, serial: i + 1 })).reverse();
  }, [notes]);

  const confirmRemove = () => {
    if (!noteToDelete) return;
    const id = noteToDelete;
    setNoteToDelete(null);
    setRemovingId(id);
    startTransition(async () => {
      await removeBidNoteAction({ noteId: id });
      router.refresh();
      setRemovingId(null);
    });
  };

  if (notes.length === 0) {
    return (
      <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)] mt-5 mb-2">
        — 아직 기록된 메모가 없습니다 —
      </p>
    );
  }

  return (
    <>
      <ConfirmDialog
        open={noteToDelete !== null}
        onOpenChange={(o) => !o && setNoteToDelete(null)}
        title="메모를 삭제할까요?"
        description="첨부파일을 포함해 영구 삭제됩니다."
        confirmLabel="삭제"
        variant="danger"
        onConfirm={confirmRemove}
        loading={removingId !== null}
      />
      <ol className="mt-5 space-y-5">
        {display.map(({ note, serial }) => (
          <li key={note.id} className="border-t border-[var(--md-sys-color-outline-variant)] pt-3">
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                {String(serial).padStart(2, '0')} —{' '}
                <span className="text-[var(--md-sys-color-on-surface-variant)]">
                  {formatNoteTime(note.createdAt)} · {note.authorName}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setNoteToDelete(note.id)}
                disabled={removingId === note.id}
                className="font-mono text-[9px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-error)] transition-colors cursor-pointer disabled:opacity-50"
                aria-label="삭제"
              >
                삭제
              </button>
            </div>
          {note.body && (
            <p className="text-[13px] leading-relaxed text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap">
              {note.body}
            </p>
          )}
          {note.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {note.attachments.map((a) => (
                <NoteAttachment key={a.id} attachment={a} />
              ))}
            </div>
          )}
          </li>
        ))}
      </ol>
    </>
  );
}

function NoteAttachment({ attachment }: { attachment: Attachment }) {
  const isImage = attachment.mimeType?.startsWith('image/');
  const [broken, setBroken] = useState(false);

  if (broken || !attachment.url) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 border border-dashed border-[var(--md-sys-color-outline-variant)] rounded-md font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--md-sys-color-outline)]">
        {attachment.name} · 미리보기 불가
      </span>
    );
  }

  if (isImage) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-16 h-16 border border-[var(--md-sys-color-outline-variant)] rounded-md overflow-hidden bg-[var(--md-sys-color-surface-container-high)]"
        title={attachment.name}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={attachment.name}
          onError={() => setBroken(true)}
          className="w-full h-full object-cover"
        />
      </a>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 px-2 py-1 border border-[var(--md-sys-color-outline-variant)] rounded-md font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
    >
      <FileTextIcon size={11} /> {attachment.name}
    </a>
  );
}

function FileChip({
  name,
  size,
  mimeType,
  url,
  onRemove,
}: {
  name: string;
  size: number;
  mimeType: string;
  url: string;
  onRemove: () => void;
}) {
  const isImage = mimeType?.startsWith('image/');
  return (
    <span className="inline-flex items-center gap-2 px-2 py-1 bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] rounded-md">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="w-5 h-5 object-cover rounded-md" />
      ) : (
        <FileTextIcon size={11} />
      )}
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--md-sys-color-on-surface-variant)] truncate max-w-[160px]">
        {name}
      </span>
      <span className="font-mono text-[9px] tabular-nums text-[var(--md-sys-color-outline)]">
        {(size / 1024).toFixed(0)}KB
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${name} 제거`}
        className="text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-on-surface)] transition-colors cursor-pointer"
      >
        <XIcon size={11} />
      </button>
    </span>
  );
}

function formatNoteTime(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}
