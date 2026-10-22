import { getWorkspaceMembership } from '../workspace-membership';
import { getGuestDraftService } from '../guest-drafts';
import { purgeUnverifiedSignup as purge } from '../purge-unverified-signup';
import type { Tx } from '@/lib/server/repositories/types';
import type { CreateWorkspaceInput } from '../workspace-membership/create-workspace';

export async function createWorkspaceInTx(tx: Tx, input: CreateWorkspaceInput) {
  return (await getWorkspaceMembership()).create(tx, input);
}

export async function purgeUnverifiedSignup(tx: Tx, email: string, returningGuestDraft?: { id: string; secret: string }) {
  return purge(tx, email, await getGuestDraftService(), returningGuestDraft);
}
