import { notFound } from 'next/navigation';
import { getBuyerDetail } from '@/lib/server/queries/admin/buyers';
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge';
import Link from 'next/link';

export default async function BuyerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getBuyerDetail(id);
  if (!detail) notFound();

  const { workspace, rfps } = detail;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <h1 className="text-headline-small font-semibold">{workspace.name}</h1>
        <AdminStatusBadge status={workspace.status} />
      </div>

      <section>
        <h2 className="text-title-small font-semibold mb-3">RFP 현황 ({rfps.length}건)</h2>
        <div className="rounded border border-outline-variant overflow-hidden">
          <table className="w-full text-body-small">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">코드</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">제목</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">상태</th>
                <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">마감</th>
              </tr>
            </thead>
            <tbody>
              {rfps.map((rfp) => (
                <tr key={rfp.id} className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low">
                  <td className="px-4 py-3 font-mono text-label-small">{rfp.code}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/rfps/${rfp.id}`} className="text-primary hover:underline">{rfp.title}</Link>
                  </td>
                  <td className="px-4 py-3">
                    <AdminStatusBadge status={rfp.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-label-small text-on-surface-variant">
                    {rfp.deadline ? new Date(rfp.deadline).toLocaleDateString('ko-KR') : '—'}
                  </td>
                </tr>
              ))}
              {rfps.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-on-surface-variant">RFP 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
