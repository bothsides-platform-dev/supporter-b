import type { RFP, RfpStatus } from '@/lib/types/rfp';
import { assertTransition } from '../../rfp-state';
import type { RfpRepo, Tx } from '../types';

export class InMemoryRfpRepository implements RfpRepo {
  private store = new Map<string, RFP>();

  async save(rfp: RFP, _tx?: Tx): Promise<void> {
    void _tx;
    this.store.set(rfp.id, { ...rfp });
  }

  async findById(id: string, _tx?: Tx): Promise<RFP | undefined> {
    void _tx;
    const rfp = this.store.get(id);
    return rfp ? { ...rfp } : undefined;
  }

  async findByBuyerWs(wsId: string, _tx?: Tx): Promise<RFP[]> {
    void _tx;
    return [...this.store.values()]
      .filter((r) => r.buyerWsId === wsId)
      .map((r) => ({ ...r }));
  }

  async findByShareToken(token: string, _tx?: Tx): Promise<RFP | undefined> {
    void _tx;
    const rfp = [...this.store.values()].find((r) => r.shareToken === token);
    return rfp ? { ...rfp } : undefined;
  }

  async transition(
    id: string,
    to: RfpStatus,
    patch?: Partial<RFP>,
    _tx?: Tx,
  ): Promise<RFP> {
    void _tx;
    const rfp = this.store.get(id);
    if (!rfp) throw new Error(`RFP not found: ${id}`);
    assertTransition(rfp.status, to);
    const updated: RFP = { ...rfp, ...patch, status: to };
    this.store.set(id, updated);
    return { ...updated };
  }

  clear(): void {
    this.store.clear();
  }
}
