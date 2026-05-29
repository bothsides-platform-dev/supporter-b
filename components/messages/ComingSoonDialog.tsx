'use client';

import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/primitives/EmptyState';
import { ComposeIcon } from '@/components/icons';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
};

/**
 * '구현중' 모달 — 메시지 전송 등 백엔드 미구현 액션의 공용 종착점.
 * Dialog + EmptyState 재사용. 본문은 한글 인라인(앱 i18n 관례).
 */
export function ComingSoonDialog({
  open,
  onOpenChange,
  title = '구현중입니다',
  description = '개발팀이 열심히 구현중입니다. 조금만 기다려주세요',
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        <EmptyState
          className="py-10"
          icon={<ComposeIcon />}
          title={title}
          description={description}
          action={
            <Button onClick={() => onOpenChange(false)}>확인</Button>
          }
        />
      </DialogContent>
    </Dialog>
  );
}
