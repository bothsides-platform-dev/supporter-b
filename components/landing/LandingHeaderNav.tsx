import { auth } from '@/auth';
import Link from 'next/link';

const linkCls =
  'font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors duration-[140ms]';

type Variant = 'buyer' | 'pg';

const CROSS_LINK: Record<Variant, { href: string; label: string }> = {
  buyer: { href: '/pg', label: 'PG사 영업담당이신가요? →' },
  pg: { href: '/', label: '구매사이신가요? →' },
};

export async function LandingHeaderNav({ variant = 'buyer' }: { variant?: Variant } = {}) {
  const session = await auth();

  if (session) {
    return (
      <Link href="/home" className={linkCls}>
        앱으로 이동 →
      </Link>
    );
  }

  const cross = CROSS_LINK[variant];
  return (
    <>
      <Link href={cross.href} className={linkCls}>
        {cross.label}
      </Link>
      <Link href="/login" className={linkCls}>
        Sign in →
      </Link>
    </>
  );
}
