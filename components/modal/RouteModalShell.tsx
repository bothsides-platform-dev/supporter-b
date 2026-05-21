'use client';

// 가로채기(intercepting) 라우트가 항상 open 상태로 렌더하는 Dialog 래퍼.
// 라우트는 soft-nav 로 가로채질 때만 마운트되므로 open 은 하드코딩 true.
// ESC/백드롭/X/브라우저 뒤로가기 모두 onOpenChange(false) 로 수렴 → router.back()
// 으로 푸시됐던 상세 URL 을 popped → @modal 슬롯이 default.tsx(null) 로 복귀한다.
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function RouteModalShell({
  title,
  size,
  children,
}: {
  /** 접근성용 다이얼로그 제목(base-ui 요구). 시각적으로는 본문 헤더가 대신함. */
  title: string;
  /** max-width 등 표면별 override (예: 'sm:max-w-[1100px]'). */
  size?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) router.back();
      }}
    >
      <DialogContent className={cn('max-h-[90vh] overflow-y-auto', size)}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
