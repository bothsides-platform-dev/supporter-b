import { count, eq, and, lt, lte, gt, sql } from 'drizzle-orm';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { workspaces, rfps, verificationApplications } from '@/lib/db/schema';

// DB type: either prod actionDb() result (any) or PgliteDB in tests
type DB = ReturnType<typeof actionDb> | PgliteDB;

export interface DashboardStats {
  /** 심사 대기 중인 워크스페이스 수 (status = 'pending') */
  pendingReviewCount: number;
  /** 진행 중인 RFP 수 (status = 'sent') */
  activeRfpCount: number;
  /** SLA 초과 심사 수 (status = 'submitted', submittedAt < now - 24h) */
  slaOverdueCount: number;
}

export interface HotlistItem {
  type: 'sla_overdue' | 'low_response' | 'deadline_approaching' | 'quote_invalid';
  label: string;
  subLabel: string;
  entityId: string;
  href: string;
}

export async function getDashboardStats(db: DB = actionDb()): Promise<DashboardStats> {
  const [pendingRows, activeRfpRows, slaOverdueRows] = await Promise.all([
    // 심사 대기 워크스페이스 (status = 'pending')
    db
      .select({ count: count() })
      .from(workspaces)
      .where(eq(workspaces.status, 'pending')),

    // 진행 중 RFP (status = 'sent')
    db
      .select({ count: count() })
      .from(rfps)
      .where(eq(rfps.status, 'sent')),

    // SLA 초과 심사: status = 'submitted' AND submittedAt < now() - 24h
    db
      .select({ count: count() })
      .from(verificationApplications)
      .where(
        and(
          eq(verificationApplications.status, 'submitted'),
          lt(
            verificationApplications.submittedAt,
            sql`now() - interval '24 hours'`,
          ),
        ),
      ),
  ]);

  return {
    pendingReviewCount: Number(pendingRows[0].count),
    activeRfpCount: Number(activeRfpRows[0].count),
    slaOverdueCount: Number(slaOverdueRows[0].count),
  };
}

export async function getHotlist(db: DB = actionDb()): Promise<HotlistItem[]> {
  const now = new Date();
  const cutoff24h = new Date(now.getTime() - 24 * 3600 * 1000);
  const cutoff48h = new Date(now.getTime() + 48 * 3600 * 1000);

  const [overdueApps, approachingRfps] = await Promise.all([
    // SLA 초과 심사: submitted AND submittedAt < 24h ago, 가장 오래된 것 먼저
    db
      .select({
        id: verificationApplications.id,
        workspaceId: verificationApplications.workspaceId,
        orgType: verificationApplications.orgType,
        submittedAt: verificationApplications.submittedAt,
      })
      .from(verificationApplications)
      .where(
        and(
          eq(verificationApplications.status, 'submitted'),
          lt(verificationApplications.submittedAt, cutoff24h),
        ),
      )
      .orderBy(verificationApplications.submittedAt),

    // 마감 임박 RFP: sent, deadline within 48h (미래), 마감 순 정렬
    db
      .select({
        id: rfps.id,
        code: rfps.code,
        title: rfps.title,
        deadline: rfps.deadline,
      })
      .from(rfps)
      .where(
        and(
          eq(rfps.status, 'sent'),
          gt(rfps.deadline, now),
          lte(rfps.deadline, cutoff48h),
        ),
      )
      .orderBy(rfps.deadline),
  ]);

  const items: HotlistItem[] = [];

  for (const app of overdueApps) {
    const hoursOverdue = Math.floor(
      (now.getTime() - new Date(app.submittedAt).getTime()) / 3600_000,
    );
    items.push({
      type: 'sla_overdue',
      label: `SLA 초과 심사`,
      subLabel: `${app.orgType === 'buyer' ? '구매사' : 'PG사'} · ${hoursOverdue}시간 경과`,
      entityId: app.id,
      href: `/admin/review/${app.workspaceId}`,
    });
  }

  for (const rfp of approachingRfps) {
    const hoursLeft = Math.ceil(
      (new Date(rfp.deadline).getTime() - now.getTime()) / 3600_000,
    );
    items.push({
      type: 'deadline_approaching',
      label: rfp.title,
      subLabel: `마감 ${hoursLeft}시간 전 · ${rfp.code}`,
      entityId: rfp.id,
      href: `/admin/rfps/${rfp.code}`,
    });
  }

  return items;
}
