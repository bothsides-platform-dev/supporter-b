'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import styles from './LandingHeader.module.css';
import { useLandingActiveSection } from './use-landing-active-section';
import { ChevronDownIcon, XIcon } from '@/components/icons';
import { Chip } from '@/components/primitives/Chip';

// 제품 라인업 — 서비스 설명 드롭다운. 맞춤 PG 견적은 이용 가능, 나머지는 2027년 상반기 오픈 예정.
// (예고 노출은 상표/서비스 범위 고지 목적. 일정 변경 시 status 문구만 갱신.)
type ServiceItem = {
  label: string;
  desc: string;
  href: string;
  status: { kind: 'available' };
} | {
  label: string;
  desc: string;
  status: { kind: 'planned'; year: string };
};

const SERVICE_ITEMS: ServiceItem[] = [
  {
    label: '맞춤 PG 견적',
    desc: '우리 업종에 맞는 PG사 견적을 받아봐요.',
    href: '#service',
    status: { kind: 'available' },
  },
  {
    label: '클라우드',
    desc: '클라우드 인프라 비용을 비교해요.',
    status: { kind: 'planned', year: '2027' },
  },
  {
    label: '메신저',
    desc: '비즈니스 메신저의 도입 조건을 비교해요.',
    status: { kind: 'planned', year: '2027' },
  },
  {
    label: '본인인증',
    desc: '본인인증 서비스의 도입 조건과 비용을 비교해요.',
    status: { kind: 'planned', year: '2027' },
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
const linkCls = styles.link;
const overDarkLinkCls = styles.barLink;

export function LandingNav({ authed }: { authed: boolean }) {
  const { navRef, activeSection } = useLandingActiveSection();
  const [open, setOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const serviceRef = useRef<HTMLDivElement>(null);
  const serviceTriggerRef = useRef<HTMLButtonElement>(null);

  // 서비스 설명 드롭다운은 클릭으로만 연다 — 열린 동안 바깥 클릭·Escape 로 닫는다.
  useEffect(() => {
    if (!serviceOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!serviceRef.current?.contains(e.target as Node)) setServiceOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setServiceOpen(false);
      serviceTriggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [serviceOpen]);

  // 인페이지 이동은 네이티브 해시 앵커(<a href="#id">)에 맡긴다 — 가장 확실하게
  // 동작한다. 부드러운 스크롤·헤더 오프셋은 랜딩에 스코프된 CSS(.landing-scroll +
  // 섹션의 scroll-mt)가 처리한다.
  const authLink = authed ? (
    <Link href="/home" className={`${linkCls} ${overDarkLinkCls} ${styles.auth}`}>
      서포트비로 이동해요 →
    </Link>
  ) : (
    <Link href="/login" className={`${linkCls} ${overDarkLinkCls} ${styles.auth}`}>
      로그인
    </Link>
  );

  // 우측 주요 CTA — B2B 헤더답게 1차 액션을 강조.
  const primaryCta = authed ? null : (
    <Link
      href="/quote-start"
      className={styles.cta}
    >
      맞춤 견적 받기
    </Link>
  );

  return (
    <nav ref={navRef} className={styles.nav}>
      {/* Desktop links */}
      <div className={styles.links}>
        {/* 서비스 설명 — 제품 라인업 드롭다운 */}
        <div ref={serviceRef} className={styles.service}>
          <button
            ref={serviceTriggerRef}
            type="button"
            className={`${styles.trigger} ${linkCls} ${overDarkLinkCls}`}
            aria-current={activeSection === 'service' ? 'location' : undefined}
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
              data-testid="landing-service-menu"
              className={styles.servicePanel}
            >
              <div className={styles.serviceGrid}>
                {SERVICE_ITEMS.map((item) => {
                  const contents = (
                    <>
                      <span className={styles.serviceTitle}>
                        <span className={styles.serviceName}>
                          {item.label}
                        </span>
                        {item.status.kind === 'available' ? (
                          <Chip label="이용 가능" color="tertiary" className="shrink-0 whitespace-nowrap" />
                        ) : (
                          <Chip
                            label={(
                              <>
                                <span className="md-numeric">{item.status.year}</span>
                                년 상반기 오픈 예정
                              </>
                            )}
                            color="warning"
                            className="shrink-0 whitespace-nowrap"
                          />
                        )}
                      </span>
                      <span className={styles.serviceDescription}>
                        {item.desc}
                      </span>
                    </>
                  );

                  return 'href' in item ? (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={styles.serviceItem}
                      aria-current={activeSection === 'service' ? 'location' : undefined}
                      onClick={() => setServiceOpen(false)}
                    >
                      {contents}
                    </Link>
                  ) : (
                    <div
                      key={item.label}
                      aria-disabled="true"
                      className={styles.serviceItem}
                    >
                      {contents}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {NAV_LINKS.map((l) => (
          <a key={l.href} href={l.href} className={`${linkCls} ${overDarkLinkCls}`} aria-current={l.href === `#${activeSection}` ? 'location' : undefined}>
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
        className={styles.mobileToggle}
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
          className={styles.mobilePanel}
        >
          <a
            href="#service"
            aria-current={activeSection === 'service' ? 'location' : undefined}
            className={`${linkCls} py-2.5`}
            onClick={() => setOpen(false)}
          >
            서비스 설명
          </a>
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              aria-current={l.href === `#${activeSection}` ? 'location' : undefined}
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
