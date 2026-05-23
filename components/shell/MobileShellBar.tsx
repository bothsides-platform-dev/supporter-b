'use client';

import { Logo } from '@/components/primitives/Logo';
import { ShellSidebarTrigger } from '@/components/shell/ShellSidebarTrigger';

type MobileShellBarProps = {
  workspaceName: string;
};

export function MobileShellBar({ workspaceName }: MobileShellBarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--shell-chrome-bg)] px-3 md:hidden">
      <ShellSidebarTrigger />
      <Logo variant="compact" className="size-6 [&_svg]:size-6" />
      <span className="truncate text-[length:var(--md-typescale-label-large-size)] font-medium text-[var(--md-sys-color-on-surface)]">
        {workspaceName}
      </span>
    </header>
  );
}
