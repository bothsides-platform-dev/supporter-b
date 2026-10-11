import { afterEach, expect, it, vi } from "vitest";
import { guestFiles, prepareGuestFiles } from "@/lib/guest-rfp/files";
import { createGuestDraft } from "@/lib/guest-rfp/draft";
afterEach(() => vi.unstubAllGlobals());
it.each(["transaction", "request"])(
  "closes IndexedDB when %s creation throws synchronously",
  async (stage) => {
    let closed = false;
    const db = {
      close: () => {
        closed = true;
      },
      transaction: () => {
        if (stage === "transaction") throw new Error("unavailable");
        return {
          objectStore: () => ({
            put: () => {
              throw new Error("unavailable");
            },
          }),
        };
      },
    };
    const request = {
      result: db,
      onsuccess: () => {},
      onupgradeneeded: () => {},
      onerror: () => {},
      onblocked: () => {},
    };
    vi.stubGlobal("indexedDB", {
      open: () => {
        queueMicrotask(() => request.onsuccess());
        return request;
      },
    });
    await expect(
      guestFiles.put("a", new File(["pdf"], "a.pdf")),
    ).rejects.toThrow("unavailable");
    expect(closed).toBe(true);
  },
);
it("closes a connection that opens after a blocked request was already rejected", async () => {
  let closed = false;
  const request = {
    result: {
      close: () => {
        closed = true;
      },
    },
    onsuccess: () => {},
    onupgradeneeded: () => {},
    onerror: () => {},
    onblocked: () => {},
  };
  vi.stubGlobal("indexedDB", {
    open: () => {
      queueMicrotask(() => request.onblocked());
      return request;
    },
  });
  await expect(guestFiles.get("a")).rejects.toThrow("다른 탭");
  request.onsuccess();
  expect(closed).toBe(true);
});
it("keeps successful uploads and the original files across a partial failure and retry", async () => {
  const draft = createGuestDraft();
  draft.files = ["a", "b"].map((id) => ({
    id,
    name: `${id}.pdf`,
    type: "application/pdf",
    size: 3,
  }));
  const originals = new Map(
    draft.files.map((f) => [f.id, new File(["pdf"], f.name, { type: f.type })]),
  );
  const uploaded: string[] = [];
  let fail = true;
  const upload = async (file: File) => {
    if (file.name === "b.pdf" && fail) throw new Error("offline");
    uploaded.push(file.name);
    return { id: file.name, name: file.name, size: file.size };
  };
  const read = async (id: string) => originals.get(id);
  await expect(
    prepareGuestFiles(draft, read, upload, () => {}),
  ).rejects.toThrow();
  expect(draft.files[0].uploaded?.id).toBe("a.pdf");
  expect(originals.size).toBe(2);
  fail = false;
  await prepareGuestFiles(draft, read, upload, () => {});
  expect(uploaded).toEqual(["a.pdf", "b.pdf"]);
  expect(draft.data.rfpFiles.map((f) => f.id)).toEqual(["a.pdf", "b.pdf"]);
});
it("blocks if an original is missing instead of silently excluding it", async () => {
  const draft = createGuestDraft();
  draft.files = [
    { id: "missing", name: "m.pdf", size: 4, type: "application/pdf" },
  ];
  await expect(
    prepareGuestFiles(
      draft,
      async () => undefined,
      vi.fn(),
      () => {},
    ),
  ).rejects.toThrow("m.pdf");
  expect(draft.data.rfpFiles).toEqual([]);
});
