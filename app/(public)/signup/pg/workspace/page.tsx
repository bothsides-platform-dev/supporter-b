import { getWorkspaceRepo } from '@/lib/server/repositories/factory';
import PgWorkspaceStep from './PgWorkspaceStep';

export default async function PgWorkspacePage() {
  const repo = await getWorkspaceRepo();
  const canonicalCompanies = await repo.listCanonicalPgWorkspaces();
  return <PgWorkspaceStep canonicalCompanies={canonicalCompanies} />;
}
