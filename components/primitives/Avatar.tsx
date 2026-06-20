'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export type AvatarColor = 'primary' | 'secondary' | 'tertiary' | 'error' | 'surface';
type AvatarSize = 'sm' | 'md' | 'lg';

const colorMap: Record<AvatarColor, string> = {
  primary:   'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]',
  secondary: 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]',
  tertiary:  'bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]',
  error:     'bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]',
  surface:   'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]',
};

const sizeMap: Record<AvatarSize, string> = {
  sm: 'w-6 h-6 text-[length:var(--md-typescale-label-small-size)]',
  md: 'w-8 h-8 text-[length:var(--md-typescale-label-large-size)]',
  lg: 'w-10 h-10 text-[length:var(--md-typescale-title-small-size)]',
};

const imgSizeMap: Record<AvatarSize, string> = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
};

type AvatarProps = {
  name: string;
  color?: AvatarColor;
  size?: AvatarSize;
  className?: string;
  /** 사용자 id — avatarUpdatedAt 과 함께 있으면 사진을 렌더한다. */
  userId?: string;
  /** 프로필 사진 버전(ISO). null/undefined 면 이니셜. 있으면 ?v 캐시 버스트 키. */
  avatarUpdatedAt?: string | null;
};

export function Avatar({ name, color = 'primary', size = 'md', className, userId, avatarUpdatedAt }: AvatarProps) {
  const [imgError, setImgError] = useState(false);

  if (userId && avatarUpdatedAt && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- bytes served from our own API route; no external domain needed
      <img
        src={`/api/user/${userId}/avatar?v=${Date.parse(avatarUpdatedAt)}`}
        alt={name}
        onError={() => setImgError(true)}
        className={cn(
          'inline-block shrink-0 object-cover rounded-[var(--md-sys-shape-full)]',
          imgSizeMap[size],
          className,
        )}
      />
    );
  }

  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div
      aria-label={name}
      className={cn(
        'inline-flex items-center justify-center rounded-[var(--md-sys-shape-full)]',
        'font-[number:var(--md-typescale-label-large-weight)] select-none',
        colorMap[color],
        sizeMap[size],
        className,
      )}
    >
      {initials}
    </div>
  );
}
