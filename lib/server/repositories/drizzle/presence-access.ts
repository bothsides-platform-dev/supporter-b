import { and, eq, or } from 'drizzle-orm';
import {
  chatConversations,
  rfpInvitations,
  rfpPgRequests,
  rfps,
  workspaceMembers,
} from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { PresenceAccessRepo, Tx } from '../types';

/**
 * presence:ws:<targetWsId> subscribe-proxy ACL 의 관계 술어 단일 출처.
 *
 * 허가 = (a) 멤버십 ∨ (b) 대화 ∨ (c) RFP 초대 쌍 ∨ (d) pending 콜드피치 쌍.
 * 프록시 페이로드에는 관찰자의 활성 워크스페이스가 없으므로(connInfo 미전달)
 * 전 멤버십 기준으로 판정한다 — 서명된 JWT `sub`(userId)만 신뢰. 순차 조회는
 * 의도적: (a)/(b)가 트래픽 대부분을 커버하는 인덱스 점조회라 조기 반환이 싸다.
 * 거절된 콜드피치(rejected)는 절대 허가로 승격하지 않는다(거절은 영구).
 */
export class DrizzlePresenceAccessRepository implements PresenceAccessRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  private h(tx?: Tx): Tx {
    return tx ?? this._db;
  }

  async canObserve(userId: string, targetWsId: string, tx?: Tx): Promise<boolean> {
    const db = this.h(tx);

    // (a) 대상 워크스페이스의 멤버 — 자기 브로드캐스트·팀 동료 점.
    const [member] = await db
      .select({ one: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, targetWsId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .limit(1);
    if (member) return true;

    // (b) 관찰자의 어느 소속 워크스페이스와 대상 사이에 대화 존재.
    const [conv] = await db
      .select({ one: chatConversations.id })
      .from(chatConversations)
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.userId, userId),
          or(
            and(
              eq(chatConversations.buyerWsId, targetWsId),
              eq(workspaceMembers.workspaceId, chatConversations.pgWsId),
            ),
            and(
              eq(chatConversations.pgWsId, targetWsId),
              eq(workspaceMembers.workspaceId, chatConversations.buyerWsId),
            ),
          ),
        ),
      )
      .limit(1);
    if (conv) return true;

    // (c) RFP 초대 쌍 — 상태 무관(초대 관리 화면은 pending 칩도 보여준다).
    const [inv] = await db
      .select({ one: rfpInvitations.id })
      .from(rfpInvitations)
      .innerJoin(rfps, eq(rfps.id, rfpInvitations.rfpId))
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.userId, userId),
          or(
            and(
              eq(rfps.buyerWsId, targetWsId),
              eq(workspaceMembers.workspaceId, rfpInvitations.pgWsId),
            ),
            and(
              eq(rfpInvitations.pgWsId, targetWsId),
              eq(workspaceMembers.workspaceId, rfps.buyerWsId),
            ),
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
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.userId, userId),
          or(
            and(
              eq(rfps.buyerWsId, targetWsId),
              eq(workspaceMembers.workspaceId, rfpPgRequests.pgWsId),
            ),
            and(
              eq(rfpPgRequests.pgWsId, targetWsId),
              eq(workspaceMembers.workspaceId, rfps.buyerWsId),
            ),
          ),
        ),
      )
      .where(eq(rfpPgRequests.status, 'pending'))
      .limit(1);
    return Boolean(req);
  }
}
