// Workspace-action harness — a thin alias over the shared server harness
// (lib/server/__tests__/_harness.ts).
export {
  setupServerTestEnv as setupWorkspaceActionEnv,
  teardownServerTestEnv as teardownWorkspaceActionEnv,
} from '@/lib/server/__tests__/_harness';
