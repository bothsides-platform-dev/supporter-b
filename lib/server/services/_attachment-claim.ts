export class AttachmentClaimMismatchError extends Error {}

export function assertAttachmentClaimed(claimedIds: string[], requestedIds: string[]): void {
  if (claimedIds.length !== requestedIds.length) throw new AttachmentClaimMismatchError();
}
