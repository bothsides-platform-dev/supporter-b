import Link from 'next/link';
import type { DashboardKpi } from '@/lib/server/dashboard/buildDashboard';

export function KpiStrip({ kpis }: { kpis: DashboardKpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {kpis.map((kpi) => (
        <Link
          key={kpi.id}
          href={kpi.href}
          className="flex flex-col gap-1 rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-4 py-3 transition-colors hover:bg-[var(--md-sys-color-surface-container)]"
        >
          <span className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">{kpi.label}</span>
          <span className="md-numeric text-[22px] font-semibold text-[var(--md-sys-color-on-surface)]">{kpi.value}</span>
        </Link>
      ))}
    </div>
  );
}
