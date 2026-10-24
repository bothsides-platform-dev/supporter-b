import { verificationApplications, adminAuditLogs } from '@/lib/db/schema';
import type { VerificationApplicationRepo, Tx } from '../types';

export class DrizzleVerificationApplicationRepository
  implements VerificationApplicationRepo
{

  constructor(private readonly _db: Tx) {}

  private h(tx?: Tx): Tx {
    return tx ?? this._db;
  }

  async create(
    params: { id: string; workspaceId: string; orgType: 'buyer' | 'pg'; autoApproval?: import('@/lib/server/buyer-approval/resolve').BuyerAutoApproval; apickLookup?: import('@/lib/server/buyer-approval/new-business').ApickLookup },
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    const actor = params.autoApproval ? `system:${params.autoApproval.provider}` : undefined;
    const reason = '국세청 개업일 진위 확인·개업 6개월 미만 신규사업체 예외';
    // Only new applications receive automatic approval; legacy rows are untouched.
    await db.insert(verificationApplications).values({
      id: params.id,
      workspaceId: params.workspaceId,
      orgType: params.orgType,
      ...(params.autoApproval ? {
        status: 'approved' as const,
        reviewedBy: actor,
        reviewedAt: new Date(params.autoApproval.checkedAt),
        reason,
      } : {}),
    });
    if (params.apickLookup) {
      await db.insert(adminAuditLogs).values({
        actor: 'system:apick', action: 'workspace.apick_lookup',
        entityType: 'verification_application', entityId: params.id,
        payloadJson: { after: { ...params.apickLookup } },
      });
    }
    if (params.autoApproval) {
      await db.insert(adminAuditLogs).values({
        actor: actor!, action: 'workspace.auto_approve',
        entityType: 'verification_application', entityId: params.id,
        payloadJson: {
          after: { ...params.autoApproval, applicationId: params.id, workspaceId: params.workspaceId, status: 'approved', workspaceStatus: 'active', grade: 'sole', gradeSource: 'new_business_exception', ntsStatus: 'active' },
          reason,
        },
      });
    }
  }
}
