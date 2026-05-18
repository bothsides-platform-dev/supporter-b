export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer
      className="w-full border-t border-[var(--md-sys-color-outline-variant)]"
      style={{ backgroundColor: 'var(--md-sys-color-surface)' }}
    >
      <div className="max-w-[1200px] mx-auto px-8 py-10">
        {/* Top row: brand + nav */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          {/* Brand */}
          <div className="flex flex-col gap-3">
            <span
              className="text-[11px] tracking-[0.18em] uppercase"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--md-sys-color-on-surface-variant)' }}
            >
              BIDIT CORP.
            </span>
            <p
              className="text-[13px] leading-relaxed max-w-[260px]"
              style={{ fontFamily: 'var(--font-sans)', color: 'var(--md-sys-color-on-surface-variant)' }}
            >
              PG사 영업담당자와 구매사를 연결하는
              <br />
              비공개 1:N RFP 플랫폼
            </p>
          </div>

          {/* Nav links */}
          <nav className="flex flex-col sm:flex-row gap-6 sm:gap-12">
            <div className="flex flex-col gap-2">
              <span
                className="text-[10px] tracking-[0.2em] uppercase mb-1"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--md-sys-color-outline)' }}
              >
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
                  className="text-[13px] transition-opacity duration-150 hover:opacity-100"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    color: 'var(--md-sys-color-on-surface-variant)',
                    opacity: 0.8,
                  }}
                >
                  {link.label}
                </a>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <span
                className="text-[10px] tracking-[0.2em] uppercase mb-1"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--md-sys-color-outline)' }}
              >
                법적 고지
              </span>
              {[
                { label: '서비스 이용약관', href: '#' },
                { label: '개인정보 처리방침', href: '#' },
                { label: '전자금융거래 약관', href: '#' },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-[13px] transition-opacity duration-150 hover:opacity-100"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    color: 'var(--md-sys-color-on-surface-variant)',
                    opacity: 0.8,
                  }}
                >
                  {link.label}
                </a>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <span
                className="text-[10px] tracking-[0.2em] uppercase mb-1"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--md-sys-color-outline)' }}
              >
                고객지원
              </span>
              {[
                { label: '공지사항', href: '#' },
                { label: '문의하기', href: 'mailto:support@bidit.io' },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-[13px] transition-opacity duration-150 hover:opacity-100"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    color: 'var(--md-sys-color-on-surface-variant)',
                    opacity: 0.8,
                  }}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </nav>
        </div>

        {/* Divider */}
        <div className="mt-10 mb-6 border-t border-[var(--md-sys-color-outline-variant)]" />

        {/* Bottom row: business info + copyright */}
        <div className="flex flex-col gap-4">
          {/* Copyright + editorial mark */}
          <div className="flex items-center justify-between">
            <span
              className="text-[11px]"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--md-sys-color-outline)' }}
            >
              © {year} BIDIT CORP. ALL RIGHTS RESERVED.
            </span>
            <span
              className="text-[10px] tracking-[0.15em]"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--md-sys-color-outline)', opacity: 0.6 }}
            >
              ISSUE 001 · v0
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
