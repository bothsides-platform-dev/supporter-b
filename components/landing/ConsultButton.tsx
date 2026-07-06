'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type ConsultVariant = 'primary' | 'on-dark' | 'ghost';
type ConsultSize = 'lg' | 'sm';

type ConsultButtonProps = {
  children: ReactNode;
  variant?: ConsultVariant;
  size?: ConsultSize;
  className?: string;
  /** 지정하면 채널톡 대신 내부 페이지로 이동하는 링크로 렌더한다(랜딩 CTA 전환용). */
  href?: string;
};

const sizeCls: Record<ConsultSize, string> = {
  lg: 'h-12 px-6 text-[13px]',
  sm: 'h-8 px-3.5 text-[11px]',
};

const variantCls: Record<ConsultVariant, string> = {
  // 파란 채움 — 밝은 섹션의 메인 CTA
  primary:
    'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-primary)_10%,var(--md-sys-color-primary))]',
  // 다크(반전) 섹션 위의 밝은 버튼
  'on-dark':
    'bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] hover:opacity-85',
  // 보조 — 외곽선만(소개서 받기)
  ghost:
    'bg-transparent text-[var(--md-sys-color-surface)] border border-[color-mix(in_srgb,var(--md-sys-color-surface)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-surface)_10%,transparent)]',
};

// 랜딩 전역 CTA — href 지정 시 내부 페이지 링크, 미지정 시 채널톡 상담 메신저를 연다.
export function ConsultButton({
  children,
  variant = 'primary',
  size = 'lg',
  className,
  href,
}: ConsultButtonProps) {
  const cls = cn(
    'inline-flex items-center justify-center gap-2 rounded-[var(--md-sys-shape-small)]',
    'font-mono tracking-[0.06em] uppercase whitespace-nowrap',
    'transition-[background-color,opacity,transform] duration-[140ms] active:scale-[0.98]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50',
    sizeCls[size],
    variantCls[variant],
    className,
  );

  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => window.ChannelIO?.('showMessenger')} className={cls}>
      {children}
    </button>
  );
}
