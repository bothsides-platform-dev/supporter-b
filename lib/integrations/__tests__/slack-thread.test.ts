import { afterEach, expect, it, vi } from "vitest";
import { sendSlackThread } from "../slack-thread";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("stores the Slack channel and timestamp and never broadcasts replies", async () => {
  vi.stubEnv("SLACK_BOT_TOKEN", "test-token");
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) =>
    Response.json({ ok: true, channel: "C123", ts: "123.456" }),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(
    await sendSlackThread({
      channel: "C123",
      text: "hello",
      threadTs: "100.1",
    }),
  ).toEqual({ status: "sent", channel: "C123", ts: "123.456" });
  const payload = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string);
  expect(payload).toMatchObject({
    thread_ts: "100.1",
    reply_broadcast: false,
    unfurl_links: false,
  });
});
it("retries only explicit rate limiting; timeouts and malformed successes are uncertain", async () => {
  vi.stubEnv("SLACK_BOT_TOKEN", "test-token");
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response("", { status: 429, headers: { "Retry-After": "120" } }),
  );
  expect(await sendSlackThread({ channel: "C123", text: "hello" })).toEqual({
    status: "retry",
    retryAfterMs: 120000,
  });
  vi.stubGlobal("fetch", async () => {
    throw new Error("timeout");
  });
  expect(await sendSlackThread({ channel: "C123", text: "hello" })).toEqual({
    status: "unknown",
  });
  vi.stubGlobal("fetch", async () => Response.json({ ok: true }));
  expect(await sendSlackThread({ channel: "C123", text: "hello" })).toEqual({
    status: "unknown",
  });
});
it("updates the existing analytics reply and handles API rejection without throwing", async () => {
  vi.stubEnv("SLACK_BOT_TOKEN", "test-token");
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) =>
    Response.json({ ok: false, error: "not_in_channel" }),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(
    await sendSlackThread({
      channel: "C123",
      text: "links",
      updateTs: "123.4",
    }),
  ).toEqual({ status: "failed" });
  expect(fetcher.mock.calls[0][0]).toBe("https://slack.com/api/chat.update");
  expect(JSON.parse(fetcher.mock.calls[0][1].body as string).ts).toBe("123.4");
});
