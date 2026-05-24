import Link from 'next/link'
import { cn } from '@/lib/utils'

type LogoVariant = 'default' | 'compact'

type LogoProps = {
  variant?: LogoVariant
  className?: string
  href?: string
}

export function Logo({ variant = 'default', className, href }: LogoProps) {
  if (variant === 'compact') {
    return (
      <Link
        href={href ?? '/home'}
        aria-label="Supporter B 홈"
        className={cn(
          'group flex items-center justify-center',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-surface)]',
          'rounded-md',
          className,
        )}
      >
        {/* "b" icon — paper background with ink mark, matches apple-icon */}
        <svg
          viewBox="0 0 32 32"
          width="32"
          height="32"
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          className="opacity-[0.82] group-hover:opacity-100 transition-opacity duration-[140ms]"
        >
          <rect width="32" height="32" rx="6" fill="var(--md-sys-color-surface)" />
          <rect x="5.5" y="5" width="4.5" height="22" rx="2.25" fill="var(--md-sys-color-on-surface)" />
          <circle cx="21" cy="16" r="9" fill="var(--md-sys-color-on-surface)" />
          {/* paper gap separates bar from circle */}
          <rect x="10" y="0" width="3" height="32" fill="var(--md-sys-color-surface)" />
        </svg>
      </Link>
    )
  }

  return (
    <Link
      href={href ?? '/'}
      aria-label="Supporter B 홈"
      className={cn(
        'group inline-flex items-center gap-3',
        'opacity-100 hover:opacity-70 transition-opacity duration-[140ms]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-on-surface)]',
        'rounded-md',
        className,
      )}
    >
      {/* icon mark — bar + circle, ink on transparent */}
      <svg
        viewBox="0 0 32 32"
        width="22"
        height="22"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="5.5" y="5" width="4.5" height="22" rx="2.25" fill="var(--md-sys-color-on-surface)" />
        <circle cx="21" cy="16" r="9" fill="var(--md-sys-color-on-surface)" />
      </svg>
      <span className="font-sans font-extrabold text-[22px] leading-none tracking-[-0.04em] text-[var(--md-sys-color-on-surface)]">
        Supporter B
      </span>
    </Link>
  )
}
