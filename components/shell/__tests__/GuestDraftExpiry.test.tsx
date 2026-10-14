import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GuestDraftExpiry } from "../GuestDraftExpiry";
import {
  createGuestDraft,
  saveGuestDraft,
  GUEST_DRAFT_KEY,
} from "@/lib/guest-rfp/draft";
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T00:00:00Z"));
});
afterEach(() => vi.useRealTimers());
it("cleans expired drafts on entry and while the site stays open, and stops on unmount", () => {
  saveGuestDraft(createGuestDraft());
  vi.setSystemTime(new Date("2026-10-15T00:00:00Z"));
  const view = render(<GuestDraftExpiry />);
  expect(localStorage.getItem(GUEST_DRAFT_KEY)).toBeNull();
  saveGuestDraft(createGuestDraft());
  vi.setSystemTime(new Date("2026-10-16T00:00:00Z"));
  act(() => vi.advanceTimersByTime(60_000));
  expect(localStorage.getItem(GUEST_DRAFT_KEY)).toBeNull();
  view.unmount();
  saveGuestDraft(createGuestDraft());
  vi.setSystemTime(new Date("2026-10-17T00:00:00Z"));
  act(() => {
    vi.advanceTimersByTime(60_000);
    window.dispatchEvent(new Event("focus"));
  });
  expect(localStorage.getItem(GUEST_DRAFT_KEY)).not.toBeNull();
});
it("checks immediately when returning to a suspended tab", () => {
  saveGuestDraft(createGuestDraft());
  render(<GuestDraftExpiry />);
  vi.setSystemTime(new Date("2026-10-15T00:00:00Z"));
  act(() => window.dispatchEvent(new Event("focus")));
  expect(localStorage.getItem(GUEST_DRAFT_KEY)).toBeNull();
});
it("does not break the page when browser storage is blocked", () => {
  const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  try {
    expect(() => render(<GuestDraftExpiry />)).not.toThrow();
  } finally {
    spy.mockRestore();
  }
});


it("checks immediately when tab visibility changes", () => {
  saveGuestDraft(createGuestDraft());
  const view = render(<GuestDraftExpiry />);
  vi.setSystemTime(new Date("2026-10-15T00:00:00Z"));
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(localStorage.getItem(GUEST_DRAFT_KEY)).toBeNull();
  view.unmount();
  saveGuestDraft(createGuestDraft());
  vi.setSystemTime(new Date("2026-10-16T00:00:00Z"));
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(localStorage.getItem(GUEST_DRAFT_KEY)).not.toBeNull();
});
