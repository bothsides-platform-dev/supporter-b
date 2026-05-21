import { auth } from '@/auth';
import Link from 'next/link';

const linkCls =
  'font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors duration-[140ms]';

export async function LandingHeaderNav() {
  const session = await auth();
  return session ? (
    <Link href="/home" className={linkCls}>
      앱으로 이동 →
    </Link>
  ) : (
    <Link href="/login" className={linkCls}>
      Sign in →
    </Link>
  );
}
