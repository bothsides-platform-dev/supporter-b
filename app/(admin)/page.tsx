import { getDashboardStats, getHotlist } from '@/lib/server/queries/admin/dashboard';

export default async function AdminDashboardPage() {
  const [stats, hotlist] = await Promise.all([getDashboardStats(), getHotlist()]);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-headline-small font-semibold">대시보드</h1>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="심사 대기" value={stats.pendingReviewCount} href="/admin/review" />
        <StatCard label="SLA 초과" value={stats.slaOverdueCount} href="/admin/review?filter=sla" alert />
        <StatCard label="진행 중 RFP" value={stats.activeRfpCount} href="/admin/rfps" />
      </div>

      {hotlist.length > 0 && (
        <section>
          <h2 className="text-title-medium font-semibold mb-3">핫리스트</h2>
          <div className="rounded border border-outline-variant overflow-hidden">
            {hotlist.map((item) => (
              <a
                key={`${item.type}-${item.entityId}`}
                href={item.href}
                className="flex items-center justify-between px-4 py-3 border-b border-outline-variant last:border-0 hover:bg-surface-container-low"
              >
                <div>
                  <span className="text-body-medium">{item.label}</span>
                  <span className="ml-3 text-body-small text-on-surface-variant">{item.subLabel}</span>
                </div>
                <span className="text-label-small text-primary">→</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
  alert,
}: {
  label: string;
  value: number;
  href: string;
  alert?: boolean;
}) {
  return (
    <a
      href={href}
      className="block rounded border border-outline-variant bg-surface p-4 hover:bg-surface-container-low"
    >
      <div className="text-body-small text-on-surface-variant">{label}</div>
      <div
        className={`mt-1 md-numeric text-3xl font-bold ${alert && value > 0 ? 'text-error' : 'text-on-surface'}`}
      >
        {value}
      </div>
    </a>
  );
}
