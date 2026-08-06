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
  /** loading 중 확인 버튼 라벨 — 기본 '처리 중…', 문맥이 있으면 '저장 중…' 등으로 지정. */
  loadingLabel?: string;
  /** 확인 버튼에 달 코치마크 앵커(data-coachmark) — 튜토리얼 투어가 확인창 안까지 이어질 때 지정. */
  confirmDataCoachmark?: string;
  /**
   * 닫기 버튼 ref — **열린 채로 내용이 바뀌는** 확인창만 쓴다. 그런 확인창은 새로
   * 마운트되지 않아 초기 포커스가 다시 잡히지 않고, 확인 버튼이 같은 DOM 노드로
   * 포커스를 쥔 채 라벨만 바뀐다. 호출부가 이 ref 로 안전한 기본값(닫기)에 포커스를
   * 되돌린다. 평범한 확인창은 필요 없다.
   */
  cancelRef?: React.Ref<HTMLButtonElement>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = '닫기',
  variant = 'default',
  onConfirm,
  loading,
  loadingLabel = '처리 중…',
  confirmDataCoachmark,
  cancelRef,
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
            ref={cancelRef}
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
            {loading ? loadingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
