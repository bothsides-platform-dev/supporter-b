import { expect, it, vi } from "vitest";
import { clarityScript } from "../clarity-script";

function boot(href = "https://support-b.com/", referrer = "") {
  const location = { href, assign: vi.fn(), replace: vi.fn(), reload: vi.fn() };
  const insert = vi.fn();
  const listeners = new Map<string, () => void>();
  type Clarity = ((...args: unknown[]) => void) & {
    q?: unknown[][];
    v?: string;
  };
  const historyCalls = {
    pushState: vi.fn((_state: unknown, _title: string, url: string) => {
      location.href = new URL(url, location.href).href;
    }),
    replaceState: vi.fn((_state: unknown, _title: string, url: string) => {
      location.href = new URL(url, location.href).href;
    }),
  };
  const window = {
    location,
    clarity: undefined as Clarity | undefined,
    history: { ...historyCalls },
    addEventListener: (name: string, callback: () => void) =>
      listeners.set(name, callback),
  };
  const document = {
    referrer,
    createElement: () => ({}),
    getElementsByTagName: () => [{ parentNode: { insertBefore: insert } }],
  };
  new Function("window", "document", clarityScript("public-project"))(
    window,
    document,
  );
  return { window, insert, listeners, historyCalls };
}

it.each([
  "https://support-b.com/agent/authorize?state=secret",
  "https://support-b.com/login?next=%2Fagent%2Fauthorize%3Fcode_challenge%3Dsecret",
  "https://support-b.com/callback?code=secret",
])("never loads Clarity on auth entry %s", (href) => {
  expect(boot(href).insert).not.toHaveBeenCalled();
});

it("never loads Clarity when its referrer contains an auth URL", () => {
  expect(
    boot(
      "https://support-b.com/home",
      "https://support-b.com/agent/authorize?state=secret",
    ).insert,
  ).not.toHaveBeenCalled();
});

it("keeps normal visits and API metadata working", () => {
  const { window, insert } = boot(
    "https://support-b.com/?utm_source=google",
    "https://google.com/search",
  );
  expect(insert).toHaveBeenCalledWith(
    expect.objectContaining({
      async: true,
      src: "https://www.clarity.ms/tag/public-project",
    }),
    expect.anything(),
  );
  window.clarity!("set", "channel", "buyer");
  expect(Array.from(window.clarity!.q![0])).toEqual([
    "set",
    "channel",
    "buyer",
  ]);
  const api = Object.assign(vi.fn(), { v: "test" });
  window.clarity = api;
  window.history.pushState({}, "", "/home");
  window.clarity!("event", "ordinary");
  expect(api).toHaveBeenCalledWith("event", "ordinary");
  expect(window.clarity!.v).toBe("test");
});

it.each(["pushState", "replaceState"] as const)(
  "uses a full document navigation instead of exposing the auth URL through %s",
  (method) => {
    const { window, historyCalls } = boot();
    const api = vi.fn(() => {
      expect(window.location.href).toBe("https://support-b.com/");
    });
    window.clarity = api;
    window.history[method](
      {},
      "",
      "/login?next=%2Fagent%2Fauthorize%3Fstate%3Dsecret",
    );
    expect(api).toHaveBeenCalledExactlyOnceWith("stop");
    expect(historyCalls[method]).not.toHaveBeenCalled();
    expect(
      window.location[method === "pushState" ? "assign" : "replace"],
    ).toHaveBeenCalledExactlyOnceWith(
      "https://support-b.com/login?next=%2Fagent%2Fauthorize%3Fstate%3Dsecret",
    );
    expect(window.location.href).toBe("https://support-b.com/");
  },
);

it("keeps the current document URL private even when the SDK downloads late", () => {
  const { window } = boot();
  window.history.pushState({}, "", "/agent/authorize?state=secret");
  expect(window.clarity!.q!.map((args) => Array.from(args))).toEqual([
    ["stop"],
  ]);
  expect(window.location.href).toBe("https://support-b.com/");
  expect(window.location.assign).toHaveBeenCalledExactlyOnceWith(
    "https://support-b.com/agent/authorize?state=secret",
  );
});

it("keeps a previously scheduled internal SDK restart away from the auth URL", () => {
  const { window } = boot();
  const observedUrls: string[] = [];
  // The SDK invokes its internal start directly, bypassing window.clarity.
  const pendingRestart = () => observedUrls.push(window.location.href);
  window.history.pushState({}, "", "/home");
  window.history.pushState({}, "", "/agent/authorize?state=secret");
  pendingRestart();
  expect(observedUrls).toEqual(["https://support-b.com/home"]);
});

it("resolves relative auth destinations and preserves every OAuth parameter for the new document", () => {
  const { window } = boot("https://support-b.com/agent/requests/draft");
  window.history.replaceState(
    {},
    "",
    "../authorize?state=state-value&code_challenge=challenge-value&redirect_uri=http%3A%2F%2Flocalhost%3A54321%2Fcallback",
  );
  expect(window.location.replace).toHaveBeenCalledExactlyOnceWith(
    "https://support-b.com/agent/authorize?state=state-value&code_challenge=challenge-value&redirect_uri=http%3A%2F%2Flocalhost%3A54321%2Fcallback",
  );
  expect(window.location.href).toBe(
    "https://support-b.com/agent/requests/draft",
  );
});

it.each(["popstate", "hashchange"])(
  "stops and reloads an unexpected sensitive %s entry",
  (event) => {
    const { window, listeners } = boot();
    const api = vi.fn();
    window.clarity = api;
    window.location.href = "https://support-b.com/callback#code=secret";
    listeners.get(event)!();
    expect(api).toHaveBeenCalledExactlyOnceWith("stop");
    expect(window.location.reload).toHaveBeenCalledOnce();
  },
);
