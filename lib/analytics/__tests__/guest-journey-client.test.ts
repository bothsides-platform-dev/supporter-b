import { afterEach, expect, it, vi } from "vitest";
import { createJourneyRecorder } from "@/lib/guest-rfp/journey-client";
import { createFunnelAnalytics } from "../funnel";
import { publicDraftRequest } from "@/lib/guest-rfp/server-client";
const id = "10000000-0000-4000-8000-000000000001";
const owner = {
  userId: "20000000-0000-4000-8000-000000000001",
  workspaceId: "30000000-0000-4000-8000-000000000001",
};
afterEach(() => {
  vi.useRealTimers();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
it("serializes proof issuance with signup saving so a late Set-Cookie cannot replace the draft proof", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const recorder = createJourneyRecorder({
    storage: () => sessionStorage,
    request: async () => {
      await pending;
      return { enabled: true };
    },
    capture: async () => undefined,
  });
  const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetcher);
  const starting = recorder.start(id, 0);
  const savingSession = publicDraftRequest({ op: "session" });
  await Promise.resolve();
  const callsBeforeProofArrived = fetcher.mock.calls.length;
  release();
  await Promise.all([starting, savingSession]);
  expect(callsBeforeProofArrived).toBe(0);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("retries a rate-limited owner binding after reload before flushing anonymous events", async () => {
  let limited = true;
  const requests: Array<{ op: string; expected?: unknown }> = [];
  const options = {
    storage: () => sessionStorage,
    capture: async () => undefined,
    request: async (input: { op: string; expected?: unknown }) => {
      requests.push(input);
      if (input.op === "bind" && limited) throw Error("429");
      return { enabled: true };
    },
  };
  const first = createJourneyRecorder(options);
  await first.start(id, 0);
  first.track("funnel_step_view", {
    funnel_id: "acquisition",
    step_id: "member_return",
  });
  expect(await first.bind(id, owner)).toBe(false);
  limited = false;
  requests.length = 0;
  const restored = createJourneyRecorder(options);
  await restored.flush();
  await restored.flush();
  expect(requests.map((r) => r.op)).toEqual(["bind", "events"]);
  expect(requests[1].expected).toEqual(owner);
});
it("fans sanitized events to the internal collector when GA is unavailable or throws", () => {
  const collected: unknown[] = [];
  const analytics = createFunnelAnalytics({
    production: true,
    send: () => {
      throw Error("blocked");
    },
    storage: () => sessionStorage,
    observe: (name, input) => collected.push({ name, input }),
  });
  analytics.track(
    "funnel_step_error",
    { funnel_id: "questions", step_id: "industry", error_code: "secret" },
    "https://support-b.com/quote-start",
  );
  expect(collected).toHaveLength(1);
  expect(JSON.stringify(collected)).toContain("UNKNOWN");
  expect(JSON.stringify(collected)).not.toContain("secret");
});
it("queues before SDK metadata, keeps IDs on retry, and sends no answer text", async () => {
  const sent: Record<string, unknown>[] = [];
  let fail = true;
  const recorder = createJourneyRecorder({
    storage: () => sessionStorage,
    request: async (input) => {
      sent.push(input);
      if (input.op === "events" && fail) throw Error("offline");
      return { enabled: true };
    },
    capture: async () => undefined,
  });
  await recorder.start(id, 0);
  recorder.track("funnel_step_error", {
    funnel_id: "questions",
    step_id: "industry",
    error_code: "user input",
  });
  await recorder.flush();
  fail = false;
  await recorder.flush();
  const batches = sent.filter(
    (s) => s.op === "events" && (s.events as unknown[]).length,
  );
  expect(batches).toHaveLength(2);
  expect(batches[0].events).toEqual(batches[1].events);
  expect(JSON.stringify(batches)).not.toContain("user input");
});
it("clears the selected journey on logout or workspace change and ignores late analytics", async () => {
  let resolve!: (value: undefined) => void;
  const sent: Record<string, unknown>[] = [];
  const recorder = createJourneyRecorder({
    storage: () => sessionStorage,
    request: async (input) => {
      sent.push(input);
      return { enabled: true };
    },
    capture: () =>
      new Promise((r) => {
        resolve = r;
      }),
  });
  await recorder.start(id, 0);
  await recorder.bind(id, owner);
  recorder.identity({ ...owner, workspaceId: id });
  resolve(undefined);
  recorder.track("funnel_step_view", {
    funnel_id: "questions",
    step_id: "industry",
  });
  await recorder.flush();
  expect(sent.filter((s) => s.op === "events")).toHaveLength(0);
  expect(recorder.selected()).toBeNull();
});
it("uses official gtag get callbacks and allows late metadata to refresh analytics", async () => {
  const { captureJourneyAnalytics } =
    await import("@/lib/guest-rfp/journey-client");
  const commands: unknown[][] = [];
  const result = await captureJourneyAnalytics(id, "G-ABC", (...args) => {
    commands.push(args);
    (args[3] as (value: unknown) => void)(
      args[2] === "client_id" ? "123.456" : "789",
    );
  });
  expect(commands.map((c) => c.slice(0, 3))).toEqual([
    ["get", "G-ABC", "client_id"],
    ["get", "G-ABC", "session_id"],
  ]);
  expect(result?.ga).toEqual({ clientId: "123.456", sessionId: "789" });
});
it("retains a pending start and early actions across a failed start request", async () => {
  let offline = true;
  const sent: unknown[] = [];
  const recorder = createJourneyRecorder({
    storage: () => sessionStorage,
    capture: async () => undefined,
    request: async (input) => {
      if (offline) throw Error("offline");
      sent.push(input);
      return { enabled: true };
    },
  });
  expect(await recorder.start(id, 0)).toBe(true);
  recorder.track("funnel_step_complete", {
    funnel_id: "questions",
    step_id: "website",
  });
  offline = false;
  await recorder.flush();
  expect(sent).toEqual([
    expect.objectContaining({ op: "start" }),
    expect.objectContaining({
      op: "events",
      events: [expect.objectContaining({ step_id: "website" })],
    }),
  ]);
});

it("observes local journeys independently of production GA delivery", () => {
  const observe = vi.fn(),
    send = vi.fn();
  const analytics = createFunnelAnalytics({
    production: false,
    send,
    observe,
    storage: () => sessionStorage,
  });
  analytics.track(
    "funnel_step_view",
    { funnel_id: "questions", step_id: "industry" },
    "http://localhost:3001/quote-start",
  );
  expect(observe).toHaveBeenCalledTimes(1);
  expect(send).not.toHaveBeenCalled();
});
it("holds anonymous events during owner binding and sends them with verified owner context", async () => {
  let resolve!: (value: { enabled: boolean }) => void;
  const sent: unknown[] = [];
  const recorder = createJourneyRecorder({
    storage: () => sessionStorage,
    capture: async () => undefined,
    request: async (input) => {
      sent.push(input);
      return input.op === "bind"
        ? new Promise((r) => {
            resolve = r;
          })
        : { enabled: true };
    },
  });
  await recorder.start(id, 0);
  recorder.track("funnel_step_complete", {
    funnel_id: "questions",
    step_id: "website",
  });
  const binding = recorder.bind(id, owner);
  await recorder.flush();
  expect(sent).toHaveLength(2);
  resolve({ enabled: true });
  await binding;
  await recorder.flush();
  expect(sent[2]).toMatchObject({
    op: "events",
    expected: owner,
    events: [expect.objectContaining({ step_id: "website" })],
  });
});
it("completion retains remaining batches for background retry and stops collecting new actions", async () => {
  const sent: unknown[] = [];
  const recorder = createJourneyRecorder({
    storage: () => sessionStorage,
    capture: async () => undefined,
    request: async (input) => {
      sent.push(input);
      return { enabled: true };
    },
  });
  await recorder.start(id, 0);
  for (let n = 0; n < 12; n++)
    recorder.track("funnel_step_view", {
      funnel_id: "questions",
      step_id: "website",
    });
  recorder.complete();
  await recorder.flush();
  expect(recorder.selected()).not.toBeNull();
  recorder.track("funnel_step_view", {
    funnel_id: "questions",
    step_id: "industry",
  });
  await recorder.flush();
  expect(recorder.selected()).toBeNull();
  expect(JSON.stringify(sent)).not.toContain("industry");
  expect(
    (sent as { events?: unknown[] }[]).flatMap((s) => s.events ?? []),
  ).toHaveLength(12);
});

it("completes the HttpOnly proof handshake before creating the root", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({ enabled: true, ready: false })
    .mockResolvedValue({ enabled: true });
  const recorder = createJourneyRecorder({
    storage: () => sessionStorage,
    request,
    capture: async () => undefined,
  });
  await recorder.start(id, 0);
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[0][0]).toEqual(request.mock.calls[1][0]);
});

