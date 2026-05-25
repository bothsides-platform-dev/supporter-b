// components/primitives/WorkspaceAvatar.tsx
import { cn } from '@/lib/utils';
import { getWorkspaceInitials, getWorkspaceColor } from '@/lib/utils/workspace-avatar';

type Props = { name: string; size?: 'sm' | 'md'; className?: string };

const sizeMap = {
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-7 h-7 text-[11px]',
};

export function WorkspaceAvatar({ name, size = 'sm', className }: Props) {
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
