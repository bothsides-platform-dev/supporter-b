'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { getWorkspaceInitials, getWorkspaceColor } from '@/lib/utils/workspace-avatar';

type Props = {
  name: string;
  size?: 'sm' | 'md';
  workspaceId?: string;
  hasLogo?: boolean;
  className?: string;
};

const sizeMap = {
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-7 h-7 text-[11px]',
};

const imgSizeMap = {
  sm: 'w-6 h-6',
  md: 'w-7 h-7',
};

export function WorkspaceAvatar({ name, size = 'sm', workspaceId, hasLogo, className }: Props) {
  const [imgError, setImgError] = useState(false);

  if (hasLogo && workspaceId && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- bytes served from our own API route; no external domain needed
      <img
        src={`/api/workspace/${workspaceId}/avatar`}
        alt={name}
        role="img"
        onError={() => setImgError(true)}
        className={cn(
          'inline-block shrink-0 object-cover',
          'rounded-[var(--md-sys-shape-extra-small)]',
          imgSizeMap[size],
          className,
        )}
      />
    );
  }

  const initials = getWorkspaceInitials(name);
  const color = getWorkspaceColor(name);
  return (
    <div
      role="img"
      aria-label={name}
      className={cn(
        'inline-flex items-center justify-center shrink-0',
        'rounded-[var(--md-sys-shape-extra-small)]',
        'font-[number:var(--md-typescale-label-large-weight)] select-none',
        sizeMap[size],
        className,
      )}
      style={{ background: color.bg, color: color.fg }}
    >
      {initials}
    </div>
  );
}
