import type { DrizzleGuestJourneyRepository } from "../repositories/drizzle/guest-journey";
import { sendSlackThread } from "@/lib/integrations/slack-thread";
import { logger } from "@/lib/observability/logger";
import { getGuestJourneyRepo } from "../repositories/factory";
import type { Tx } from "../repositories/types";
export const guestJourneyEnabled = () =>
  process.env.GUEST_RFP_SLACK_THREADS_ENABLED === "true";
/** Savepoint isolates optional telemetry failures from the business transaction. */
export async function withGuestJourney(
  tx: Tx,
  work: (repo: DrizzleGuestJourneyRepository) => Promise<unknown>,
  force = false,
) {
  // Existing threads still need ownership/retirement bookkeeping during rollback.
  // These hooks never create a journey; disabled collection cannot enroll new drafts.
  if (!force && process.env.GUEST_RFP_SLACK_THREADS_ENABLED === undefined) return;
  try {
    await tx.transaction(async (savepoint: Tx) =>
      work(await getGuestJourneyRepo(savepoint)),
    );
  } catch {
    logger.warn("guest_journey.lifecycle_failed");
  }
}
export async function flushGuestJourneys(limit = 20) {
  // Explicit false stops collection/delivery but keeps the retention job running.
  if (process.env.GUEST_RFP_SLACK_THREADS_ENABLED === undefined) return;
  try {
    const repo = await getGuestJourneyRepo();
    await repo.cleanup(new Date());
    if (!guestJourneyEnabled()) return;
    const service = new GuestJourneyService(
      repo,
      sendSlackThread,
      process.env.SLACK_GUEST_CHANNEL_ID ?? "",
    );
    for (let n = 0; n < limit; n++) {
      if (!(await service.flushOne())) break;
      if (n + 1 < limit)
        await new Promise((resolve) => setTimeout(resolve, 1100));
    }
  } catch {
    logger.warn("guest_journey.flush_failed");
  }
}
export class GuestJourneyService {
  constructor(
    private readonly repo: DrizzleGuestJourneyRepository,
    private readonly send = sendSlackThread,
    private readonly channel = "",
  ) {}
  async flushOne(now?: Date) {
    if (!this.channel) return false;
    const batch = await this.repo.claim(
      now ?? new Date(),
      process.env.GA_GUEST_EXPLORATION_URL,
    );
    if (!batch) return false;
    const result = await this.send({
      channel: batch.channel ?? this.channel,
      text: batch.text,
      ...(batch.threadTs ? { threadTs: batch.threadTs } : {}),
      ...(batch.updateTs ? { updateTs: batch.updateTs } : {}),
    }).catch(() => ({ status: "unknown" as const }));
    await this.repo.finish(batch.id, result, now ?? new Date());
    if (result.status !== "sent")
      logger.warn("guest_journey.delivery", {
        batchId: batch.id,
        status: result.status,
      });
    return true;
  }
}
