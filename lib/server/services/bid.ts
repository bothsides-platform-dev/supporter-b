import { eq } from 'drizzle-orm';

import { bids } from '@/lib/db/schema';
import type {
  BidRepo,
  InvitationRepo,
} from '@/lib/server/repositories/types';

export type Actor = { userId: string; workspaceId: string };

export type ServiceResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export class BidService {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly _db: any,
    private readonly bidRepo: BidRepo,
    private readonly invitationRepo: InvitationRepo,
  ) {}

  async withdraw(bidId: string, actor: Actor): Promise<ServiceResult> {
    const bid = await this.bidRepo.findById(bidId);
    if (!bid) return { ok: false, error: 'BID_NOT_FOUND' };

    if (bid.pgWsId !== actor.workspaceId) {
      return { ok: false, error: 'FORBIDDEN' };
    }

    const canAccess = await this.invitationRepo.canAccess(bid.rfpId, actor.workspaceId);
    if (!canAccess) return { ok: false, error: 'FORBIDDEN' };

    if (bid.status === 'withdrawn') return { ok: true };

    await this._db.update(bids).set({ status: 'withdrawn' }).where(eq(bids.id, bid.id));

    return { ok: true };
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var -- global augmentation requires var
  var __bidit_bid_service__: BidService | undefined;
}

export async function getBidService(): Promise<BidService> {
  if (!globalThis.__bidit_bid_service__) {
    const [
      { db },
      { getBidRepo, getInvitationRepo },
    ] = await Promise.all([
      import('@/lib/db/client'),
      import('@/lib/server/repositories/factory'),
    ]);

    const [bidRepo, invRepo] = await Promise.all([getBidRepo(), getInvitationRepo()]);

    globalThis.__bidit_bid_service__ = new BidService(db, bidRepo, invRepo);
  }
  return globalThis.__bidit_bid_service__!;
}

export function __resetBidServiceForTest(): void {
  globalThis.__bidit_bid_service__ = undefined;
}

export function __setBidServiceForTest(service: BidService): void {
  globalThis.__bidit_bid_service__ = service;
}
