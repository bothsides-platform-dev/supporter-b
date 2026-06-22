'use client';

import { useEffect, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { AttachmentPreviewList } from '@/components/attachments/AttachmentPreviewList';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/primitives/EmptyState';
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
      <div role="status" aria-label="첨부파일 불러오는 중" className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full rounded-[var(--md-sys-shape-medium)]" />
        <Skeleton className="h-16 w-full rounded-[var(--md-sys-shape-medium)]" />
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <EmptyState
        icon={<Paperclip />}
        title="공유된 파일이 없어요"
        description="대화에서 주고받은 파일이 여기 모여요."
        className="py-12"
      />
    );
  }

  return <AttachmentPreviewList files={files} />;
}
