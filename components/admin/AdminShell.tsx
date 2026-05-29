import Link from 'next/link';
import { logoutAction } from '@/app/admin/login/actions';

const NAV = [
  { href: '/admin', label: '대시보드' },
  { href: '/admin/review', label: '입점 심사' },
  { href: '/admin/buyers', label: '구매사' },
  { href: '/admin/sellers', label: '판매사' },
  { href: '/admin/rfps', label: 'RFP' },
  { href: '/admin/audit-log', label: '감사 로그' },
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="w-52 flex-shrink-0 border-r border-outline-variant bg-surface flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant">
          <div className="h-5 w-5 rounded bg-primary" />
          <span className="text-label-large font-semibold">Supporter B Admin</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center px-4 py-2 text-body-medium text-on-surface hover:bg-surface-container-low"
            >
              {label}
            </Link>
          ))}
        </nav>
        <form action={logoutAction} className="p-3 border-t border-outline-variant">
          <button type="submit" className="w-full text-left px-3 py-2 text-body-small text-on-surface-variant hover:bg-surface-container-low rounded">
            로그아웃
          </button>
        </form>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>
    </div>
  );
}