it("resumes an anonymous journey after tab storage is gone without registering an old draft", async () => {
  const requests: Array<{ op: string; events?: unknown[] }> = [];
  let available = true;
  let interrupted = true;
  const options = {
    storage: () => sessionStorage,
    capture: async () => undefined,
    request: async (input: { op: string; events?: unknown[] }) => {
      requests.push(input);
      if (interrupted) { interrupted = false; throw Error("offline"); }
      return { enabled: available };
    },
  };
  const recorder = createJourneyRecorder(options);
  await recorder.resume(id);
  recorder.track("funnel_step_complete", { funnel_id: "questions", step_id: "industry" });
  await recorder.flush();
  expect(requests.every(r => r.op === "events")).toBe(true);
  expect(requests.at(-1)?.events).toEqual([expect.objectContaining({ step_id: "industry" })]);
  expect(recorder.selected()?.draftId).toBe(id);
  sessionStorage.clear();
  available = false;
  const oldDraft = createJourneyRecorder(options);
  await oldDraft.resume(id);
  expect(oldDraft.selected()).toBeNull();
  expect(requests.some(r => r.op === "start")).toBe(false);
});

it("delivers answer snapshots only internally and packs UTF-8 batches below the body cap", async () => {
  const requests: unknown[] = [];
  const recorder = createJourneyRecorder({ storage: () => sessionStorage,
    request: async (input) => { requests.push(input); return { enabled: true }; }, capture: async () => undefined });
  await recorder.start(id, 0);
  const send = vi.fn();
  const analytics = createFunnelAnalytics({ production: true, send, storage: () => localStorage, observe: recorder.track });
  analytics.configure('G-TEST'); analytics.identify(null);
  for (let i = 0; i < 10; i++) analytics.track('funnel_step_complete', {
    funnel_id: 'questions', step_id: 'memo', journey_answer: '한'.repeat(500),
  } as never, '/quote-start');
  for (let i = 0; i < 10; i++) await recorder.flush();
  const batches = requests.filter((r) => (r as {op: string}).op === 'events') as Array<{events: Array<{answer?: string}>}>;
  expect(batches.flatMap(r => r.events)).toHaveLength(10);
  expect(batches.flatMap(r => r.events).every(e => e.answer === '한'.repeat(500))).toBe(true);
  expect(batches.every(r => new TextEncoder().encode(JSON.stringify(r)).length <= 4096)).toBe(true);
  expect(JSON.stringify(send.mock.calls)).not.toContain('한');
});
