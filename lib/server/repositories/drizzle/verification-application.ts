import { verificationApplications } from '@/lib/db/schema';
import type { VerificationApplicationRepo, Tx } from '../types';

export class DrizzleVerificationApplicationRepository
  implements VerificationApplicationRepo
{

  constructor(private readonly _db: Tx) {}

  private h(tx?: Tx): Tx {
    return tx ?? this._db;
  }

  async create(
    params: { id: string; workspaceId: string; orgType: 'buyer' | 'pg' },
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    // status (default 'submitted'), submittedAt (default now()) are left to the
    // DB — this matches the insert in _createWorkspace.ts.
    await db.insert(verificationApplications).values({
      id: params.id,
      workspaceId: params.workspaceId,
      orgType: params.orgType,
    });
  }
}
