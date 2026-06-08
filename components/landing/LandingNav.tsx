'use client';

import { useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { XIcon } from '@/components/icons';

const NAV_LINKS: { label: string; href: string }[] = [
  { label: '서비스 설명', href: '#service' },
  { label: '도입문의', href: '#contact' },
  { label: '이용요금', href: '#pricing' },
  { label: '비용 절감 계산기', href: '#calculator' },
  { label: '자주 묻는 질문', href: '#faq' },
];

const linkCls =
  'font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors duration-[140ms]';

export function LandingNav({ authed }: { authed: boolean }) {
  const [open, setOpen] = useState(false);

  function handleAnchor(e: MouseEvent<HTMLAnchorElement>, href: string) {
    const el = typeof document !== 'undefined' ? document.getElementById(href.slice(1)) : null;
    if (el) {
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setOpen(false);
  }

  const authLink = authed ? (
    <Link href="/home" className={linkCls}>
      앱으로 이동 →
    </Link>
  ) : (
    <Link href="/login" className={linkCls}>
      Sign in →
    </Link>
  );

  return (
    <nav className="flex items-center gap-[var(--s-5)]">
      {/* Desktop anchor links */}
      <div className="hidden md:flex items-center gap-[var(--s-5)]">
        {NAV_LINKS.map((l) => (
          <a key={l.href} href={l.href} className={linkCls} onClick={(e) => handleAnchor(e, l.href)}>
            {l.label}
          </a>
        ))}
      </div>

      {/* Auth CTA — single instance, visible on all breakpoints */}
      {authLink}

      {/* Mobile hamburger */}
      <button
        type="button"
        className="md:hidden grid place-items-center h-8 w-8 -mr-1 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
        aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
        aria-expanded={open}
        aria-controls="landing-mobile-menu"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <XIcon size={18} />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        )}
      </button>

      {/* Mobile menu panel */}
      {open && (
        <div
          id="landing-mobile-menu"
          data-testid="landing-mobile-menu"
          className="md:hidden fixed inset-x-0 top-[var(--shell-topbar)] z-20 flex flex-col gap-[var(--s-1)] border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-8 py-[var(--s-4)] shadow-[var(--md-sys-elevation-2)]"
        >
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`${linkCls} py-2.5`}
              onClick={(e) => handleAnchor(e, l.href)}
            >
              {l.label}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
}
