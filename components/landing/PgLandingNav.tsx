'use client';

import { useState } from 'react';
import Link from 'next/link';
import { XIcon } from '@/components/icons';
import { ConsultButton } from './ConsultButton';

// 섹션 흐름과 동일한 순서로 인페이지 앵커를 노출한다.
const NAV_LINKS: { label: string; href: string }[] = [
  { label: '영업 문제', href: '#problem' },
  { label: '성장 고객사', href: '#inbound' },
  { label: '참여 방식', href: '#process' },
  { label: '핵심 이점', href: '#benefits' },
  { label: '자주 묻는 질문', href: '#faq' },
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
    <nav className="flex items-center gap-[var(--s-4)]">
      {/* Desktop anchor links */}
      <div className="hidden md:flex items-center gap-[var(--s-5)]">
        {NAV_LINKS.map((l) => (
          <a key={l.href} href={l.href} className={linkCls}>
            {l.label}
          </a>
        ))}
      </div>

      {authLink}

      {/* 상담 CTA — 모든 브레이크포인트 노출 */}
      <ConsultButton variant="primary" size="sm">
        파트너 상담 신청
      </ConsultButton>

      {/* Mobile hamburger */}
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
    </nav>
  );
}
