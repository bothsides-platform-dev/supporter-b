import { listAuditLogs } from '@/lib/server/queries/admin/audit-log';

export default async function AuditLogPage() {
  const logs = await listAuditLogs(200);

  return (
    <div className="space-y-4">
      <h1 className="text-headline-small font-semibold">감사 로그</h1>
      <div className="rounded border border-outline-variant overflow-hidden">
        <table className="w-full text-body-small">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">시각</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">액션</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">대상 타입</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">대상 ID</th>
              <th className="px-4 py-2 text-left text-label-small text-on-surface-variant font-medium">Actor</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr
                key={log.id}
                className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low"
              >
                <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant whitespace-nowrap">
                  {new Date(log.occurredAt).toLocaleString('ko-KR')}
                </td>
                <td className="px-4 py-3 md-numeric text-label-small">{log.action}</td>
                <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant">{log.entityType}</td>
                <td className="px-4 py-3 md-numeric text-label-small text-on-surface-variant">
                  {log.entityId.slice(0, 8)}&hellip;
                </td>
                <td className="px-4 py-3 text-label-small text-on-surface-variant">{log.actor}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-on-surface-variant">
                  감사 로그가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
