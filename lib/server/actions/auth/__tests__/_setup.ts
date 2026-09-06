// Auth-action harness — a thin alias over the shared server harness
// (lib/server/__tests__/_harness.ts). Kept so the 15 auth test files keep
// importing `setupActionEnv` / `teardownActionEnv` from `./_setup`.
export {
  setupServerTestEnv as setupActionEnv,
  teardownServerTestEnv as teardownActionEnv,
} from '@/lib/server/__tests__/_harness';
