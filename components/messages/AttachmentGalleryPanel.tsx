'use client';

import { useEffect, useState } from 'react';
import { AttachmentPreviewList } from '@/components/attachments/AttachmentPreviewList';
import { listConversationAttachments } from '@/lib/server/actions/chat/listConversationAttachments';
import type { Attachment } from '@/lib/types/common';

type Props = { conversationId: string };

export function AttachmentGalleryPanel({ conversationId }: Props) {
  const [loaded, setLoaded] = useState<{ id: string; files: Attachment[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    listConversationAttachments(conversationId).then((result) => {
      if (!cancelled) setLoaded({ id: conversationId, files: result });
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // conversationId가 바뀌면 직전 결과는 무효 — 새 조회가 끝날 때까지 로딩으로 본다.
  const files = loaded?.id === conversationId ? loaded.files : null;

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
