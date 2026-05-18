import type { RfpInvitation } from '@/lib/types/invitation';
import type { RFP } from '@/lib/types/rfp';
import { hashToken, isExpired } from '../../token';
import type { InvitationRepo, RfpRepo, TokenClaimResult, Tx } from '../types';

export class InMemoryInvitationRepository implements InvitationRepo {
  private store = new Map<string, RfpInvitation>();
  private tokenHashIndex = new Map<string, string>(); // hash → id
  // Optional getter for the RFP repo so findByPgWorkspace can hydrate the
  // JOIN shape without inverting factory ordering. Wired by the factory;
  // tests that only exercise invitation-only methods can leave it unset.
  private rfpRepoRef?: () => RfpRepo;

  setRfpRepoRef(getter: () => RfpRepo): void {
    this.rfpRepoRef = getter;
  }

  async save(inv: RfpInvitation, rawToken: string, _tx?: Tx): Promise<void> {
    void _tx;
    this.store.set(inv.id, { ...inv });
    this.tokenHashIndex.set(hashToken(rawToken), inv.id);
  }

  async findById(id: string, _tx?: Tx): Promise<RfpInvitation | undefined> {
    void _tx;
    const inv = this.store.get(id);
    return inv ? { ...inv } : undefined;
  }

  async findByRfp(rfpId: string, _tx?: Tx): Promise<RfpInvitation[]> {
    void _tx;
    return [...this.store.values()]
      .filter((i) => i.rfpId === rfpId)
      .map((i) => ({ ...i }));
  }

  async findDraftsByRfp(rfpId: string, _tx?: Tx): Promise<RfpInvitation[]> {
    void _tx;
    return [...this.store.values()]
      .filter((i) => i.rfpId === rfpId && i.status === 'draft')
      .map((i) => ({ ...i }));
  }

  async findByTokenHash(
    tokenHash: string,
    _tx?: Tx,
  ): Promise<RfpInvitation | undefined> {
    void _tx;
    const id = this.tokenHashIndex.get(tokenHash);
    if (!id) return undefined;
    const inv = this.store.get(id);
    return inv ? { ...inv } : undefined;
  }

  async findByPgWorkspace(
    pgWsId: string,
    _tx?: Tx,
  ): Promise<{ invitation: RfpInvitation; rfp: RFP }[]> {
    void _tx;
    if (!this.rfpRepoRef) return [];
    const rfpRepo = this.rfpRepoRef();
    const active = [...this.store.values()].filter(
      (i) =>
        i.pgWsId === pgWsId &&
        (i.status === 'sent' || i.status === 'opened' || i.status === 'accepted'),
    );
    const out: { invitation: RfpInvitation; rfp: RFP }[] = [];
    for (const inv of active) {
      const rfp = await rfpRepo.findById(inv.rfpId);
      if (rfp) out.push({ invitation: { ...inv }, rfp });
    }
    return out;
  }

  async claimToken(
    rawToken: string,
    userId: string,
    _tx?: Tx,
  ): Promise<TokenClaimResult> {
    void _tx;
    const hash = hashToken(rawToken);
    const id = this.tokenHashIndex.get(hash);
    if (!id) return { ok: false, reason: 'invalid' };

    const inv = this.store.get(id)!;
    if (isExpired(inv.expiresAt)) return { ok: false, reason: 'expired' };
    if (inv.acceptedByUserId) return { ok: false, reason: 'used' };

    const updated: RfpInvitation = {
      ...inv,
      acceptedByUserId: userId,
      status: 'accepted',
    };
    this.store.set(id, updated);
    return { ok: true, invitation: { ...updated } };
  }

  async markOpened(
    invitationId: string,
    openedAt: Date,
    _tx?: Tx,
  ): Promise<void> {
    void _tx;
    const inv = this.store.get(invitationId);
    if (!inv) return;
    // pending('sent') / accepted 만 전이 대상. 나머지 status 는 no-op.
    if (inv.status !== 'sent' && inv.status !== 'accepted') return;
    this.store.set(invitationId, {
      ...inv,
      status: 'opened',
      openedAt: openedAt.toISOString(),
    });
  }

  // 워크스페이스 멤버십 단위 접근권 — 초대된 PG ws의 모든 멤버가 통과.
  async canAccess(rfpId: string, pgWsId: string, _tx?: Tx): Promise<boolean> {
    void _tx;
    return [...this.store.values()].some(
      (i) =>
        i.rfpId === rfpId &&
        i.pgWsId === pgWsId &&
        (i.status === 'sent' ||
          i.status === 'opened' ||
          i.status === 'accepted'),
    );
  }

  clear(): void {
    this.store.clear();
    this.tokenHashIndex.clear();
  }
}
