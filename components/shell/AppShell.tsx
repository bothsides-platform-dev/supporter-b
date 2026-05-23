import { cn } from '@/lib/utils';

type AppShellProps = {
  children: React.ReactNode;
  className?: string;
};

// Single Linear-style sidebar + content. On mobile the shell stacks (sticky
// mobile header above content); on md+ the sidebar and content sit side by side.
export function AppShell({ children, className }: AppShellProps) {
  return (
    <div
      className={cn(
        'min-h-svh bg-[var(--shell-chrome-bg)] md:flex',
        className,
      )}
    >
      {children}
    </div>
  );
}
