import type { WorkspaceRepo } from '@/lib/server/repositories/types';
import type { RFP } from '@/lib/types/rfp';

export type SigningRecipient = { userId: string; workspaceId: string; email: string };

export function signingPartyLink(
  recipient: { workspaceId: string | null },
  rfp: RFP,
): string {
  return recipient.workspaceId === rfp.buyerWsId
    ? `/rfp/${rfp.code}`
    : `/inbox/${rfp.code}`;
}

export async function signingPartyRecipients(
  workspaceRepo: WorkspaceRepo,
  rfp: RFP,
  pgWsId: string | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
): Promise<SigningRecipient[]> {
  const buyer = await workspaceRepo.approvedMemberRecipients(rfp.buyerWsId, tx);
  const pg = pgWsId ? await workspaceRepo.approvedMemberRecipients(pgWsId, tx) : [];
  return [
    ...buyer.map((member) => ({
      userId: member.userId,
      workspaceId: rfp.buyerWsId,
      email: member.email,
    })),
    ...pg.map((member) => ({
      userId: member.userId,
      workspaceId: pgWsId!,
      email: member.email,
    })),
  ];
}
