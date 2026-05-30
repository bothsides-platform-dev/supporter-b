import { desc, eq } from 'drizzle-orm';
import { workspaces, verificationApplications, pgProfiles } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { getWorkspaceAdminUser } from './workspaceOwner';
import type { PgliteDB } from '@/lib/db/client-pglite';

type DB = ReturnType<typeof actionDb> | PgliteDB;

export interface PendingApplicationRow {
  applicationId: string;
  workspaceId: string;
  workspaceName: string;
  orgType: string;
  status: string;
  submittedAt: Date;
  reviewedAt: Date | null;
}

export async function listPendingApplications(db: DB = actionDb()): Promise<PendingApplicationRow[]> {
  const rows = await (db as PgliteDB)
    .select({
      applicationId: verificationApplications.id,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      orgType: verificationApplications.orgType,
      status: verificationApplications.status,
      submittedAt: verificationApplications.submittedAt,
      reviewedAt: verificationApplications.reviewedAt,
    })
    .from(verificationApplications)
    .innerJoin(workspaces, eq(verificationApplications.workspaceId, workspaces.id))
    .where(eq(verificationApplications.status, 'submitted'))
    .orderBy(desc(verificationApplications.submittedAt));
  return rows as PendingApplicationRow[];
}

export async function getApplicationDetail(applicationId: string, db: DB = actionDb()) {
  const [app] = await db
    .select()
    .from(verificationApplications)
    .where(eq(verificationApplications.id, applicationId));
  if (!app) return null;

  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, app.workspaceId));

  const [profile] = await db
    .select()
    .from(pgProfiles)
    .where(eq(pgProfiles.workspaceId, app.workspaceId));

  const ownerContact = await getWorkspaceAdminUser(app.workspaceId, db);

  return { application: app, workspace: ws, pgProfile: profile ?? null, ownerContact };
}
