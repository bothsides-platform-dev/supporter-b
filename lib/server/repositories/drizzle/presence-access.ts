import { and, eq, or } from 'drizzle-orm';
import {
  chatConversations,
  rfpInvitations,
  rfpPgRequests,
  rfps,
} from '@/lib/db/schema';
import type { PresenceAccessRepo, Tx } from '../types';

/**
 * presence:ws:<targetWsId> subscribe-proxy ACL 의 관계 술어 단일 출처.
 *
 * 허가 = (a) 자기 자신 ∨ (b) 대화 ∨ (c) RFP 초대 쌍 ∨ (d) pending 콜드피치 쌍.
 * observerWsId는 연결 JWT의 server-only meta에서 오며, route가 그 사용자에게
 * active/approved 실효 멤버십이 있는지 먼저 확인한다. 이 저장소는 그 정확한
 * workspace 쌍의 관계만 판정한다. rejected 콜드피치는 허가하지 않는다.
 */
export class DrizzlePresenceAccessRepository implements PresenceAccessRepo {

  constructor(private readonly _db: Tx) {}

  private h(tx?: Tx): Tx {
    return tx ?? this._db;
  }

  async canObserve(observerWsId: string, targetWsId: string, tx?: Tx): Promise<boolean> {
    const db = this.h(tx);

    // (a) 자기 브로드캐스트·팀 동료 점.
    if (observerWsId === targetWsId) return true;

    const pair = or(
      and(
        eq(chatConversations.buyerWsId, observerWsId),
        eq(chatConversations.pgWsId, targetWsId),
      ),
      and(
        eq(chatConversations.buyerWsId, targetWsId),
        eq(chatConversations.pgWsId, observerWsId),
      ),
    );

    // (b) signed observer workspace와 대상 사이에 대화 존재.
    const [conv] = await db
      .select({ one: chatConversations.id })
      .from(chatConversations)
      .where(pair)
      .limit(1);
    if (conv) return true;

    // (c) RFP 초대 쌍 — 상태 무관(초대 관리 화면은 pending 칩도 보여준다).
    const [inv] = await db
      .select({ one: rfpInvitations.id })
      .from(rfpInvitations)
      .innerJoin(rfps, eq(rfps.id, rfpInvitations.rfpId))
      .where(
        or(
          and(
            eq(rfps.buyerWsId, observerWsId),
            eq(rfpInvitations.pgWsId, targetWsId),
          ),
          and(
            eq(rfps.buyerWsId, targetWsId),
            eq(rfpInvitations.pgWsId, observerWsId),
          ),
        ),
      )
      .limit(1);
    if (inv) return true;

    // (d) pending 콜드피치 쌍 — rejected 는 영구 거절이라 제외.
    const [req] = await db
      .select({ one: rfpPgRequests.id })
      .from(rfpPgRequests)
      .innerJoin(rfps, eq(rfps.id, rfpPgRequests.rfpId))
      .where(
        and(
          eq(rfpPgRequests.status, 'pending'),
          or(
            and(
              eq(rfps.buyerWsId, observerWsId),
              eq(rfpPgRequests.pgWsId, targetWsId),
            ),
            and(
              eq(rfps.buyerWsId, targetWsId),
              eq(rfpPgRequests.pgWsId, observerWsId),
            ),
          ),
        ),
      )
      .limit(1);
    return Boolean(req);
  }
}
