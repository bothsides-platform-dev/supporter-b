'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { HomeIcon, FileTextIcon, SettingsIcon } from '@/components/icons';
import { Logo } from '@/components/primitives/Logo';

type NavItem = {
  href: string;
  icon: React.ReactNode;
  label: string;
};

type Props = {
  workspaceType: 'buyer' | 'pg';
};

export function IconSidebar({ workspaceType }: Props) {
  const pathname = usePathname();

  const navItems: NavItem[] = [
    { href: '/home', icon: <HomeIcon />, label: '홈' },
    workspaceType === 'buyer'
      ? { href: '/rfp', icon: <FileTextIcon />, label: '제안' }
      : { href: '/inbox', icon: <FileTextIcon />, label: '제안' },
    { href: '/settings/profile', icon: <SettingsIcon />, label: '설정' },
  ];

  return (
    <nav
      style={{ gridArea: 'sidebar' }}
      aria-label="기본 내비게이션"
      className="fixed inset-y-0 left-0 z-30 h-svh w-[var(--shell-rail)] flex flex-col items-center py-4 bg-[var(--md-sys-color-inverse-surface)]"
    >
      <div className="mb-8">
        <Logo variant="compact" />
      </div>

      <div className="flex flex-col items-center gap-1 w-full">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className="w-full flex flex-col items-center py-2 outline-none focus-visible:ring-[2px] focus-visible:ring-[var(--md-sys-color-inverse-primary)] focus-visible:ring-inset"
            >
              <div
                className={cn(
                  'w-14 flex flex-col items-center pt-1.5 pb-2 rounded-xl transition-colors [&_svg]:size-6',
                  isActive
                    ? 'bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]'
                    : 'text-[var(--md-sys-color-inverse-on-surface)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-inverse-on-surface)_8%,transparent)]',
                )}
              >
                <div className="h-8 flex items-center justify-center">
                  {item.icon}
                </div>
                <span
                  className={cn(
                    'text-[length:var(--md-typescale-label-small-size)] tracking-[var(--md-typescale-label-small-tracking)]',
                    isActive ? '' : 'opacity-60',
                  )}
                >
                  {item.label}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
