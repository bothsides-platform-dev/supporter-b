import Link from 'next/link';
import { Logo } from '@/components/primitives/Logo';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--md-sys-color-background)] text-[var(--md-sys-color-on-surface)]">
      <header className="border-b border-[var(--md-sys-color-outline-variant)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-5">
          <Logo />
          <Link href="/" className="md-label-large text-[var(--md-sys-color-on-surface-variant)] hover:underline">홈으로</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-12 sm:py-16">{children}</main>
      <footer className="border-t border-[var(--md-sys-color-outline-variant)]">
        <nav aria-label="법적 고지" className="mx-auto flex max-w-4xl flex-wrap gap-x-6 gap-y-3 px-6 py-6 md-label-medium">
          <Link href="/legal/terms" className="hover:underline">이용약관</Link>
          <Link href="/legal/privacy" className="hover:underline">개인정보 처리방침</Link>
          <Link href="/legal/marketing" className="hover:underline">마케팅 수신 동의</Link>
        </nav>
      </footer>
    </div>
  );
}
