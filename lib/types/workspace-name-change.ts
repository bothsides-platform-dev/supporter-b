export type WorkspaceNameChangeRequestStatus = 'pending' | 'approved' | 'rejected';

export type WorkspaceNameChangeRequest = {
  id: string;
  workspaceId: string;
  requestedByUserId: string;
  currentName: string;
  requestedName: string;
  status: WorkspaceNameChangeRequestStatus;
  reviewedBy: string | null;
  reason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
};
