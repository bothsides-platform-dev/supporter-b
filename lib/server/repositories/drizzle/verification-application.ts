import { verificationApplications } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { VerificationApplicationRepo, Tx } from '../types';

export class DrizzleVerificationApplicationRepository
  implements VerificationApplicationRepo
{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
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
