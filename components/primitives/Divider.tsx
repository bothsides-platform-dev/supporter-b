import { cn } from '@/lib/utils';

type Props = {
  className?: string;
};

/** Flex-growing horizontal rule. Place inside a flex row to fill remaining space. */
export function Divider({ className }: Props) {
  return <div className={cn('flex-1 h-px bg-[var(--md-sys-color-outline-variant)]', className)} />;
}
