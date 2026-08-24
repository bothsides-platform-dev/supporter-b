'use client';

import { useRef, useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/primitives/Button';
import { captureActionError } from '@/lib/observability/capture';
import { contractArchiveErrorMessage } from '@/lib/contract-archive/error-messages';
import { MAX_ARCHIVE_DOC_BYTES } from '@/lib/contract-archive/limits';
import { uploadContractArchive } from '@/lib/contract-archive/upload-client';
import { toast } from '@/lib/toast';

const MB = Math.floor(MAX_ARCHIVE_DOC_BYTES / (1024 * 1024));

/**
 * 플랫폼 밖에서 맺은 계약서를 보관함에 올린다 — PDF 1개 + 메타.
 *
 * 메타를 파일과 **한 화면에서** 받는 이유: presign 이 메타를 함께 받아야 pending
 * 행부터 `title NOT NULL` 이 성립한다(버려진 pending 도 사람이 읽을 수 있다).
 *
 * 크기·형식 검증은 여기서도 하지만 **경계는 서버다** — complete 가 실바이트를
 * 스니핑해 fail-closed 로 거부한다. 여기 검증은 왕복을 아끼려는 편의일 뿐이다.
 */
export function ContractArchiveUploadDialog({
  open,
  onClose,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [contractedAt, setContractedAt] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setTitle('');
    setCounterparty('');
    setContractedAt('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const close = () => {
    if (busy) return; // 업로드 중 닫으면 complete 가 도착할 곳이 사라진다.
    reset();
    onClose();
  };

  const pickFile = (f: File | null) => {
    if (!f) {
      setFile(null);
      return;
    }
    if (f.size > MAX_ARCHIVE_DOC_BYTES) {
      // 서버가 같은 상황에 내는 FILE_TOO_LARGE 와 **같은 문구**를 쓴다 — 손으로
      // 복제하면 한쪽만 고쳐져 사전 검사와 서버 응답이 다른 말을 하게 된다.
      toast(contractArchiveErrorMessage('FILE_TOO_LARGE', 'PDF 크기를 확인해 주세요.'), {
        type: 'error',
      });
      return;
    }
    setFile(f);
    // 제목을 아직 안 적었으면 파일명에서 확장자를 떼 채워 준다 — 지울 수 있다.
    if (!title.trim()) setTitle(f.name.replace(/\.pdf$/i, ''));
  };

  const canSubmit = file !== null && title.trim().length > 0 && !busy;

  const submit = async () => {
    if (!file || !title.trim()) return;
    setBusy(true);
    try {
      await uploadContractArchive(file, {
        title: title.trim(),
        ...(counterparty.trim() ? { counterpartyName: counterparty.trim() } : {}),
        ...(contractedAt ? { contractedAt } : {}),
      });
      toast('계약서를 보관했어요', { type: 'success' });
      reset();
      onUploaded();
    } catch (e) {
      captureActionError('contract-archive.upload', e);
      const code = e instanceof Error ? e.message : '';
      toast(contractArchiveErrorMessage(code, '계약서를 올리지 못했어요'), { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>계약서 올리기</DialogTitle>
          <DialogDescription>
            플랫폼 밖에서 맺은 계약서를 보관함에 넣어요. PDF 1개까지, {MB}MB 이내예요.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--md-sys-color-on-surface-variant)]">
              PDF 파일 <span aria-hidden>*</span>
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              disabled={busy}
              className="text-sm file:mr-3 file:rounded-[6px] file:border file:border-[var(--md-sys-color-outline-variant)] file:bg-[var(--md-sys-color-surface-container)] file:px-2.5 file:py-1 file:text-sm"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--md-sys-color-on-surface-variant)]">
              제목 <span aria-hidden>*</span>
            </span>
            <input
              type="text"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              placeholder="예: 결제대행 서비스 이용계약"
              className="h-8 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-2 text-sm outline-none focus-visible:border-[var(--md-sys-color-primary)]"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--md-sys-color-on-surface-variant)]">상대방</span>
            <input
              type="text"
              value={counterparty}
              maxLength={200}
              onChange={(e) => setCounterparty(e.target.value)}
              disabled={busy}
              placeholder="예: OO페이"
              className="h-8 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-2 text-sm outline-none focus-visible:border-[var(--md-sys-color-primary)]"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--md-sys-color-on-surface-variant)]">체결일</span>
            <input
              type="date"
              value={contractedAt}
              onChange={(e) => setContractedAt(e.target.value)}
              disabled={busy}
              className="md-numeric h-8 w-40 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-2 text-sm outline-none focus-visible:border-[var(--md-sys-color-primary)]"
            />
          </label>
        </div>

        <DialogFooter>
          {/* 다이얼로그 왼쪽 버튼은 `닫기` — `취소` 는 진행 중인 작업이 취소되는
              것으로 읽힌다(UX_WRITING §3). 여기엔 취소할 작업이 없다. */}
          <Button type="button" variant="outlined" size="sm" onClick={close} disabled={busy}>
            닫기
          </Button>
          <Button
            type="button"
            variant="filled"
            size="sm"
            onClick={submit}
            disabled={!canSubmit}
            aria-busy={busy}
          >
            {busy ? '올리는 중…' : '보관하기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
