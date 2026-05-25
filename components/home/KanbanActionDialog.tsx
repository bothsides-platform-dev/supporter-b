'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/lib/toast';
import { sendDraftInvitationsAction } from '@/lib/server/actions/rfp/sendDraftInvitationsAction';
import { cancelRfpAction } from '@/lib/server/actions/rfp/cancelRfpAction';
import { withdrawBidAction } from '@/lib/server/actions/bid/withdrawBidAction';
import type { DragAction } from './dragMatrix';

type Props = {
  action: DragAction | null;
  onClose: () => void;
  onCommitted: () => void;
};

const COPY: Record<
  DragAction['kind'],
  { title: string; bodyKey: 'rfp' | 'bid'; cta: string; danger?: boolean }
> = {
  'send-rfp': {
    title: '초대 PG에 RFP를 발송할까요?',
    bodyKey: 'rfp',
    cta: '발송',
  },
  'cancel-rfp': {
    title: 'RFP를 취소(종료)할까요?',
    bodyKey: 'rfp',
    cta: '취소 처리',
    danger: true,
  },
  'withdraw-bid': {
    title: '제출한 제안을 철회할까요?',
    bodyKey: 'bid',
    cta: '철회',
    danger: true,
  },
  'navigate-rfp-detail': { title: '', bodyKey: 'rfp', cta: '' },
  'navigate-inbox': { title: '', bodyKey: 'rfp', cta: '' },
};

export function KanbanActionDialog({ action, onClose, onCommitted }: Props) {
  const [submitting, setSubmitting] = useState(false);

  // navigate-* 는 다이얼로그 없이 즉시 라우팅하므로 여기 도달 안 함.
  if (
    !action ||
    action.kind === 'navigate-rfp-detail' ||
    action.kind === 'navigate-inbox'
  ) {
    return null;
  }

  const copy = COPY[action.kind];
  const heading =
    action.kind === 'withdraw-bid' || action.kind === 'cancel-rfp'
      ? `${'title' in action ? action.title : ''}`
      : 'title' in action
        ? action.title
        : '';

  const onConfirm = async () => {
    setSubmitting(true);
    try {
      let result: { ok: true } | { ok: false; error: string };
      if (action.kind === 'send-rfp') {
        const r = await sendDraftInvitationsAction({ rfpId: action.rfpId });
        result = r.ok ? { ok: true } : { ok: false, error: r.error };
      } else if (action.kind === 'cancel-rfp') {
        result = await cancelRfpAction({ rfpId: action.rfpId });
      } else if (action.kind === 'withdraw-bid') {
        result = await withdrawBidAction({ bidId: action.bidId });
      } else {
        result = { ok: false, error: 'UNREACHABLE' };
      }

      if (result.ok) {
        toast(copy.cta + ' 완료');
        onCommitted();
      } else {
        toast(`처리 실패 — ${result.error}`, { type: 'error' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && !submitting && onClose()}
      title={copy.title}
      description={heading || undefined}
      confirmLabel={copy.cta}
      cancelLabel="돌아가기"
      variant={copy.danger ? 'danger' : 'default'}
      onConfirm={onConfirm}
      loading={submitting}
    />
  );
}
