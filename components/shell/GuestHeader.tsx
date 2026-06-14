import Link from 'next/link';
import { Logo } from '@/components/primitives/Logo';

export function GuestHeader() {
  return (
    <header
      className="h-[var(--shell-topbar,56px)] px-6 flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)]"
      style={{ gridArea: 'topbar' }}
    >
      <Logo />
      <nav className="flex items-center gap-3">
        <Link
          href="/login"
          className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors px-3 py-1.5"
        >
          로그인
        </Link>
        <Link
          href="/signup"
          className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface)] bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] transition-colors px-3 py-1.5 rounded-sm"
        >
          가입하기
        </Link>
      </nav>
    </header>
  );
}
