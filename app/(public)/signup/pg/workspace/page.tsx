import { getWorkspaceRepo } from '@/lib/server/repositories/factory';
import PgWorkspaceStep from './PgWorkspaceStep';

// The available companies belong to the runtime database, not the CI build.
export const dynamic = 'force-dynamic';

export default async function PgWorkspacePage() {
  const repo = await getWorkspaceRepo();
  const canonicalCompanies = await repo.listCanonicalPgWorkspaces();
  return <PgWorkspaceStep canonicalCompanies={canonicalCompanies} />;
}
