// Notification-action harness — a thin alias over the shared server harness
// (lib/server/__tests__/_harness.ts).
export {
  setupServerTestEnv as setupNotifActionEnv,
  teardownServerTestEnv as teardownNotifActionEnv,
} from '@/lib/server/__tests__/_harness';
