'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from './LandingHeader.module.css';
import { XIcon } from '@/components/icons';
import { ConsultButton } from './ConsultButton';
import { DOCS_URL } from '@/lib/site-config';

// 우측 액션 클러스터 — 로고는 LandingHeader(구매사 랜딩과 공유)가 소유한다. 섹션 앵커·인증
// 링크·상담 CTA·모바일 햄버거를 한 그룹으로 묶는다.
const NAV_LINKS: { label: string; href: string }[] = [
  { label: '서비스 설명', href: '#inbound' },
  { label: '핵심 이점', href: '#advantage' },
  { label: '고객사 사례', href: '#cases' },
  { label: '인사이트', href: DOCS_URL },
];

// Pretendard sentence-case — 디자인 하드룰(nav 라벨에 mono·uppercase·tracking 금지) 준수.
const linkCls = styles.link;
const overDarkLinkCls = styles.barLink;

export function PgLandingNav({ authed }: { authed: boolean }) {
  const [open, setOpen] = useState(false);

  const authLink = authed ? (
    <Link href="/home" className={`${linkCls} ${overDarkLinkCls} ${styles.auth}`}>
      서포트비로 이동해요 →
    </Link>
  ) : (
    <Link href="/login" className={`${linkCls} ${overDarkLinkCls} ${styles.auth}`}>
      로그인 →
    </Link>
  );

  return (
    <nav className={styles.nav}>
      {/* Desktop links */}
      <div className={styles.links}>
        {NAV_LINKS.map((l) => (
          <a key={l.href} href={l.href} className={`${linkCls} ${overDarkLinkCls}`}>
            {l.label}
          </a>
        ))}
      </div>

      {authLink}

      {/* 시작하기 CTA — 파트너 가입(/signup/pg)으로 이동. 모바일에선 숨기고(햄버거로 대체)
          데스크톱에만 노출해 헤더 과밀·줄바꿈을 막는다. 다크 씬 위에서는 primary 토큰을
          inverse로 뒤집어 대비를 맞춘다. */}
      <ConsultButton
        href="/signup/pg"
        variant="primary"
        size="sm"
        className={styles.cta}
      >
        파트너 시작하기
      </ConsultButton>

      {/* Mobile hamburger */}
      <button
        type="button"
        className={styles.mobileToggle}
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
          className={styles.mobilePanel}
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
