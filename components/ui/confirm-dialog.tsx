'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/primitives/Button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  /** 확인 버튼에 달 코치마크 앵커(data-coachmark) — 튜토리얼 투어가 확인창 안까지 이어질 때 지정. */
  confirmDataCoachmark?: string;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = '취소',
  variant = 'default',
  onConfirm,
  loading,
  confirmDataCoachmark,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent showCloseButton={false} className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outlined"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={loading}
            color={variant === 'danger' ? 'error' : 'primary'}
            data-coachmark={confirmDataCoachmark}
          >
            {loading ? 'LOADING…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
