import {
  getFunnelIdentifier,
  type FunnelEvent,
  type FunnelParams,
} from "@/lib/analytics/funnel";
import { captureGuestClarity } from "./clarity";
import { withGuestProof } from "./proof-client";
import {
  journeyAnalyticsSchema,
  journeyEventSchema,
  sanitizeJourneyEvent,
  type JourneyAnalytics,
  type JourneyEvent,
  type JourneyInput,
} from "./journey-contract";
type Owner = { userId: string; workspaceId: string };
type Selection = {
  draftId: string;
  owner?: Owner;
  pendingOwner?: Owner;
  createdAt: number;
  starting?: number;
  resuming?: boolean;
  completed?: boolean;
  retiring?: boolean;
};
const KEY = "support-b:guest-journey";
const same = (a?: Owner | null, b?: Owner | null) =>
  a?.userId === b?.userId && a?.workspaceId === b?.workspaceId;
export function createJourneyRecorder(options: {
  storage: () => Pick<Storage, "getItem" | "setItem" | "removeItem">;
  request: (
    input: JourneyInput,
  ) => Promise<{ enabled: boolean; ready?: boolean }>;
  capture: (id: string) => Promise<JourneyAnalytics | undefined>;
}) {
  let selection: Selection | null = null,
    queue: JourneyEvent[] = [],
    analytics: JourneyAnalytics | undefined;
  let loaded = false,
    sending = false,
    binding = false,
    generation = 0;
  const requestStart = (draftId: string, attachmentCount: number) =>
    withGuestProof(async () => {
      const input = { op: "start" as const, draftId, attachmentCount };
      const result = await options.request(input);
      const ready =
        result.enabled && result.ready === false
          ? await options.request(input)
          : result;
      if (ready.ready === false) throw new Error("JOURNEY_PROOF_UNAVAILABLE");
      return ready;
    });
  const persist = () => {
    try {
      if (selection)
        options.storage().setItem(KEY, JSON.stringify({ selection, queue }));
      else options.storage().removeItem(KEY);
    } catch {
      /* Memory-only when storage is blocked. */
    }
  };
  const restore = () => {
    if (loaded) return;
    loaded = true;
    try {
      const saved = JSON.parse(options.storage().getItem(KEY) ?? "null");
      if (
        saved?.selection &&
        /^[0-9a-f-]{36}$/.test(saved.selection.draftId) &&
        Date.now() - saved.selection.createdAt < 30 * 86400000
      ) {
        selection = saved.selection;
        queue = Array.isArray(saved.queue)
          ? saved.queue
              .filter((e: unknown) => journeyEventSchema.safeParse(e).success)
              .slice(-100)
          : [];
      }
    } catch {
      /* Invalid browser storage is never trusted by the server. */
    }
  };
  const clear = () => {
    generation++;
    selection = null;
    queue = [];
    analytics = undefined;
    persist();
  };
  const capture = () => {
    restore();
    if (!selection || selection.completed) return;
    const selected = selection,
      epoch = generation;
    void options
      .capture(selected.draftId)
      .then((value) => {
        if (generation === epoch && selection === selected) analytics = value;
      })
      .catch(() => {});
  };
  const flush = async () => {
    restore();
    if (
      !selection ||
      sending ||
      binding ||
      (!queue.length &&
        !analytics &&
        !selection.pendingOwner &&
        selection.starting === undefined &&
        !selection.resuming &&
        !selection.completed)
    )
      return;
    if (selection.pendingOwner) {
      await recorder.bind(selection.draftId, selection.pendingOwner);
      return;
    }
    sending = true;
    const selected = selection,
      epoch = generation,
      batch = queue.slice(0, 10),
      snapshot = analytics;
    try {
      if (selected.starting !== undefined || selected.resuming) {
        // Empty ingestion validates the existing HttpOnly proof without enrolling
        // a draft created before rollout or recreating a retired journey.
        const started = selected.resuming
          ? await options.request({ op: "events", draftId: selected.draftId, events: [] })
          : await requestStart(selected.draftId, selected.starting!);
        if (generation !== epoch || selection !== selected) return;
        if (!started.enabled) {
          clear();
          return;
        }
        delete selected.starting;
        delete selected.resuming;
        persist();
        capture();
        if (!batch.length && !snapshot) return;
      }
      const result = await options.request({
        op: "events",
        draftId: selected.draftId,
        events: batch,
        ...(selected.owner ? { expected: selected.owner } : {}),
        ...(snapshot ? { analytics: snapshot } : {}),
      });
      if (generation !== epoch || selection !== selected) return;
      if (!result.enabled) {
        clear();
        return;
      }
      const sent = new Set(batch.map((e) => e.id));
      queue = queue.filter((e) => !sent.has(e.id));
      if (analytics === snapshot) analytics = undefined;
      if (selected.completed && !queue.length) {
        if (selected.retiring)
          await options.request({
            op: "retire",
            draftId: selected.draftId,
            ...(selected.owner ? { expected: selected.owner } : {}),
          });
        if (generation === epoch) clear();
      } else persist();
    } catch {
      /* Retry the same event IDs on the next tick or page visit. */
    } finally {
      sending = false;
    }
  };
  const recorder = {
    selected() {
      restore();
      return selection;
    },
    clear,
    flush,
    capture,
    complete(deleted = false) {
      restore();
      if (selection) {
        selection.completed = true;
        selection.retiring = deleted;
        analytics = undefined;
        persist();
      }
    },
    async resume(draftId: string) {
      restore();
      if (selection?.draftId === draftId) {
        capture();
        return true;
      }
      clear();
      selection = { draftId, createdAt: Date.now(), resuming: true };
      persist();
      await flush();
      return selection?.draftId === draftId;
    },
    async start(draftId: string, attachmentCount: number) {
      restore();
      if (selection?.draftId === draftId) {
        capture();
        return true;
      }
      clear();
      selection = { draftId, createdAt: Date.now(), starting: attachmentCount };
      persist();
      const selected = selection,
        epoch = generation;
      sending = true;
      try {
        const result = await requestStart(draftId, attachmentCount);
        if (generation !== epoch) return true;
        if (!result.enabled) {
          clear();
          return false;
        }
        delete selected.starting;
        persist();
        capture();
        return true;
      } catch {
        return true;
      } finally {
        sending = false;
      }
    },
    async bind(draftId: string, owner: Owner) {
      restore();
      if (binding) return false;
      binding = true;
      if (
        selection?.draftId !== draftId ||
        (selection.owner && !same(selection.owner, owner))
      ) {
        clear();
        selection = { draftId, createdAt: Date.now() };
      }
      selection.pendingOwner = owner;
      persist();
      // Invalidate acknowledgements from an anonymous request already in flight.
      const epoch = ++generation;
      try {
        const result = await options.request({
          op: "bind",
          draftId,
          expected: owner,
        });
        if (!result.enabled || epoch !== generation) return false;
        const previous = selection;
        if (
          previous?.draftId !== draftId ||
          (previous.owner && !same(previous.owner, owner))
        )
          clear();
        selection = {
          draftId,
          owner,
          createdAt: previous?.createdAt ?? Date.now(),
        };
        persist();
        capture();
        return true;
      } catch {
        return false;
      } finally {
        binding = false;
      }
    },
    identity(owner: Owner | null) {
      restore();
      if (!selection) return;
      if (
        (selection.owner || selection.pendingOwner) &&
        !same(selection.owner ?? selection.pendingOwner, owner)
      ) {
        clear();
        return;
      }
      // Signup first binds on the server. A live owner can adopt only with proof;
      // never relabel queued anonymous events as a newly logged-in account.
      if (!selection.owner && owner) void this.bind(selection.draftId, owner);
    },
    track(name: FunnelEvent, input: FunnelParams) {
      restore();
      if (!selection || selection.completed) return;
      const event = sanitizeJourneyEvent(name, input);
      if (!event) return;
      queue.push(event);
      queue = queue.slice(-100);
      persist();
    },
  };
  return recorder;
}
export async function captureJourneyAnalytics(
  draftId: string,
  measurementId: string,
  command: (...args: unknown[]) => void = (_get, id, field, callback) =>
    getFunnelIdentifier(
      String(id),
      String(field),
      callback as (value: unknown) => void,
    ),
): Promise<JourneyAnalytics | undefined> {
  const get = (field: string) =>
    new Promise<unknown>((resolve) => {
      if (!/^G-[A-Z0-9]+$/.test(measurementId)) return resolve(undefined);
      const timer = setTimeout(() => resolve(undefined), 1500);
      try {
        command("get", measurementId, field, (value: unknown) => {
          clearTimeout(timer);
          resolve(value);
        });
      } catch {
        clearTimeout(timer);
        resolve(undefined);
      }
    });
  const [clarity, clientId, sessionId] = await Promise.all([
    captureGuestClarity(draftId, "session"),
    get("client_id"),
    get("session_id"),
  ]);
  const ga =
    typeof clientId === "string" &&
    /^\d{1,20}\.\d{1,20}$/.test(clientId) &&
    /^\d{1,20}$/.test(String(sessionId))
      ? { clientId, sessionId: String(sessionId) }
      : undefined;
  return journeyAnalyticsSchema.parse({
    observedAt: new Date().toISOString(),
    ...(clarity ? { clarity } : {}),
    ...(ga ? { ga } : {}),
  });
}
let gaId = "";
export function configureJourneyAnalytics(id?: string) {
  gaId = id ?? "";
}
export const guestJourney = createJourneyRecorder({
  storage: () => sessionStorage,
  request: async (input) => {
    const response = await fetch("/api/guest-rfp/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify(input),
    });
    if (response.status === 403 || response.status === 404)
      return { enabled: false };
    if (!response.ok) throw new Error("JOURNEY_UNAVAILABLE");
    return response.json();
  },
  capture: (id) => captureJourneyAnalytics(id, gaId),
});
