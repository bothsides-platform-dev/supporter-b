'use client';

import { cn } from '@/lib/utils';

type PageEnterProps = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  /** DESIGN.md §9에서 승인한 랜딩 데모 진입에만 always를 사용한다. */
  motionPolicy?: 'system' | 'always';
};

export function PageEnter({ children, className, delay = 0, motionPolicy = 'system' }: PageEnterProps) {
  return (
    <div
      className={cn('page-enter', className)}
      data-motion-policy={motionPolicy}
      style={{ animationDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}
