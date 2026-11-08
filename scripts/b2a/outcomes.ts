import { runOutcomesCli } from "./outcomes-cli";

void runOutcomesCli(process.argv.slice(2), {
  databaseUrl: process.env.DATABASE_URL,
  loadServices: () => import("../../lib/server/services/partner-outcomes"),
  stdout: (text) => {
    process.stdout.write(text);
  },
  stderr: (text) => {
    process.stderr.write(text);
  },
})
  .then((code) => {
    process.exitCode = code;
  })
  .finally(async () => {
    await globalThis.__bidit_pg__?.end({ timeout: 1 }).catch(() => {});
  });
