export type SlackThreadResult =
  | { status: "sent"; channel: string; ts: string }
  | { status: "retry"; retryAfterMs: number }
  | { status: "unknown" | "failed" };
export async function sendSlackThread(input: {
  channel: string;
  text: string;
  threadTs?: string;
  updateTs?: string;
}): Promise<SlackThreadResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token || input.text.length > 39000) return { status: "failed" };
  try {
    const response = await fetch(
      `https://slack.com/api/${input.updateTs ? "chat.update" : "chat.postMessage"}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: input.channel,
          text: input.text,
          parse: "none",
          ...(input.updateTs
            ? { ts: input.updateTs }
            : {
                ...(input.threadTs ? { thread_ts: input.threadTs } : {}),
                reply_broadcast: false,
                unfurl_links: false,
                unfurl_media: false,
              }),
        }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (response.status === 429) {
      const seconds = Number(response.headers.get("retry-after"));
      await response.body?.cancel();
      return {
        status: "retry",
        retryAfterMs:
          Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60000,
      };
    }
    if (response.status >= 500) return { status: "unknown" };
    if (!response.ok) return { status: "failed" };
    const body = await response.json();
    if (body.ok === false) return { status: "failed" };
    if (
      body.ok !== true ||
      typeof body.channel !== "string" ||
      !/^[CG][A-Z0-9]+$/.test(body.channel) ||
      typeof body.ts !== "string" ||
      !/^\d+\.\d+$/.test(body.ts)
    )
      return { status: "unknown" };
    return { status: "sent", channel: body.channel, ts: body.ts };
  } catch {
    // A request may have reached Slack. Never blindly retry, or log tokens/text.
    return { status: "unknown" };
  }
}
