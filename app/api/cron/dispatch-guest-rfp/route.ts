import { getGuestRequestRepo } from "@/lib/server/repositories/factory";
import { getGuestRequestService } from "@/lib/server/services/guest-requests";
import { logger } from "@/lib/observability/logger";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("x-cron-secret") !== secret)
    return new Response(null, { status: 401 });
  if (process.env.GUEST_RFP_AUTO_SEND_ENABLED !== "true")
    return Response.json({ paused: true });
  const service = await getGuestRequestService();
  const rows = await (await getGuestRequestRepo()).pending();
  let failed = 0;
  for (const row of rows) {
    try {
      await service.dispatch(row.id);
    } catch {
      failed++;
      logger.error("guest_request.dispatch_failed", { draftId: row.id });
    }
  }
  return Response.json({ processed: rows.length, failed });
}
