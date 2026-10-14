import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createGuestDraft,
  loadGuestDraft,
  saveGuestDraft,
  guestResumeTarget,
  GUEST_DRAFT_KEY,
  RESUME_KEY,
} from "@/lib/guest-rfp/draft";
import { guestFiles } from "@/lib/guest-rfp/files";

const start = new Date("2026-10-14T00:00:00Z");
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(start);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("expires at 24 hours, clears resume, and prevents a stale tab from resurrecting answers", () => {
  const draft = createGuestDraft();
  saveGuestDraft(draft);
  localStorage.setItem(RESUME_KEY, "1");
  vi.setSystemTime(start.getTime() + 86_399_999);
  expect(loadGuestDraft()?.id).toBe(draft.id);
  vi.setSystemTime(start.getTime() + 86_400_000);
  expect(guestResumeTarget()).toBe("/home");
  expect(loadGuestDraft()).toBeNull();
  expect(localStorage.getItem(GUEST_DRAFT_KEY)).toBeNull();
  expect(localStorage.getItem(RESUME_KEY)).toBeNull();
  expect(() => saveGuestDraft(draft)).toThrow();
});

it("extends retention on successful save, but reading does not extend it", () => {
  const draft = createGuestDraft();
  saveGuestDraft(draft);
  vi.setSystemTime(start.getTime() + 43_200_000);
  draft.data.memo = "수정";
  saveGuestDraft(draft);
  vi.setSystemTime(start.getTime() + 86_400_000);
  expect(loadGuestDraft()?.data.memo).toBe("수정");
  vi.setSystemTime(start.getTime() + 129_600_000);
  expect(loadGuestDraft()).toBeNull();
});

it("gives legacy drafts one initial 24-hour window without resetting it on reads", () => {
  const draft = createGuestDraft();
  localStorage.setItem(
    GUEST_DRAFT_KEY,
    JSON.stringify({ ...draft, updatedAt: undefined }),
  );
  expect(loadGuestDraft()?.id).toBe(draft.id);
  vi.setSystemTime(start.getTime() + 86_400_000);
  expect(loadGuestDraft()).toBeNull();
});

it("retries expired original-file deletion without deleting a replacement draft or its files", async () => {
  const originals = new Set(["old", "new"]);
  let fail = true;
  vi.spyOn(guestFiles, "remove").mockImplementation(async (id) => {
    if (fail) throw new Error("blocked");
    originals.delete(id);
  });
  const draft = createGuestDraft();
  draft.files = [
    { id: "old", name: "a.pdf", size: 1, type: "application/pdf" },
  ];
  saveGuestDraft(draft);
  vi.setSystemTime(start.getTime() + 86_400_000);
  expect(loadGuestDraft()).toBeNull();
  await vi.advanceTimersByTimeAsync(0);
  const replacement = createGuestDraft();
  saveGuestDraft(replacement);
  await vi.advanceTimersByTimeAsync(0);
  fail = false;
  loadGuestDraft();
  await vi.advanceTimersByTimeAsync(0);
  expect(originals).toEqual(new Set(["new"]));
  expect(loadGuestDraft()?.id).toBe(replacement.id);
});


it("expires drafts with invalid timestamps", () => {
  for (const updatedAt of [null, "invalid"]) {
    const draft = createGuestDraft();
    localStorage.setItem(GUEST_DRAFT_KEY, JSON.stringify({ ...draft, updatedAt }));
    expect(loadGuestDraft()).toBeNull();
    expect(localStorage.getItem(GUEST_DRAFT_KEY)).toBeNull();
  }
});

it("does not extend retention when saving fails", () => {
  const draft = createGuestDraft();
  saveGuestDraft(draft);
  const savedAt = draft.updatedAt;
  const revision = draft.revision;
  vi.setSystemTime(start.getTime() + 43_200_000);
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("full", "QuotaExceededError");
  });
  expect(() => saveGuestDraft(draft)).toThrow();
  spy.mockRestore();
  expect(draft.updatedAt).toBe(savedAt);
  expect(draft.revision).toBe(revision);
  expect(loadGuestDraft()?.updatedAt).toBe(savedAt);
  vi.setSystemTime(start.getTime() + 86_400_000);
  expect(loadGuestDraft()).toBeNull();
});

it("keeps expired metadata when cleanup recording fails and retries later", async () => {
  const remove = vi.spyOn(guestFiles, "remove").mockResolvedValue(undefined);
  const draft = createGuestDraft();
  draft.files = [{ id: "old", name: "a.pdf", size: 1, type: "application/pdf" }];
  saveGuestDraft(draft);
  localStorage.setItem(RESUME_KEY, "1");
  vi.setSystemTime(start.getTime() + 86_400_000);
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("full", "QuotaExceededError");
  });
  expect(() => loadGuestDraft()).toThrow();
  spy.mockRestore();
  expect(localStorage.getItem(GUEST_DRAFT_KEY)).not.toBeNull();
  expect(localStorage.getItem(RESUME_KEY)).toBe("1");
  expect(remove).not.toHaveBeenCalled();
  expect(loadGuestDraft()).toBeNull();
  await vi.advanceTimersByTimeAsync(0);
  expect(remove).toHaveBeenCalledWith("old");
  expect(localStorage.getItem(GUEST_DRAFT_KEY)).toBeNull();
  expect(localStorage.getItem(RESUME_KEY)).toBeNull();
});
