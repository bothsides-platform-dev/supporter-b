import { ThemeToggle } from '@/components/shell/ThemeToggle';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer
      role="contentinfo"
      className="w-full border-t border-[var(--md-sys-color-outline-variant)]"
      style={{ backgroundColor: 'var(--md-sys-color-surface)' }}
    >
      <div className="max-w-[1200px] mx-auto px-8 py-10">
        {/* Top row: brand + nav */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          {/* Brand */}
          <div className="flex flex-col gap-3">
            <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
              서포트비 CORP.
            </span>
            <p className="font-sans text-[13px] leading-relaxed max-w-[260px] text-[var(--md-sys-color-on-surface-variant)]">
              PG사 영업담당자와 구매사를 연결하는
              <br />
              비공개 1:N 견적 플랫폼
            </p>
          </div>

          {/* Nav links */}
          <nav className="flex flex-col sm:flex-row gap-6 sm:gap-12">
            <div className="flex flex-col gap-2">
              <span className="md-label-small mb-1 text-[var(--md-sys-color-on-surface-variant)]">
                서비스
              </span>
              {[
                { label: '서비스 소개', href: '#' },
                { label: '이용 방법', href: '#' },
                { label: '요금 안내', href: '#' },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="font-sans text-[13px] opacity-80 transition-opacity duration-150 hover:opacity-100 text-[var(--md-sys-color-on-surface-variant)]"
                >
                  {link.label}
                </a>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <span className="md-label-small mb-1 text-[var(--md-sys-color-on-surface-variant)]">
                법적 고지
              </span>
              {[
                { label: '서비스 이용약관', href: 'https://moingclub.notion.site/Supporter-B-363ef44bd15380199b7bd5c5ba2d900e', external: true },
                { label: '개인정보 처리방침', href: 'https://moingclub.notion.site/Supporter-B-363ef44bd15380409aa1eabb4ab5b240', external: true },
                { label: '전자금융거래 약관', href: '#' },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="font-sans text-[13px] opacity-80 transition-opacity duration-150 hover:opacity-100 text-[var(--md-sys-color-on-surface-variant)]"
                >
                  {link.label}
                </a>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <span className="md-label-small mb-1 text-[var(--md-sys-color-on-surface-variant)]">
                고객지원
              </span>
              {[
                { label: '공지사항', href: '#' },
                { label: '문의하기', href: 'mailto:help@support-b.com' },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="font-sans text-[13px] opacity-80 transition-opacity duration-150 hover:opacity-100 text-[var(--md-sys-color-on-surface-variant)]"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </nav>
        </div>

        {/* Divider */}
        <div className="mt-10 mb-6 border-t border-[var(--md-sys-color-outline-variant)]" />

        {/* Bottom row: copyright + theme */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
            © {year} 서포트비 CORP. ALL RIGHTS RESERVED.
          </span>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
