'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDownIcon, XIcon } from '@/components/icons';

// 제품 라인업 — 서비스 설명 드롭다운. PG는 현재 이용 가능, 클라우드·메신저는 오픈 예정.
// (예고 노출은 상표/서비스 범위 고지 목적. 일정 변경 시 status 문구만 갱신.)
type ServiceItem = {
  label: string;
  desc: string;
  href?: string;
  status: string;
  available: boolean;
};

const SERVICE_ITEMS: ServiceItem[] = [
  {
    label: 'PG 비교 견적',
    desc: '여러 PG사 견적을 한 기준으로 비교하고 협상하세요.',
    href: '#service',
    status: '이용 가능',
    available: true,
  },
  {
    label: '클라우드',
    desc: '클라우드 인프라 비용도 비교 견적으로.',
    status: '2026. 4Q 오픈 예정',
    available: false,
  },
  {
    label: '메신저',
    desc: '비즈니스 메신저 도입도 한 곳에서.',
    status: '2026. 3Q 오픈 예정',
    available: false,
  },
];

// 랜딩 섹션 흐름과 동일한 순서: (서비스) → 이용요금 → 계산기 → FAQ → 도입문의.
const NAV_LINKS: { label: string; href: string }[] = [
  { label: '이용요금', href: '#pricing' },
  { label: '비용 절감 계산기', href: '#calculator' },
  { label: '자주 묻는 질문', href: '#faq' },
  { label: '도입문의', href: '#contact' },
];

// Pretendard sentence-case — 디자인 하드룰(nav 라벨에 mono·uppercase·tracking 금지) 준수.
const linkCls =
  'text-[var(--text-sm)] tracking-[-0.006em] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors duration-[140ms]';
// 히어로 다크 씬 위(over-dark: LandingHeader의 group/lheader data 상태) 라이트 톤.
// 헤더 바에 상주하는 요소에만 붙인다 — 드롭다운·모바일 패널은 솔리드 surface 배경이므로 제외.
const overDarkLinkCls =
  'group-data-[over-dark]/lheader:text-[color-mix(in_srgb,var(--md-sys-color-inverse-on-surface)_72%,transparent)] group-data-[over-dark]/lheader:hover:text-[var(--md-sys-color-inverse-on-surface)]';

export function LandingNav({ authed }: { authed: boolean }) {
  const [open, setOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);

  // 인페이지 이동은 네이티브 해시 앵커(<a href="#id">)에 맡긴다 — 가장 확실하게
  // 동작한다. 부드러운 스크롤·헤더 오프셋은 랜딩에 스코프된 CSS(.landing-scroll +
  // 섹션의 scroll-mt)가 처리한다.
  const authLink = authed ? (
    <Link href="/home" className={`${linkCls} ${overDarkLinkCls} whitespace-nowrap`}>
      앱으로 이동 →
    </Link>
  ) : (
    <Link href="/login" className={`${linkCls} ${overDarkLinkCls} whitespace-nowrap`}>
      로그인
    </Link>
  );

  // 우측 주요 CTA — B2B 헤더답게 1차 액션을 강조.
  const primaryCta = authed ? null : (
    <Link
      href="/rfp-create"
      className="hidden md:inline-flex items-center h-9 px-4 rounded-md bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] text-[var(--text-sm)] font-medium tracking-[-0.006em] transition-opacity duration-[140ms] hover:opacity-90 active:scale-[0.98] group-data-[over-dark]/lheader:[--md-sys-color-primary:var(--md-sys-color-inverse-primary)] group-data-[over-dark]/lheader:[--md-sys-color-on-primary:var(--md-sys-color-inverse-surface)]"
    >
      무료로 시작하기
    </Link>
  );

  return (
    <nav className="flex items-center gap-[var(--s-5)]">
      {/* Desktop links */}
      <div className="hidden md:flex items-center gap-[var(--s-5)]">
        {/* 서비스 설명 — 제품 라인업 드롭다운 */}
        <div
          className="relative"
          onMouseEnter={() => setServiceOpen(true)}
          onMouseLeave={() => setServiceOpen(false)}
        >
          <button
            type="button"
            className={`inline-flex items-center gap-1 ${linkCls} ${overDarkLinkCls}`}
            aria-expanded={serviceOpen}
            aria-haspopup="true"
            onClick={() => setServiceOpen((v) => !v)}
          >
            서비스 설명
            <ChevronDownIcon
              size={14}
              className={`transition-transform duration-[140ms] ${serviceOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {serviceOpen && (
            <div
              className="absolute left-0 top-[calc(100%+12px)] z-30 w-[320px] flex flex-col gap-0.5 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-[var(--s-2)] shadow-[var(--md-sys-elevation-2)]"
            >
              {SERVICE_ITEMS.map((item) =>
                item.available && item.href ? (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="group flex items-start justify-between gap-3 rounded-md px-3 py-2.5 hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors"
                    onClick={() => setServiceOpen(false)}
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[var(--text-sm)] font-medium text-[var(--md-sys-color-on-surface)]">
                        {item.label}
                      </span>
                      <span className="text-[var(--text-2xs)] leading-snug text-[var(--md-sys-color-on-surface-variant)]">
                        {item.desc}
                      </span>
                    </span>
                    <span className="shrink-0 mt-0.5 rounded-full bg-[var(--md-sys-color-tertiary-container)] px-2 py-0.5 text-[10px] font-medium text-[var(--md-sys-color-on-tertiary-container)]">
                      {item.status}
                    </span>
                  </Link>
                ) : (
                  <div
                    key={item.label}
                    aria-disabled
                    className="flex items-start justify-between gap-3 rounded-md px-3 py-2.5 cursor-default"
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[var(--text-sm)] font-medium text-[var(--md-sys-color-on-surface-variant)]">
                        {item.label}
                      </span>
                      <span className="text-[var(--text-2xs)] leading-snug text-[var(--md-sys-color-outline)]">
                        {item.desc}
                      </span>
                    </span>
                    <span className="shrink-0 mt-0.5 rounded-full border border-[var(--md-sys-color-outline-variant)] px-2 py-0.5 text-[10px] font-medium text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">
                      {item.status}
                    </span>
                  </div>
                ),
              )}
            </div>
          )}
        </div>

        {NAV_LINKS.map((l) => (
          <a key={l.href} href={l.href} className={`${linkCls} ${overDarkLinkCls}`}>
            {l.label}
          </a>
        ))}
      </div>

      {/* Auth + primary CTA */}
      {authLink}
      {primaryCta}

      {/* Mobile hamburger */}
      <button
        type="button"
        className={`md:hidden grid place-items-center h-8 w-8 -mr-1 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors ${overDarkLinkCls}`}
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
          <a
            href="#service"
            className={`${linkCls} py-2.5`}
            onClick={() => setOpen(false)}
          >
            서비스 설명
          </a>
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
