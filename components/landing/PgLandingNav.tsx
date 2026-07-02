'use client';

import { useState } from 'react';
import Link from 'next/link';
import { XIcon } from '@/components/icons';
import { Logo } from '@/components/primitives/Logo';
import { ConsultButton } from './ConsultButton';

// 로고(좌) · 메뉴+액션(우) 2분할. 메뉴는 앱으로 이동/로그인 링크 옆에 붙여 한 그룹으로 묶는다.
const NAV_LINKS: { label: string; href: string }[] = [
  { label: '서비스 설명', href: '#inbound' },
  { label: '핵심 이점', href: '#advantage' },
  { label: '고객사 사례', href: '#cases' },
];

const linkCls =
  'font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors duration-[140ms]';

export function PgLandingNav({ authed }: { authed: boolean }) {
  const [open, setOpen] = useState(false);

  const authLink = authed ? (
    <Link href="/home" className={linkCls}>
      앱으로 이동 →
    </Link>
  ) : (
    <Link href="/login" className={linkCls}>
      로그인 →
    </Link>
  );

  return (
    <div className="flex items-center justify-between h-full">
      {/* Left — logo */}
      <Logo />

      {/* Right — section anchors + auth + CTA + mobile hamburger, one group */}
      <div className="flex items-center gap-[var(--s-7)]">
        <nav className="hidden md:flex items-center gap-[var(--s-7)]">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className={linkCls}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-[var(--s-4)]">
          {authLink}
          <ConsultButton variant="primary" size="sm">
            파트너 상담 신청
          </ConsultButton>
          <button
            type="button"
            className="md:hidden grid place-items-center h-8 w-8 -mr-1 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
            aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
            aria-expanded={open}
            aria-controls="pg-landing-mobile-menu"
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
        </div>
      </div>

      {/* Mobile menu panel */}
      {open && (
        <div
          id="pg-landing-mobile-menu"
          data-testid="pg-landing-mobile-menu"
          className="md:hidden fixed inset-x-0 top-[var(--shell-topbar)] z-20 flex flex-col gap-[var(--s-1)] border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-8 py-[var(--s-4)] shadow-[var(--md-sys-elevation-2)]"
        >
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`${linkCls} py-2.5`}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
