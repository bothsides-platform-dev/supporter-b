'use client';

import { useEffect, useState } from 'react';
import { AttachmentPreviewList } from '@/components/attachments/AttachmentPreviewList';
import { listConversationAttachments } from '@/lib/server/actions/chat/listConversationAttachments';
import type { Attachment } from '@/lib/types/common';

type Props = { conversationId: string };

export function AttachmentGalleryPanel({ conversationId }: Props) {
  const [files, setFiles] = useState<Attachment[] | null>(null);

  useEffect(() => {
    setFiles(null);
    let cancelled = false;
    listConversationAttachments(conversationId).then((result) => {
      if (!cancelled) setFiles(result);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  if (files === null) {
    return (
      <p className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">LOADING…</p>
    );
  }

  if (files.length === 0) {
    return (
      <p className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">첨부파일 없음</p>
    );
  }

  return <AttachmentPreviewList files={files} />;
}
