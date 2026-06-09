import { Logo } from '@/components/primitives/Logo';
import { LandingHeaderNav } from '@/components/landing/LandingHeaderNav';

export function PgLanding() {
  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface)] flex flex-col">
      {/* ── Nav ── */}
      <header className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-8 h-[var(--shell-topbar)] border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)]">
        <Logo />
        <div className="flex items-center gap-[var(--s-3)]">
          <LandingHeaderNav />
        </div>
      </header>

      <main className="flex-1 pt-[var(--shell-topbar)] flex items-center justify-center">
        PG 랜딩화면
      </main>
    </div>
  );
}
